/**
 * Admin oturum middleware'i — İKİ EVREN AYRIMININ KAPISI.
 *
 * Bu dosyadaki tek bir gevşeme, normal kullanıcı kimliğiyle admin
 * paneline giriş demektir (tam yetki sızıntısı, SECURITY §1.1 /
 * Review Focus #1). Bu yüzden kurallar bilerek dardır:
 *
 * 1. KİMLİK YALNIZ `a_session` ÇEREZİNDEN okunur.
 *    `Authorization: Bearer <kullanıcı-jwt>` ASLA kabul edilmez — bu
 *    başlık kullanıcı evrenine aittir (`middleware/require-auth.ts`).
 *    İki evren tek bir başlığı paylaşırsa, bir yardımcı/kullanıcı token'ı
 *    admin oturumu açar. Bu yüzden `extractBearer` benzeri HİÇBİR kod
 *    buraya konmaz.
 *
 * 2. Ham token DB'de YOK; arama `hashToken` (SHA-256) ile yapılır.
 *    `findSessionByHash` her zaman hash alır — düz token ile sorgu
 *    yapılırsa hash'siz kayıt aranır ve eşleşme bulunmaz (ya da daha
 *    kötüsü, ham token saklanmaya başlar).
 *
 * 3. Askıya alınmış admin'in MEVCUT oturumu da ölür: her istekte
 *    `findAdminById` ile `status` okunur, `ACTIVE` değilse oturum
 *    silinir (Review Focus #2). Aksi hâlde hesabı askıya almak, çalınmış
 *    bir çerezi 8 saate kadar geçerli bırakırdı.
 *
 * 4. İki ayrı zaman aşımı vardır:
 *    - boşta kalma: `lastUsedAt + SESSION_IDLE_MS` (30 dk)
 *    - mutlak tavan: `expiresAt` (8 saat, oturum açılışında sabitlenir)
 *    `expiresAt` KAYAN PENCEREYLE İLERİ TAŞINMAZ; taşınsaydı oturum
 *    sonsuza kadar yenilenebilir hâle gelirdi. Kayan pencere yalnızca
 *    `lastUsedAt`'ı tazeler (`touchSession`).
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'
import { hashToken } from '../lib/crypto.js'
import {
  ADMIN_SESSION_COOKIE,
  SESSION_IDLE_MS,
  SESSION_SLIDE_THRESHOLD_MS,
  readCookie,
} from './session.js'

/** `req.admin` — istek boyunca taşınan admin kimliği. */
export interface AdminContext {
  adminId: string
  email: string
  role: string
  sessionId: string
}

/** Oturum satırı — `AdminDeps.findSessionByHash` dönüşüyle uyumlu. */
export interface AdminSessionLookup {
  id: string
  adminId: string
  expiresAt: Date
  lastUsedAt: Date
}

/** Admin satırının middleware'in ihtiyaç duyduğu alanları. */
export interface AdminLookup {
  id: string
  email: string
  role: string
  status: string
}

/**
 * Middleware'in veri erişim bağımlılıkları.
 *
 * `deleteSession` ZORUNLU: askıya alma/iptal yolu olmadan middleware
 * "askıya alınmış admin'in oturumunu reddet" kuralını uygulayamaz.
 * İsteğe bağlı yapılırsa yanlış kablolanmış bir store sessizce
 * oturumları geçerli bırakır — bu yüzden tip düzeyinde dayatılıyor.
 */
export interface RequireAdminDeps {
  findSessionByHash(hash: string): Promise<AdminSessionLookup | null>
  touchSession(id: string, expiresAt: Date): Promise<void>
  findAdminById(id: string): Promise<AdminLookup | null>
  deleteSession(id: string): Promise<void>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext
    }
  }
}

/**
 * Hatayı yanıta yazar.
 *
 * Middleware `next(err)` ÇAĞIRMAZ: testler ve route katmanı yanıtın
 * burada tamamlanmasını bekler (401/403 kararı verilmişse istek
 * sonlanmıştır). Gövde biçimi `errorHandler` ile aynıdır ki istemci
 * tek bir şekil görsün. Mesajlar sabittir; token, hash veya e-posta
 * gövdeye YAZILMAZ.
 */
