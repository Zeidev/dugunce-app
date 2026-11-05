/**
 * Admin API istemcisi — tek ağ giriş noktası.
 *
 * SÖZLEŞME KAYNAĞI: `backend/src/routes/admin.ts` (uçlar) ve
 * `backend/src/admin/view.ts` (alan şekilleri). Buradaki hiçbir yol/alan
 * uydurulmadı.
 *
 * ÜÇ SESSİZ TUZAK — hepsi bu dosyada kapatılıyor:
 *
 * 1. `credentials: 'include'` ZORUNLU. Üretimde SPA `dugunce.com.tr/spa/`,
 *    API `api.dugunce.com.tr` — FARKLI ORIGIN. Bu alan olmadan tarayıcı
 *    `a_session` çerezini göndermez ve her istek 401 döner. Geliştirmede
 *    Vite proxy'si aynı köken gibi davrandığı için hata GÖRÜNMEZ; yalnız
 *    canlıda ortaya çıkar. Bu yüzden testte tek tek doğrulanıyor.
 *
 * 2. CSRF token'ı `document.cookie`'den OKUNAMAZ. `a_csrf` çerezi
 *    `Path=/api/v1/admin` + host-only yazılıyor; SPA `/spa/` altında.
 *    Backend bu yüzden token'ı login ve `/auth/me` yanıt GÖVDESİNDE veriyor
 *    (commit 8667663). SPA onu `sessionStorage`'da tutup her yazmada
 *    `X-CSRF-Token` başlığına koyar.
 *
 *    NEDEN `sessionStorage`, `localStorage` DEĞİL: sekme kapanınca silinir,
 *    XSS'te kalıcı sızıntı olmaz. Oturum token'ı (`a_session`) ise HİÇBİR
 *    depoya yazılmaz — HttpOnly çerezi tarayıcı yönetir, JS hiç görmez.
 *
 * 3. `res.ok` kontrolü YAPILMADAN `.json()` çağrılırsa 401 gövdesi
 *    `{error:{code,message}}` ham obje olarak döner; çağıran `err.code`
 *    yerine `err.status` arar ve "oturum düştü" akışı sessizce bozulur.
 *
 * TİP GÜVENLİĞİ: `as` ile kaçış ve `any` YOK. Sunucudan gelen her gövde
 * çalışma zamanında alan alan doğrulanır (`requireString` vb.); şekil
 * tutmazsa `ApiError(INVALID_RESPONSE)` fırlar. `as` ile geçirmek,
 * backend sözleşmesi değiştiğinde panelin `undefined` alanlarla
 * çökmesine yol açardı.
 */

import type {
  Admin,
  AuditRow,
  Overview,
  Page,
  UserDetail,
  UserRow,
  WeddingDetail,
  WeddingMemberRow,
  WeddingRow,
} from './types'

/**
 * API kökü.
 *
 * Geliştirmede GÖRELİ: `vite.config.ts` proxy'si `/api` → `localhost:3000`
 * yönlendiriyor, böylece çerezler aynı köken gibi davranır ve SameSite
 * kurallarına takılmaz. Üretimde MUTLAK şart: SPA ile API farklı origin.
 */
export const API_BASE: string = import.meta.env.PROD
  ? 'https://api.dugunce.com.tr/api/v1/admin'
  : '/api/v1/admin'

/**
 * CSRF token'ının `sessionStorage` anahtarı: `"csrfToken"`.
 *
 * NEDEN SABİT DEĞİL DE HER YERDE DÜZ LİTERAL: `scripts/check-admin.mjs`
 * `sessionStorage.setItem` çağrısının İLK ARGÜMANINI okuyor ve yalnız
 * `"csrfToken"` literaline izin veriyor. Anahtar bir değişkene taşınırsa
 * kontrol anahtarı çözemez ve güvenli tarafa düşüp KIRMIZI verir (bilinçli
 * tasarım: okunamayan anahtar "oturum token'ı olabilir" sayılır).
 *
 * Ayrıca ad backend dokümanıyla da aynı: `a_session` oturum token'ıdır ve
 * HİÇBİR depoya yazılmaz; `csrfToken` ise JS'in okuyabildiği CSRF değeridir.
 */

