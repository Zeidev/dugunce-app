/**
 * Admin paneli HTTP katmanı — spec §6.
 *
 * Tasks 1-6 tabloları, parola/kilit mantığını, oturum middleware'ini,
 * Drizzle deposunu ve plan değiştirme servisini kurdu. Bu dosya onları
 * DIŞARI açar; eksik kalsaydı hiçbir parça erişilebilir olmazdı.
 *
 * DÖRT SESSİZ TUZAK — hepsi burada kapatılıyor:
 *
 * 1. `loginAdmin` OTURUM AÇMAZ. Yalnız kimliği doğrular ve `{ admin }`
 *    döner. Ham token'ı üretip hash'ini `createSession`'a yazmak, sonra
 *    çerezleri `Set-Cookie` ile göndermek BU route'un işidir. Atlanırsa
 *    giriş 200 döner, çerez gelmez, panel açılmaz.
 * 2. `null` → 401 `INVALID_CREDENTIALS`. Olmayan e-posta ile yanlış
 *    parola AYNI kodu almalı; ayrılırsa hesap listesi sızar.
 * 3. `setWeddingPlan` → `null` ise 404 ve route KENDİ audit'ini YAZMAZ:
 *    audit'i servis yazar, ikinci kez yazmak çift denetim kaydı üretir.
 * 4. Servisin `INVALID_PLAN` (400) hatası genel hataya YUTULMAZ.
 *
 * BEŞİNCİ TUZAK — `limit`: `Math.min/Math.max` `NaN`'de `NaN` döner,
 * yani `?limit=NaN` 100 satır tavanını SESSİZCE aşar (ölçüldü: 120
 * satır). `Number.isInteger` ile doğrulanır (`guests/service.ts` deseni).
 *
 * ALTINCI TUZAK — CSRF: çerezle kimlik doğrulanıyorsa her yazma
 * CSRF'e açıktır. `X-CSRF-Token` başlığı hem `a_csrf` çereziyle hem
 * DB'deki `csrf_hash` ile eşleşmeli (double-submit).
 */

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'
import { generateToken, hashToken, timingSafeEqualHex } from '../lib/crypto.js'
import {
  loginAdmin,
  setWeddingPlan,
  isWeddingPlan,
  WEDDING_PLANS,
  type WeddingPlan,
} from '../admin/service.js'
import { createRequireAdmin, requireRole, type RequireAdminDeps } from '../admin/middleware.js'
import { toAdminView } from '../admin/view.js'
import {
  drizzleAdminPanelDeps,
  isUserStatus,
  type AdminPanelDeps,
} from '../admin/panel-store.js'
import {
  sessionCookie,
  csrfCookie,
  clearSessionCookies,
  readCookie,
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  ADMIN_CSRF_HEADER,
  SESSION_MAX_MS,
} from '../admin/session.js'
import { createRateLimit, RATE_LIMITS } from '../middleware/rate-limit.js'
import { corsForAdmin } from '../middleware/cors.js'

/** Varsayılan sayfa boyu ve TAVAN — `store.ts` ile aynı değerler (spec §Task 7). */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

/**
 * `Set-Cookie` yolunun öneki.
 *
 * Çerezler `/api/v1/admin` yoluna kapsamlanır: admin çerezi başka bir
 * uçta (ör. davetli tarafı) tarayıcıdan gönderilmez. `path` dar tutulmazsa
 * çerez her istekte taşınır ve saldırı yüzeyi büyür.
 */
const COOKIE_PATH = '/api/v1/admin'

/**
 * Sorgu parametresini tek bir string'e indirger.
 *
 * Express `?a=1&a=2` için DİZİ döner; `Number(dizi)` `NaN` olur ve
 * `limit` sessizce tavanı deler. Dizinin ilk elemanı alınır.
 */
function queryString(req: Request, key: string): string | undefined {
  const raw = req.query[key]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const first = raw[0]
    return typeof first === 'string' ? first : undefined
  }
  return undefined
}

/**
 * `limit` — TAM SAYI doğrulaması (KOPYALANAN DESEN: `guests/service.ts`).
 *
 * `Number('NaN')` → `NaN`; `Math.min(NaN, 100)` → `NaN`; Drizzle'a `NaN`
 * gidince sınır uygulanmaz ve tavan SESSİZCE aşılır. `2.5` ise Postgres'e
 * geçersiz `LIMIT` olarak gider (500). Bu yüzden aralık değil, TAM SAYI
 * kontrol edilir.
 */