function fail(res: Response, err: AppError): void {
  res.status(err.statusCode).json({
    error: { code: err.code, message: err.message },
  })
}

/**
 * Admin oturumunu doğrular ve `req.admin`'ı doldurur.
 *
 * Sıra KESİN — ucuz kontroller önce, DB'ye gidiş sonra:
 * çerez → hash → oturum → süre → boşta kalma → admin → durum →
 * kayan pencere → next().
 */
export function createRequireAdmin(deps: RequireAdminDeps): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. YALNIZ admin çerezi. `Authorization` başlığı BİLEREK okunmaz.
      const raw = readCookie(req.headers.cookie, ADMIN_SESSION_COOKIE)
      if (!raw) {
        fail(res, AppError.unauthorized('Admin oturumu gerekli'))
        return
      }

      // 2. Ham token asla DB'ye sorulmaz.
      const session = await deps.findSessionByHash(hashToken(raw))
      if (!session) {
        fail(res, AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }

      const now = Date.now()

      // 3. Mutlak tavan. Bu satır geri getirilemez (tavan ileri taşınmıyor),
      //    dolayısıyla silmek yarışa yol açmaz — tablo şişmesin.
      if (session.expiresAt.getTime() <= now) {
        await deps.deleteSession(session.id)
        fail(res, AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }

      // 4. Boşta kalma. Kayan pencere bunu her istekte tazeler; tazelenmezse
      //    30 dakika dokunulmayan oturum ölür.
      if (session.lastUsedAt.getTime() + SESSION_IDLE_MS <= now) {
        await deps.deleteSession(session.id)
        fail(res, AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }

      // 5. Hesabın GÜNCEL durumu — token geçerli olsa bile.
      const admin = await deps.findAdminById(session.adminId)

      // 6. Admin silinmişse oturum anlamsızdır: sil + 401.
      if (!admin) {
        await deps.deleteSession(session.id)
        fail(res, AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }

      // 7. Askıya alınmış / pasif hesabın MEVCUT oturumu da reddedilir.
      //    Oturum silinir ki bir daha denenmesin (Review Focus #2).
      if (admin.status !== 'ACTIVE') {
        await deps.deleteSession(session.id)
        // Kod, giriş akışındaki `AccountSuspendedError` ile AYNI
        // ('ACCOUNT_SUSPENDED') — istemci tek bir kod tanısın. O sınıfı
        // import etmiyoruz: `service.ts` argon2 native modülünü yükler,
        // oturum yolunun buna ihtiyacı yok.
        fail(
          res,
          AppError.forbidden(
            'Bu hesap askıya alınmış. Destek ile iletişime geçin.',
            'ACCOUNT_SUSPENDED',
          ),
        )
        return
      }

      // 8. Kayan pencere — yalnızca eşik geçildiyse yaz (yazma yükü).
      //
      //    `expiresAt` MUTLAK TAVANDIR ve DEĞİŞTİRİLMEZ: `now + IDLE` ile
      //    ileri taşınsaydı oturum 8 saatten sonra da yaşardı (sınırsız
      //    yenilenen oturum). Bu yüzden `touchSession`'a tavanın KENDİSİ
      //    verilir; tazelenen şey `lastUsedAt`'tır (store yazar).
      if (now - session.lastUsedAt.getTime() > SESSION_SLIDE_THRESHOLD_MS) {
        await deps.touchSession(session.id, session.expiresAt)
      }

      req.admin = {
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
        sessionId: session.id,
      }
      next()
    } catch (err) {
      // DB hatası vb. — 401'e çevirme, gerçek hatayı merkezi yakalayıcıya ver.
      next(err)
    }
  }
}

/**
 * Rol kapısı — `createRequireAdmin`'DEN SONRA kullanılır.
 *
 * `req.admin` yoksa da 403 döner (401 değil): middleware sırası yanlış
 * kablolanmışsa istek zaten kimliksizdir ve rol kapısı onu geçirmemeli.
 * 401 dönmek "önce oturum aç" derdi; oysa hata sunucu tarafındaki
 * zincirlemededir — sessizce açık kapı bırakmaktansa kapalı kalsın.
 */
export function requireRole(role: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.admin?.role !== role) {
      fail(res, AppError.forbidden('Bu işlem için yetkiniz yok'))
      return
    }
    next()
  }
}
