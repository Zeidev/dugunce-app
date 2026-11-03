/**
 * Yardımcı oturumu — SECURITY §1.2 #4.
 *
 * Uzun ömürlü davet token'ı URL'de her istekte taşınmaz. Token yalnızca
 * `POST /api/v1/helper/session` gövdesinde BİR KEZ gönderilir; karşılığında
 * kısa ömürlü, sunucu tarafında iptal edilebilir bir oturum verilir.
 *
 * Kurallar:
 * - Ham oturum değeri DB'de YOK; yalnızca SHA-256 (token ile aynı kural).
 * - Kayan pencere: 30 dk kullanılmazsa ölür, kullanıldıkça ileri taşınır.
 * - Mutlak tavan 12 saat: oturum sonsuza kadar yenilenemez.
 * - CSRF: double-submit. Cookie'deki `h_csrf` ile `X-CSRF-Token` başlığı
 *   eşleşmeli; ikisi de sunucudaki hash ile doğrulanır.
 */

import { generateToken, hashToken, timingSafeEqualHex } from '../lib/crypto.js'

/** Boşta kalma süresi — her kullanımda ileri taşınır. */
export const SESSION_TTL_MS = 30 * 60 * 1000
/** Mutlak tavan — kayan pencere bunu aşamaz. */
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000
/** Yazma yükünü azaltmak için: kalan süre bunun altına inince uzat. */
export const SESSION_SLIDE_THRESHOLD_MS = 25 * 60 * 1000

export const SESSION_COOKIE = 'h_session'
export const CSRF_COOKIE = 'h_csrf'
export const CSRF_HEADER = 'x-csrf-token'

export interface SessionRecord {
  id: string
  helperId: string
  weddingId: string
  sessionHash: string
  csrfHash: string
  createdAt: Date
  lastUsedAt: Date
  expiresAt: Date
}

/** Oturum + yardımcı bilgisi (tek sorguda join). */
export interface SessionContext {
  sessionId: string
  helperId: string
  weddingId: string
  displayName: string
  coupleNames: string
  csrfHash: string
  createdAt: Date
  expiresAt: Date
  /**
   * `loadSession` oturumu uzattıysa `true`.
   *
   * Çerez ömrü 30 dk; kayan pencere veritabanında uzatılıyor ama
   * tarayıcıdaki çerez de yenilenmezse 30 dk sonra siliniyor ve
   * kullanıcı — oturum sunucuda capcanlı dururken — "geçersiz
   * bağlantı" görüyor. Çağıran taraf bu bayrağı görünce çerezleri
   * yeniden göndermeli.
   */
  renewed?: boolean
}

export interface SessionDeps {
  insertSession(values: {
    helperId: string
    weddingId: string
    sessionHash: string
    csrfHash: string
    expiresAt: Date
  }): Promise<SessionRecord>
  findByHash(hash: string): Promise<SessionContext | null>
  touch(sessionId: string, expiresAt: Date, lastUsedAt: Date): Promise<void>
  deleteByHash(hash: string): Promise<boolean>
  deleteExpiredBefore(now: Date): Promise<number>
}

export interface NewSession {
  session: string
  csrf: string
  expiresAt: Date
  record: SessionRecord
}

/**
 * Oturum açar. Token doğrulaması ÇAĞIRANIN sorumluluğunda (resolveHelperToken).
 */
export async function openSession(
  helper: { id: string; weddingId: string },
  deps: Pick<SessionDeps, 'insertSession'>,
  now: number = Date.now(),
): Promise<NewSession> {
  const session = generateToken() // 256 bit
  const csrf = generateToken() // 256 bit
  const expiresAt = new Date(now + SESSION_TTL_MS)

  const record = await deps.insertSession({
    helperId: helper.id,
    weddingId: helper.weddingId,
    sessionHash: hashToken(session),
    csrfHash: hashToken(csrf),
    expiresAt,
  })

  return { session, csrf, expiresAt, record }
}

/**
 * Oturumu çözer. Geçersiz/süresi dolmuşsa null.
 *
 * Kayan pencere burada uygulanır; `touch` her istekte değil, eşik geçilince.
 */
export async function loadSession(
  rawSession: string,
  deps: Pick<SessionDeps, 'findByHash' | 'touch'>,
  now: number = Date.now(),
): Promise<SessionContext | null> {
  if (!rawSession) return null

  const ctx = await deps.findByHash(hashToken(rawSession))
  if (!ctx) return null
  if (ctx.expiresAt.getTime() <= now) return null

  // Mutlak tavan — kayan pencere sonsuza uzamasın
  const hardDeadline = ctx.createdAt.getTime() + SESSION_MAX_MS
  if (now >= hardDeadline) return null

  // Kalan süre eşiğin altındaysa uzat (yazma yükünü sınırlar)
  if (ctx.expiresAt.getTime() - now < SESSION_SLIDE_THRESHOLD_MS) {
    const next = new Date(Math.min(now + SESSION_TTL_MS, hardDeadline))
    await deps.touch(ctx.sessionId, next, new Date(now))
    ctx.expiresAt = next
    // Çağıran taraf çerezleri de yenilemeli — yoksa tarayıcı çerezi
    // sunucudaki oturumdan önce düşer (bkz. `renewed` alanı).
    ctx.renewed = true
  }

  return ctx
}

/** CSRF double-submit doğrulaması — sabit zamanlı. */
export function verifyCsrf(rawHeader: unknown, csrfHash: string): boolean {
  if (typeof rawHeader !== 'string' || rawHeader.length === 0) return false
  return timingSafeEqualHex(hashToken(rawHeader), csrfHash)
}

// ---------------------------------------------------------------------------
// Cookie yardımcıları (bağımlılık eklemeden — Express `req.headers.cookie`)
// ---------------------------------------------------------------------------

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    if (key !== name) continue
    const raw = part.slice(idx + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  }
  return null
}

export interface CookieBase {
  /** Üretimde Secure + SameSite=None (cross-site), geliştirmede Lax. */
  secure: boolean
  path: string
}

export function sessionCookie(
  value: string,
  maxAgeSec: number,
  base: CookieBase,
): string {
  return cookieString(SESSION_COOKIE, value, maxAgeSec, base, true)
}

export function csrfCookie(value: string, maxAgeSec: number, base: CookieBase): string {
  // JS okuyabilmeli (double-submit) — HttpOnly DEĞİL
  return cookieString(CSRF_COOKIE, value, maxAgeSec, base, false)
}

export function clearSessionCookies(base: CookieBase): string[] {
  return [
    cookieString(SESSION_COOKIE, '', 0, base, true),
    cookieString(CSRF_COOKIE, '', 0, base, false),
  ]
}

function cookieString(
  name: string,
  value: string,
  maxAgeSec: number,
  base: CookieBase,
  httpOnly: boolean,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${base.path}`,
    `Max-Age=${maxAgeSec}`,
    httpOnly ? 'HttpOnly' : '',
    base.secure ? 'Secure' : '',
    // Cross-site (dugunce.com.tr → api.dugunce.com.tr) için None şart.
    `SameSite=${base.secure ? 'None' : 'Lax'}`,
  ]
  return parts.filter(Boolean).join('; ')
}