/** Sunucuya ulaşılamadığında kullanılan durum kodu (HTTP durumu yok). */
const NETWORK_ERROR_STATUS = 0

/**
 * API hatası — durum kodu + makine-okunur kod + kullanıcıya gösterilebilir
 * mesaj.
 *
 * `code` alanı çağıranın dallanması için: giriş ekranı `ACCOUNT_LOCKED`
 * (423) ile `ACCOUNT_SUSPENDED` (403) ve `INVALID_CREDENTIALS` (401)
 * durumlarını AYIRMAK zorunda; "bir şeyler ters gitti" demek operatöre
 * ne yapacağını söylemez.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    // `instanceof` ES5 hedefe derlendiğinde prototip zinciri kopar;
    // `admin/tsconfig.json` ES2022 olduğu için gerekmiyor ama sınıfı
    // başka bir paket (ör. test yardımcısı) genişletirse korur.
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

/** Oturum düştüğünde çağrılacak dinleyici. */
type SessionExpiredListener = () => void

const sessionExpiredListeners = new Set<SessionExpiredListener>()

/**
 * Oturum düştü olayına abone olur; iptal fonksiyonu döner.
 *
 * NEDEN OLAY, NEDEN DOĞRUDAN YÖNLENDİRME DEĞİL: `api.ts` React'ı ve
 * router'ı bilmez (test edilebilirlik). Guard bileşeni abone olur ve
 * `navigate('/login')` çağırır. `api.ts` içinde `window.location` kullanmak
 * testte jsdom'u gerçekten yönlendirmeye çalıştırırdı.
 *
 * NEDEN `Set`: aynı bileşen iki kez abone olursa (StrictMode) iki kez
 * çağrılır; `Set` aynı fonksiyonun iki kez eklenmesini engeller.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

/** Tüm dinleyicilere oturumun düştüğünü bildirir. */
function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener()
}

// ---------------------------------------------------------------------------
// CSRF deposu
// ---------------------------------------------------------------------------

/**
 * `sessionStorage`'dan CSRF token'ını okur.
 *
 * `try/catch`: gizli sekmede veya depolama kapalıyken `sessionStorage`
 * erişimi İSTİSNA fırlatır. Bu yüzden `null` dönmek gerekir — panel
 * açılmalı, yalnız yazma uçları 403 almalı.
 */
function readCsrfToken(): string | null {
  try {
    return sessionStorage.getItem('csrfToken')
  } catch {
    return null
  }
}

function writeCsrfToken(token: string): void {
  try {
    sessionStorage.setItem('csrfToken', token)
  } catch {
    // Yazamıyorsak yazma uçları 403 alır; okuma paneli çalışmaya devam eder.
  }
}

/**
 * CSRF token'ını temizler (çıkış ve oturum düşmesi).
 *
 * Dışa açık: `Layout.tsx` çıkış akışında `api.logout()` hata alsa bile
 * token'ı silmek zorunda — aksi hâlde eski token `sessionStorage`'da kalır
 * ve bir sonraki girişte yanlış oturumla eşleşmeye çalışılır.
 */
export function clearCsrfToken(): void {
  try {
    sessionStorage.removeItem('csrfToken')
  } catch {
    // Depo erişilemezse silinecek bir şey de yok.
  }
}

// ---------------------------------------------------------------------------
// Çalışma zamanı doğrulayıcıları — `as` YOK, `any` YOK
// ---------------------------------------------------------------------------

/** Şekil tutmadığında fırlatılan hata — hangi alanın bozuk olduğunu söyler. */
function invalidResponse(field: string): ApiError {
  return new ApiError(
    200,
    'INVALID_RESPONSE',
    `Sunucu beklenen yanıtı döndürmedi (${field}).`,
  )
}