function parseLimit(req: Request): number {
  const raw = queryString(req, 'limit')
  if (raw === undefined || raw.trim() === '') return DEFAULT_LIMIT

  const n = Number(raw)
  // TAM SAYI + alt sınır. `Number.isInteger` hem `NaN` hem `2.5` hem
  // `Infinity` durumunu tek kontrolle eler.
  if (!Number.isInteger(n) || n < 1) {
    throw AppError.badRequest(
      'Sayfa boyutu en az 1 olan bir tam sayı olmalı',
      'INVALID_LIMIT',
    )
  }
  return Math.min(n, MAX_LIMIT)
}

/** `?q=` — boş/whitespace ise yok sayılır. */
function parseSearch(req: Request): string | undefined {
  const raw = queryString(req, 'q')
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseCursor(req: Request): string | undefined {
  const raw = queryString(req, 'cursor')
  return raw === undefined || raw === '' ? undefined : raw
}

/** `?plan=FREE|PREMIUM` — geçersiz değer 400 (sessizce yok sayılmaz). */
function parsePlanFilter(req: Request): WeddingPlan | undefined {
  const raw = queryString(req, 'plan')
  if (raw === undefined || raw === '') return undefined
  if (!isWeddingPlan(raw)) {
    throw AppError.badRequest('Geçersiz plan filtresi', 'INVALID_PLAN')
  }
  return raw
}

export interface CreateAdminRouterDeps {
  /** Test enjeksiyonu. Verilmezse `drizzleAdminPanelDeps()` gerçek DB'ye bağlanır. */
  store?: AdminPanelDeps
  /** Test için hız sınırını kapatır. */
  rateLimit?: boolean
  /**
   * Test için `Secure` bayrağını zorlar.
   *
   * Varsayılan: `NODE_ENV === 'production'`. Testte `true` olsaydı
   * supertest çerezi HTTP üzerinden gönderemezdi (yalnız HTTPS).
   */
  secureCookies?: boolean
}

export function createAdminRouter(deps: CreateAdminRouterDeps = {}): Router {
  const router = Router()
  const store = deps.store ?? drizzleAdminPanelDeps()

  const secure = deps.secureCookies ?? process.env['NODE_ENV'] === 'production'
  const cookieBase = { secure, path: COOKIE_PATH }

  // CORS: SPA `dugunce.com.tr/spa/`, API `api.dugunce.com.tr` — farklı origin.
  router.use(corsForAdmin())

  // Panel yanıtları cache'lenmemeli, indekslenmemeli.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  const limitEnabled = deps.rateLimit !== false
  const skip: RequestHandler = (_req, _res, next) => next()
  const loginLimiter = limitEnabled ? createRateLimit(RATE_LIMITS.adminLogin) : skip

  /**
   * Oturum kapısı — `createRequireAdmin` (Task 4) SARILIR, yeniden yazılmaz.
   *
   * Middleware `deleteSession`'ı ZORUNLU tutuyor (askıya alınmış admin'in
   * mevcut oturumu ölmeli). `AdminPanelDeps` bu metodu `store.ts`'ten
   * miras alır — ayrıca bağlamaya gerek yok.
   */
  const requireAdmin = createRequireAdmin({
    findSessionByHash: (hash) => store.findSessionByHash(hash),
    touchSession: (id, expiresAt) => store.touchSession(id, expiresAt),
    findAdminById: (id) => store.findAdminById(id),
    deleteSession: (id) => store.deleteSession(id),
  } satisfies RequireAdminDeps)

  /**
   * CSRF — double-submit (yardımcı uygulaması deseni).
   *
   * ÜÇ kontrol birden, hepsi geçmeli:
   * 1. `a_csrf` çerezi var mı (tarayıcıda gerçekten duruyor mu)
   * 2. `X-CSRF-Token` başlığı çerezle AYNI mı (saldırgan çerezi okuyamaz)
   * 3. Değerin SHA-256'sı DB'deki `csrf_hash` ile eşleşiyor mu
   *
   * Yalnız 2 yeterli değil: 1 olmadan "başlık var" demek yeterdi ve
   * oturumu olmayan bir istek yazma yapabilirdi. Yalnız 3 de yetmez:
   * hash sabit olduğu için çerezle eşleşme kontrolü tarayıcı tarafını
   * bağlar.
   *
   * Başarısızlıkta 403 `CSRF_INVALID` — 401 DEĞİL: kimlik geçerli,
   * yalnız yazma yetkisi reddedildi. 401 göndermek istemciyi gereksiz
   * yere "oturumu yenile" akışına sokardı.
   */
  async function requireCsrf(req: Request): Promise<void> {
    const rawCookie = readCookie(req.headers.cookie, ADMIN_CSRF_COOKIE)
    const rawHeader = req.headers[ADMIN_CSRF_HEADER]
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader

    if (!rawCookie || !header || rawCookie !== header) {
      throw AppError.forbidden('CSRF doğrulaması başarısız', 'CSRF_INVALID')
    }

    const sessionId = req.admin?.sessionId
    if (!sessionId) throw AppError.unauthorized('Admin oturumu gerekli')

    const stored = await store.findSessionCsrfHash(sessionId)
    // `timingSafeEqualHex` (lib/crypto) sabit zamanlı karşılaştırır.
    if (!stored || !timingSafeEqualHex(hashToken(header), stored)) {
      throw AppError.forbidden('CSRF doğrulaması başarısız', 'CSRF_INVALID')
    }
  }

  /** İstemcinin IP'si — audit ve oturum kaydı için. */
  function clientIp(req: Request): string | undefined {
    const ip = req.ip ?? req.socket.remoteAddress
    return ip ?? undefined
  }

  // -------------------------------------------------------------------
  // Auth — spec §6.1
  // -------------------------------------------------------------------

  /**
   * POST /auth/login
   *
   * OTURUMU BURADA AÇIYORUZ. `loginAdmin` çerez üretmez (Task 3 sözleşmesi);
   * yalnız kimliği doğrular. Sıra:
   *
   *   loginAdmin → null ise 401 (tek kod)
   *   → ham token + ham CSRF üret (256 bit)
   *   → SHA-256'larını `createSession` ile yaz (ham değer DB'ye GİRMEZ)
   *   → `Set-Cookie`: a_session (HttpOnly) + a_csrf (JS okur)
   *   → gövdede `{ admin }` (ham token GÖVDEDE ASLA)
   */
  router.post(
    '/auth/login',
    loginLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { email?: unknown; password?: unknown } | undefined
        const email = body?.email
        const password = body?.password

        if (typeof email !== 'string' || email.trim() === '' ||
            typeof password !== 'string' || password === '') {
          next(AppError.badRequest('E-posta ve parola gerekli'))
          return
        }

        const ip = clientIp(req)
        const result = await loginAdmin(
          { email, password, ...(ip ? { ip } : {}) },
          store,
        )

        // Olmayan e-posta ile yanlış parola AYNI yanıtı alır — sızdırmaz.
        if (!result) {
          next(AppError.unauthorized('E-posta veya parola hatalı', 'INVALID_CREDENTIALS'))
          return
        }

        const session = generateToken() // 256 bit — yalnız çerezde
        const csrf = generateToken() // 256 bit — JS okur, başlıkta geri gelir
        const expiresAt = new Date(Date.now() + SESSION_MAX_MS)
        const maxAgeSec = Math.floor(SESSION_MAX_MS / 1000)

        await store.createSession({
          adminId: result.admin.id,
          sessionHash: hashToken(session),
          csrfHash: hashToken(csrf),
          ip: ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
          expiresAt,
        })

        res.setHeader('Set-Cookie', [
          sessionCookie(session, maxAgeSec, cookieBase),
          csrfCookie(csrf, maxAgeSec, cookieBase),
        ])

        // Gövdede token YOK — `toAdminView` beyaz listesi.
        res.status(200).json({ admin: toAdminView(result.admin) })
      } catch (err) {
        // `AccountLockedError` (423) ve `AccountSuspendedError` (403)
        // `AppError`'dan türer; merkezi yakalayıcı doğru kodu üretir.
        next(err)
      }
    },
  )

  /**
   * POST /auth/logout
   *
   * Oturum satırı SİLİNİR (yalnız çerez temizlemek yetmez: çalınmış bir
   * çerez kopyası 8 saate kadar çalışırdı) ve çerezler `Max-Age=0` ile
   * temizlenir. CSRF ZORUNLU — aksi hâlde başka bir site kurbanı
   * oturumdan çıkarabilirdi (kullanılabilirlik saldırısı).
   */
  router.post(
    '/auth/logout',
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await requireCsrf(req)
        if (req.admin) await store.deleteSession(req.admin.sessionId)
        res.setHeader('Set-Cookie', clearSessionCookies(cookieBase))
        res.status(204).end()
      } catch (err) {
        next(err)
      }
    },
  )

  /**
   * GET /auth/me
   *
   * Oturumdaki admini döner. Hesap SİLİNMİŞSE `requireAdmin` 401 verir.
   */
  router.get('/auth/me', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.admin?.adminId
      if (!adminId) {
        next(AppError.unauthorized('Admin oturumu gerekli'))
        return
      }
      const row = await store.findAdminById(adminId)
      if (!row) {
        next(AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }
      res.json({ admin: toAdminView(row) })
    } catch (err) {
      next(err)
    }
  })

  // -------------------------------------------------------------------
  // Overview — spec §6.2
  // -------------------------------------------------------------------

  /**
   * GET /overview
   *
   * Sayaçlar PARALEL: altı ayrı sorgu sırayla çalışsaydı yanıt süresi
   * toplanırdı. `recentAudit` son 20 kayıt (spec §6.2).
   */
  router.get('/overview', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [userTotal, userNew, weddingTotal, weddingActive, weddingPremium, weddingFree, guests, audit] =
        await Promise.all([
          store.countUsers(),
          store.countUsersSince(sevenDaysAgo),
          store.countWeddings(),
          store.countWeddings({ status: 'ACTIVE' }),
          store.countWeddings({ plan: 'PREMIUM' }),
          store.countWeddings({ plan: 'FREE' }),
          store.countGuests(),
          store.listAuditLogs({ limit: 20 }),
        ])

      res.json({
        users: { total: userTotal, newLast7Days: userNew },
        weddings: {
          total: weddingTotal,
          active: weddingActive,
          premium: weddingPremium,
          free: weddingFree,
        },
        guests,
        recentAudit: audit.items,
      })
    } catch (err) {
      next(err)
    }
  })

  // -------------------------------------------------------------------
  // Kullanıcılar — spec §6.3
  // -------------------------------------------------------------------

  router.get('/users', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseLimit(req)
      const q = parseSearch(req)
      const cursor = parseCursor(req)

      const page = await store.listUsers({
        limit,
        ...(q !== undefined ? { q } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      })
      res.json(page)
    } catch (err) {
      next(err)
    }
  })

  router.get('/users/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params['id'] ?? '')
      const user = await store.findUserById(id)
      if (!user) {
        next(AppError.notFound('Kullanıcı bulunamadı', 'USER_NOT_FOUND'))
        return
      }
      const weddings = await store.listWeddingsForUser(id)
      res.json({ user, weddings })
    } catch (err) {
      next(err)
    }
  })

  /**
   * PATCH /users/:id
   *
   * Yalnız `status` değiştirilebilir. Gövdede başka anahtar varsa 400:
   * aksi hâlde ileride eklenecek bir alan (ör. `email`) sessizce
   * yazılabilir hâle gelirdi — panel bir yönetim aracıdır, serbest
   * güncelleme ucu değil.
   *
   * Audit YAZILIR (`USER_SUSPENDED` / `USER_ACTIVATED`, spec §5.3) —
   * plan değiştirmenin aksine burada bir SERVİS yok, kural route'ta.
   */
  router.patch('/users/:id', requireAdmin, requireRole('SUPER_ADMIN'), async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      await requireCsrf(req)

      const id = String(req.params['id'] ?? '')
      const body = (req.body ?? {}) as Record<string, unknown>
      const keys = Object.keys(body)

      if (keys.length !== 1 || keys[0] !== 'status') {
        next(AppError.badRequest('Yalnızca "status" alanı değiştirilebilir', 'INVALID_PATCH'))
        return
      }
      if (!isUserStatus(body['status'])) {
        next(AppError.badRequest('Geçersiz durum değeri', 'INVALID_STATUS'))
        return
      }

      const before = await store.findUserById(id)
      if (!before) {
        next(AppError.notFound('Kullanıcı bulunamadı', 'USER_NOT_FOUND'))
        return
      }

      const status = body['status']
      // Değişiklik yoksa audit yazma: `{ACTIVE→ACTIVE}` anlamsız bir
      // denetim kaydı üretir ve operatörün "gerçekten değişti mi"
      // sorusunu yanıtsız bırakır (Task 6'daki aynı kural).
      if (before.status !== status) {
        await store.updateUserStatus(id, status)
        await store.writeAudit({
          action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
          actorType: 'ADMIN',
          actorId: req.admin?.adminId ?? null,
          targetType: 'USER',
          targetId: id,
          metadata: { from: before.status, to: status },
          ...(clientIp(req) ? { ip: clientIp(req) as string } : {}),
        })
      }

      const after = await store.findUserById(id)
      res.json({ user: after ?? before })
    } catch (err) {
      next(err)
    }
  })

  // -------------------------------------------------------------------
  // Düğünler — spec §6.4
  // -------------------------------------------------------------------

  router.get('/weddings', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseLimit(req)
      const plan = parsePlanFilter(req)
      const q = parseSearch(req)
      const cursor = parseCursor(req)

      const page = await store.listWeddings({
        limit,
        ...(plan !== undefined ? { plan } : {}),
        ...(q !== undefined ? { q } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      })
      res.json(page)
    } catch (err) {
      next(err)
    }
  })

  router.get('/weddings/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params['id'] ?? '')
      const wedding = await store.findWeddingById(id)
      if (!wedding) {
        next(AppError.notFound('Düğün bulunamadı', 'WEDDING_NOT_FOUND'))
        return
      }
      const [members, expenseCount] = await Promise.all([
        store.listMembersForWedding(id),
        store.countExpensesForWedding(id),
      ])
      res.json({ wedding, members, expenseCount })
    } catch (err) {
      next(err)
    }
  })

  /**
   * PATCH /weddings/:id/plan — spec §6.4, KRİTİK uç.
   *
   * `setWeddingPlan` (Task 6) iş kurallarının TAMAMINI taşır: plan
   * doğrulaması, `purchasedAt`/`purchasePlatform`/`purchaseToken` yaması,
   * değişiklik yoksa kısa devre ve AUDIT. Route burada:
   *
   * - `null` → 404 (düğün yok; servis hiçbir şey yazmadı)
   * - `INVALID_PLAN` (400) → OLDUĞU GİBİ yukarı (genel 500'e yutulmaz)
   * - KENDİ AUDIT'İNİ YAZMAZ — çift kayıt olurdu
   *
   * `requireRole('SUPER_ADMIN')`: spec §6.4 "yalnız SUPER_ADMIN" diyor.
   * v1'de tek rol var ama kapı AÇIKÇA yazılı — yarın `ADMIN` rolü
   * eklendiğinde plan değiştirme kendiliğinden kapanır.
   */
  router.patch(
    '/weddings/:id/plan',
    requireAdmin,
    requireRole('SUPER_ADMIN'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await requireCsrf(req)

        const id = String(req.params['id'] ?? '')
        const body = (req.body ?? {}) as Record<string, unknown>
        const plan = body['plan']

        // Tip daraltması: servis de doğrular ama `as` ile geçirmek
        // çalışma zamanı kontrolünü gizlerdi. Burada açıkça kontrol
        // edilir ki `INVALID_PLAN` servisten ÖNCE de tutarlı dönsün.
        if (typeof plan !== 'string' || !isWeddingPlan(plan)) {
          next(
            AppError.badRequest(
              `Geçersiz plan değeri. Kabul edilenler: ${WEDDING_PLANS.join(', ')}`,
              'INVALID_PLAN',
            ),
          )
          return
        }

        const wedding = await setWeddingPlan(
          {
            weddingId: id,
            plan,
            actorId: req.admin?.adminId ?? '',
            ...(clientIp(req) ? { ip: clientIp(req) as string } : {}),
          },
          store,
        )

        if (!wedding) {
          next(AppError.notFound('Düğün bulunamadı', 'WEDDING_NOT_FOUND'))
          return
        }

        // Audit SERVİS tarafından yazıldı — burada TEKRAR YAZILMAZ.
        res.json({ wedding })
      } catch (err) {
        next(err)
      }
    },
  )

  // -------------------------------------------------------------------
  // Audit — spec §6.5, SALT OKUMA
  // -------------------------------------------------------------------

  router.get('/audit-logs', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseLimit(req)
      const action = queryString(req, 'action')
      const actorId = queryString(req, 'actorId')
      const cursor = parseCursor(req)

      const page = await store.listAuditLogs({
        limit,
        ...(action !== undefined && action !== '' ? { action } : {}),
        ...(actorId !== undefined && actorId !== '' ? { actorId } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      })
      res.json(page)
    } catch (err) {
      next(err)
    }
  })

  return router
}
