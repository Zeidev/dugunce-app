/**
 * Admin oturum çerezleri — SECURITY §1.2 #4 deseninin admin kopyası.
 *
 * DİKKAT: Bu dosya `helpers/session.ts`'ten BİLEREK bağımsızdır. Yardımcı
 * oturumu ile admin oturumu iki ayrı kimlik evrenidir; kod ya da çerez adı
 * paylaşırlarsa bir yardımcı çerezi admin oturumu açabilir — tam yetki
 * sızıntısı (Review Focus #1). Bu yüzden desen kopyalandı, isimler `a_*`.
 *
 * Kurallar (yardımcı oturumuyla aynı):
 * - Ham oturum değeri DB'de YOK; yalnızca SHA-256.
 * - Kayan pencere: 30 dk kullanılmazsa ölür, kullanıldıkça ileri taşınır.
 * - Mutlak tavan 8 saat: admin oturumu sonsuza kadar yenilenemez.
 * - CSRF: double-submit. `a_csrf` çerezi ile `x-csrf-token` başlığı eşleşmeli.
 */

/** Boşta kalma süresi — her kullanımda ileri taşınır. */
export const SESSION_IDLE_MS = 30 * 60 * 1000
/** Mutlak tavan — kayan pencere bunu aşamaz. */
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000
/** Yazma yükünü azaltmak için: kalan süre bunun altına inince uzat. */
export const SESSION_SLIDE_THRESHOLD_MS = 25 * 60 * 1000

export const ADMIN_SESSION_COOKIE = 'a_session'
export const ADMIN_CSRF_COOKIE = 'a_csrf'
export const ADMIN_CSRF_HEADER = 'x-csrf-token'

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
  return cookieString(ADMIN_SESSION_COOKIE, value, maxAgeSec, base, true)
}

export function csrfCookie(value: string, maxAgeSec: number, base: CookieBase): string {
  // JS okuyabilmeli (double-submit) — HttpOnly DEĞİL
  return cookieString(ADMIN_CSRF_COOKIE, value, maxAgeSec, base, false)
}

export function clearSessionCookies(base: CookieBase): string[] {
  return [
    cookieString(ADMIN_SESSION_COOKIE, '', 0, base, true),
    cookieString(ADMIN_CSRF_COOKIE, '', 0, base, false),
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