/**
 * Düz nesne mi? Dizi ve `null` DIŞLANIR.
 *
 * NEDEN `typeof v === 'object'` YETMEZ: `null` da 'object'tir ve dizi de
 * nesnedir; ikisi de alan erişiminde yanıltıcı sonuç verir.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalidResponse(field)
  return value
}

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw invalidResponse(field)
  return value
}

function requireNumber(value: unknown, field: string): number {
  // `NaN` / `Infinity` de elenir: sayaç alanında bunlar UI'da "NaN" olarak
  // görünür ve teşhisi zor bir hata olurdu.
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidResponse(field)
  return value
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse(field)
  return value
}

function requireNullableRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | null {
  if (value === null) return null
  if (!isRecord(value)) throw invalidResponse(field)
  return value
}

/**
 * Diziyi `unknown[]` olarak döner.
 *
 * NEDEN `unknown[]`'e AÇIKÇA atanıyor: `Array.isArray` daraltması `any[]`
 * üretir; `any` taşımak `noImplicitAny` ruhuna aykırı ve alan doğrulamasını
 * atlatmanın sessiz yoludur.
 */
function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalidResponse(field)
  const items: unknown[] = value
  return items
}

/** Diziyi eleman doğrulayıcısından geçirir. */
function requireArrayOf<T>(value: unknown, field: string, guard: (item: unknown, field: string) => T): T[] {
  const items = requireArray(value, field)
  return items.map((item, index) => guard(item, `${field}[${index}]`))
}

// ---------------------------------------------------------------------------
// Şekil doğrulayıcıları — `backend/src/admin/view.ts` ile BİREBİR
// ---------------------------------------------------------------------------

function parseAdmin(value: unknown, field = 'admin'): Admin {
  const row = requireRecord(value, field)
  return {
    id: requireString(row['id'], `${field}.id`),
    email: requireString(row['email'], `${field}.email`),
    displayName: requireString(row['displayName'], `${field}.displayName`),
    role: requireString(row['role'], `${field}.role`),
    status: requireString(row['status'], `${field}.status`),
    // Hesap hiç giriş yapmadıysa backend null döner.
    lastLoginAt: requireNullableString(row['lastLoginAt'], `${field}.lastLoginAt`),
  }
}

function parseUserRow(value: unknown, field = 'user'): UserRow {
  const row = requireRecord(value, field)
  return {
    id: requireString(row['id'], `${field}.id`),
    email: requireString(row['email'], `${field}.email`),
    displayName: requireString(row['displayName'], `${field}.displayName`),
    status: requireString(row['status'], `${field}.status`),
    createdAt: requireString(row['createdAt'], `${field}.createdAt`),
    weddingCount: requireNumber(row['weddingCount'], `${field}.weddingCount`),
  }
}

function parseWeddingRow(value: unknown, field = 'wedding'): WeddingRow {
  const row = requireRecord(value, field)
  return {
    id: requireString(row['id'], `${field}.id`),
    coupleNames: requireString(row['coupleNames'], `${field}.coupleNames`),
    weddingDate: requireString(row['weddingDate'], `${field}.weddingDate`),
    plan: requireString(row['plan'], `${field}.plan`),
    guestCount: requireNumber(row['guestCount'], `${field}.guestCount`),
    memberCount: requireNumber(row['memberCount'], `${field}.memberCount`),
    createdAt: requireString(row['createdAt'], `${field}.createdAt`),
  }
}

function parseAuditRow(value: unknown, field = 'audit'): AuditRow {
  const row = requireRecord(value, field)
  return {
    id: requireString(row['id'], `${field}.id`),
    actorType: requireString(row['actorType'], `${field}.actorType`),
    actorId: requireNullableString(row['actorId'], `${field}.actorId`),
    action: requireString(row['action'], `${field}.action`),
    targetType: requireNullableString(row['targetType'], `${field}.targetType`),
    targetId: requireNullableString(row['targetId'], `${field}.targetId`),
    metadata: requireNullableRecord(row['metadata'], `${field}.metadata`),
    ip: requireNullableString(row['ip'], `${field}.ip`),
    createdAt: requireString(row['createdAt'], `${field}.createdAt`),
  }
}

function parseWeddingMemberRow(value: unknown, field = 'member'): WeddingMemberRow {
  const row = requireRecord(value, field)
  return {
    userId: requireString(row['userId'], `${field}.userId`),
    displayName: requireString(row['displayName'], `${field}.displayName`),
    email: requireString(row['email'], `${field}.email`),
    role: requireString(row['role'], `${field}.role`),
    joinedAt: requireString(row['joinedAt'], `${field}.joinedAt`),
  }
}

