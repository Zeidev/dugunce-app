import { hashToken } from '../lib/crypto.js'

/**
 * Yardımcı token'ı — doğrulama.
 *
 * Yardımcının hesabı olmadığı için (SECURITY §1.2) tek yetki kaynağı
 * URL'deki token'dır. Ham token DB'de tutulmaz; yalnızca SHA-256 hash.
 *
 * Doğrulama üç kapıdan geçer:
 * 1. Hash'le eşleşen kayıt var mı
 * 2. Token revoke edilmiş mi
 * 3. Düğün silinmiş mi
 */

/**
 * `last_seen_at` güncelleme aralığı.
 *
 * Her istekte yazmak, okuma ağırlıklı bir uçta gereksiz yazma yükü olur.
 * 5 dakika, "çift yardımcının uygulamayı açıp açmadığını görsün" için
 * yeterli hassasiyet.
 */
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000

export interface HelperTokenRow {
  id: string
  weddingId: string
  displayName: string
  tokenRevokedAt: Date | null
  lastSeenAt: Date | null
  wedding: {
    id: string
    coupleNames: string
    deletedAt: Date | null
  }
}

export interface HelperTokenDeps {
  findByTokenHash(tokenHash: string): Promise<HelperTokenRow | null>
  touchLastSeen(helperId: string): Promise<void>
}

/**
 * Ham token'ı çözer ve yardımcıyı döner.
 *
 * @returns null — token geçersiz (404)
 */
export async function resolveHelperToken(
  rawToken: string,
  deps: HelperTokenDeps,
): Promise<HelperTokenRow | null> {
  if (!rawToken) return null

  const row = await deps.findByTokenHash(hashToken(rawToken))
  if (!row) return null
  if (row.tokenRevokedAt) return null
  if (row.wedding.deletedAt) return null

  // Yan etki: son görülme. Throttle'lı, hata çözümlemeyi engellemez.
  const stale =
    row.lastSeenAt === null ||
    Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS

  if (stale) {
    try {
      await deps.touchLastSeen(row.id)
    } catch {
      // last_seen_at kritik değil — isteği düşürmesin
    }
  }

  return row
}