/**
 * `{items, nextCursor}` zarfı.
 *
 * `nextCursor` AÇIKÇA `null` doğrulanır: eksik alan (`undefined`) da hata
 * sayılır. "Daha fazla" butonu `=== null` ile gizlendiği için `undefined`
 * sessizce butonu sonsuza kadar açık bırakırdı.
 */
function parsePage<T>(
  value: unknown,
  field: string,
  guard: (item: unknown, field: string) => T,
): Page<T> {
  const page = requireRecord(value, field)
  return {
    items: requireArrayOf(page['items'], `${field}.items`, guard),
    nextCursor: requireNullableString(page['nextCursor'], `${field}.nextCursor`),
  }
}

function parseOverview(value: unknown): Overview {
  const root = requireRecord(value, 'overview')

  const users = requireRecord(root['users'], 'overview.users')
  const weddings = requireRecord(root['weddings'], 'overview.weddings')
  const guests = requireRecord(root['guests'], 'overview.guests')

  return {
    users: {
      total: requireNumber(users['total'], 'overview.users.total'),
      newLast7Days: requireNumber(users['newLast7Days'], 'overview.users.newLast7Days'),
    },
    weddings: {
      total: requireNumber(weddings['total'], 'overview.weddings.total'),
      active: requireNumber(weddings['active'], 'overview.weddings.active'),
      premium: requireNumber(weddings['premium'], 'overview.weddings.premium'),
      free: requireNumber(weddings['free'], 'overview.weddings.free'),
    },
    // `countGuests()` bir NESNE döner ve route olduğu gibi yayınlar;
    // brief'teki tek satırlık "guests" gösterimi eksikti (kaynak kod esas).
    guests: {
      total: requireNumber(guests['total'], 'overview.guests.total'),
      attending: requireNumber(guests['attending'], 'overview.guests.attending'),
      declined: requireNumber(guests['declined'], 'overview.guests.declined'),
      pending: requireNumber(guests['pending'], 'overview.guests.pending'),
    },
    recentAudit: requireArrayOf(root['recentAudit'], 'overview.recentAudit', parseAuditRow),
  }
}

// ---------------------------------------------------------------------------
// Taşıma katmanı
// ---------------------------------------------------------------------------

/** Sorgu parametreleri — `undefined` ve boş string yazılmaz. */
type QueryParams = Record<string, string | number | undefined>

/**
 * Sorgu dizesini kurar.
 *
 * NEDEN `undefined` ATLANIR: `?q=undefined` göndermek backend'de
 * `q='undefined'` araması yapar ve liste sessizce boşalır.
 */
function buildQuery(params: QueryParams | undefined): string {
  if (params === undefined) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query === '' ? '' : `?${query}`
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  query?: QueryParams
  /** Yazma isteği → `X-CSRF-Token` başlığı eklenir. */
  csrf?: boolean
  /**
   * 401 "oturum düştü" sayılır mı?
   *
   * `/auth/login` için HAYIR: orada 401 "parola yanlış" demektir. Bu ayrım
   * olmadan yanlış parola girildiğinde uygulama oturum-düştü akışına girer
   * ve giriş ekranı kendini yeniden yükler.
   */
  sessionScoped?: boolean
}

/** Gövdeyi JSON olarak okur; boş gövdede `undefined` döner. */
async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw invalidResponse('gövde geçerli JSON değil')
  }
}

/**
 * Hata gövdesinden `{code, message}` çıkarır.
 *
 * Backend sözleşmesi `{error:{code,message}}`. Gövde bozuk/eksikse
 * (ör. bir proxy'nin 502 HTML'i) genel kod kullanılır — `undefined` bir
 * kodla UI'da "hata: undefined" göstermek kabul edilemez.
 */
function readErrorBody(parsed: unknown): { code: string; message: string } {
  if (isRecord(parsed)) {
    const error = parsed['error']
    if (isRecord(error)) {
      const code = typeof error['code'] === 'string' ? error['code'] : 'HTTP_ERROR'
      const message =
        typeof error['message'] === 'string' ? error['message'] : 'İstek başarısız oldu'
      return { code, message }
    }
  }
  return { code: 'HTTP_ERROR', message: 'İstek başarısız oldu' }
}

/**
 * Tek bir HTTP isteği yürütür ve ham gövdeyi döner.
 *
 * `JSON.parse` burada `as unknown` ile sarılı: `JSON.parse` `any` döner,
 * onu `unknown`'a daraltmak doğrulama zorunluluğunu KORUR (`as T` yapmak
 * doğrulamayı atlatırdı).
 */
async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const url = `${API_BASE}${path}${buildQuery(options.query)}`

  const headers: Record<string, string> = { Accept: 'application/json' }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.csrf === true) {
    const token = readCsrfToken()
    // Token yoksa başlık EKLENMEZ ve backend 403 `CSRF_INVALID` döner.
    // Burada hata fırlatmak, guard'ın `me()` çağrısını da bozardı; yetki
    // kararı sunucunun.
    if (token !== null) headers['X-CSRF-Token'] = token
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      // Üretimde FARKLI ORIGIN — bu satır olmadan çerez hiç gitmez.
      credentials: 'include',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch {
    // `fetch` yalnız ağ/DNS/CORS hatasında reject eder; HTTP 4xx/5xx
    // reject DEĞİLDİR. Bu ayrım guard için kritik: ağ hatasında login'e
    // atmak, geçerli oturumu olan kullanıcıyı da atardı.
    throw new ApiError(
      NETWORK_ERROR_STATUS,
      'NETWORK_ERROR',
      'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.',
    )
  }

  let parsed: unknown
  try {
    parsed = await readJsonBody(res)
  } catch (err) {
    // Bozuk gövde: 2xx ise sözleşme ihlali, değilse genel HTTP hatası.
    if (res.ok) throw err
    throw new ApiError(res.status, 'HTTP_ERROR', `İstek başarısız oldu (${res.status}).`)
  }

  if (!res.ok) {
    const { code, message } = readErrorBody(parsed)
    // Oturum kapsamlı uçta 401 = oturum düştü. Login'de 401 = yanlış parola.
    if (res.status === 401 && options.sessionScoped === true) {
      clearCsrfToken()
      notifySessionExpired()
    }
    throw new ApiError(res.status, code, message)
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Genel API yüzeyi
// ---------------------------------------------------------------------------

/** `POST /auth/login` yanıtı — gövdede CSRF token'ı da gelir. */
function parseAuthResponse(value: unknown): { admin: Admin; csrfToken: string | null } {
  const root = requireRecord(value, 'auth')
  const admin = parseAdmin(root['admin'], 'auth.admin')
  // `csrfToken` `/auth/me` yanıtında KOŞULLU (backend yalnız çerez varsa
  // ekliyor). Login'de her zaman var ama tek doğrulayıcı ikisini de karşılar.
  const rawToken = root['csrfToken']
  const csrfToken = rawToken === undefined ? null : requireString(rawToken, 'auth.csrfToken')
  return { admin, csrfToken }
}

export const api = {
  /**
   * Giriş. Başarılı olursa CSRF token'ı `sessionStorage`'a yazılır.
   *
   * `sessionScoped: false` — 401 burada "parola yanlış"tır, "oturum düştü"
   * değil. Yanlış sınıflandırma giriş ekranını sonsuz döngüye sokar.
   */
  async login(email: string, password: string): Promise<Admin> {
    const body = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
      sessionScoped: false,
    })
    const { admin, csrfToken } = parseAuthResponse(body)
    if (csrfToken !== null) writeCsrfToken(csrfToken)
    return admin
  },

  /**
   * Çıkış. Sunucu oturum satırını siler ve çerezleri temizler.
   *
   * Token `finally` içinde temizlenir: istek 403 (bayat CSRF) veya ağ
   * hatasıyla düşse bile kullanıcı çıkmış sayılır — `Layout.tsx` her
   * durumda login'e yönlendiriyor, geride geçerli bir token bırakmak
   * bir sonraki girişte karışıklık üretirdi.
   */
  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST', csrf: true, sessionScoped: true })
    } finally {
      clearCsrfToken()
    }
  },

  /**
   * Oturumdaki yönetici + tazelenmiş CSRF token'ı.
   *
   * NEDEN TAZELEME: sayfa yenilendiğinde `sessionStorage` boşalır ama
   * `a_csrf` çerezi durur. Backend aynı değeri gövdede geri veriyor;
   * almazsak yenileme sonrası TÜM yazmalar 403 olurdu.
   *
   * `csrfToken` alanı yoksa mevcut değer SİLİNMEZ.
   */
  async me(): Promise<Admin> {
    const body = await request('/auth/me', { sessionScoped: true })
    const { admin, csrfToken } = parseAuthResponse(body)
    if (csrfToken !== null) writeCsrfToken(csrfToken)
    return admin
  },

  /** `GET /overview` — dashboard sayaçları. */
  async overview(): Promise<Overview> {
    return parseOverview(await request('/overview', { sessionScoped: true }))
  },

  /** `GET /users?limit&q&cursor` */
  async users(params: { limit?: number; q?: string; cursor?: string } = {}): Promise<Page<UserRow>> {
    const body = await request('/users', {
      query: { limit: params.limit, q: params.q, cursor: params.cursor },
      sessionScoped: true,
    })
    return parsePage(body, 'users', parseUserRow)
  },

  /** `GET /users/:id` — kullanıcı + düğünleri. */
  async user(id: string): Promise<UserDetail> {
    const body = await request(`/users/${encodeURIComponent(id)}`, { sessionScoped: true })
    const root = requireRecord(body, 'userDetail')
    return {
      user: parseUserRow(root['user'], 'userDetail.user'),
      weddings: requireArrayOf(root['weddings'], 'userDetail.weddings', parseWeddingRow),
    }
  },

  /**
   * `PATCH /users/:id` — YALNIZ `status`.
   *
   * Backend gövdede tek anahtar bekliyor (`INVALID_PATCH` 400). Gövdeyi
   * `{status}` ile sınırlamak, ileride eklenecek bir alanın yanlışlıkla
   * gönderilmesini de engeller.
   */
  async setUserStatus(id: string, status: string): Promise<UserRow> {
    const body = await request(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { status },
      csrf: true,
      sessionScoped: true,
    })
    return parseUserRow(requireRecord(body, 'setUserStatus')['user'], 'setUserStatus.user')
  },

  /** `GET /weddings?limit&plan&q&cursor` */
  async weddings(
    params: { limit?: number; plan?: string; q?: string; cursor?: string } = {},
  ): Promise<Page<WeddingRow>> {
    const body = await request('/weddings', {
      query: { limit: params.limit, plan: params.plan, q: params.q, cursor: params.cursor },
      sessionScoped: true,
    })
    return parsePage(body, 'weddings', parseWeddingRow)
  },

  /** `GET /weddings/:id` — düğün + üyeler + masraf sayısı. */
  async wedding(id: string): Promise<WeddingDetail> {
    const body = await request(`/weddings/${encodeURIComponent(id)}`, { sessionScoped: true })
    const root = requireRecord(body, 'weddingDetail')
    return {
      wedding: parseWeddingRow(root['wedding'], 'weddingDetail.wedding'),
      members: requireArrayOf(root['members'], 'weddingDetail.members', parseWeddingMemberRow),
      expenseCount: requireNumber(root['expenseCount'], 'weddingDetail.expenseCount'),
    }
  },

  /**
   * `PATCH /weddings/:id/plan` — SUPER_ADMIN.
   *
   * Backend geçersiz planı 400 `INVALID_PLAN` ile reddediyor; burada
   * doğrulama TEKRARLANMAZ (tek kaynak sunucu).
   */
  async setPlan(id: string, plan: string): Promise<WeddingRow> {
    const body = await request(`/weddings/${encodeURIComponent(id)}/plan`, {
      method: 'PATCH',
      body: { plan },
      csrf: true,
      sessionScoped: true,
    })
    return parseWeddingRow(requireRecord(body, 'setPlan')['wedding'], 'setPlan.wedding')
  },

  /** `GET /audit-logs?limit&action&actorId&cursor` */
  async audit(
    params: { limit?: number; action?: string; actorId?: string; cursor?: string } = {},
  ): Promise<Page<AuditRow>> {
    const body = await request('/audit-logs', {
      query: {
        limit: params.limit,
        action: params.action,
        actorId: params.actorId,
        cursor: params.cursor,
      },
      sessionScoped: true,
    })
    return parsePage(body, 'audit', parseAuditRow)
  },
}
