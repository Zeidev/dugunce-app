import { createHmac, timingSafeEqual } from 'node:crypto'
import { generateToken, hashToken } from '../lib/crypto.js'

/**
 * Token üretimi ve doğrulaması.
 *
 * İki token türü (design §15.1):
 * - **Access** — JWT (HS256), 15 dk, her istekte taşınır (bearer)
 * - **Refresh** — rastgele opak token, 90 gün, DB'de hash'li, rotasyonlu
 *
 * Access token'da yalnızca `userId` bulunur — hassas veri taşınmaz.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60 // 15 dakika
export const REFRESH_TOKEN_TTL_DAYS = 90

export interface AccessTokenPayload {
  userId: string
}

interface JwtHeader {
  alg: string
  typ: string
}

interface JwtBody {
  userId: string
  iat: number
  exp: number
}

function b64urlEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

/**
 * Access token imzalar (HS256).
 *
 * @param payload - `{ userId }`
 * @param secret - JWT_SECRET (min 32 karakter)
 * @param ttlSeconds - ömür (varsayılan 900 = 15 dk); test için negatif verilebilir
 */
export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000)

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' }
  const body: JwtBody = {
    userId: payload.userId,
    iat: now,
    exp: now + ttlSeconds,
  }

  const data = `${b64urlEncode(header)}.${b64urlEncode(body)}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')

  return `${data}.${sig}`
}

/**
 * Access token doğrular.
 *
 * Hata fırlatmaz — geçersizse `null` döner.
 * (SECURITY §16.1: bozuk token 401'e yol açmalı, 500'e değil.)
 */
export function verifyAccessToken(
  token: string,
  secret: string,
): AccessTokenPayload | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, bodyB64, sigB64] = parts as [string, string, string]

  try {
    const expected = createHmac('sha256', secret)
      .update(`${headerB64}.${bodyB64}`)
      .digest()
    const actual = Buffer.from(sigB64, 'base64url')

    if (expected.length !== actual.length) return null
    if (!timingSafeEqual(expected, actual)) return null

    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString(),
    ) as Partial<JwtHeader>
    if (header.alg !== 'HS256') return null

    const body = JSON.parse(
      Buffer.from(bodyB64, 'base64url').toString(),
    ) as Partial<JwtBody>

    if (typeof body.userId !== 'string') return null
    if (typeof body.exp !== 'number') return null
    if (body.exp <= Math.floor(Date.now() / 1000)) return null

    return { userId: body.userId }
  } catch {
    return null
  }
}

/**
 * Refresh token üretir — opak, 32 bayt rastgele.
 *
 * DB'ye yalnızca hash'i yazılır. Dönen `raw` kullanıcıya verilir.
 */
export function createRefreshToken(): {
  raw: string
  hash: string
  expiresAt: Date
} {
  const raw = generateToken(32)
  const hash = hashToken(raw)
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  )
  return { raw, hash, expiresAt }
}

// ---------------------------------------------------------------------------
// Refresh rotasyonu
// ---------------------------------------------------------------------------

/** Enjekte edilebilir bağımlılıklar — test için. */
export interface RefreshDeps {
  findByHash: (hash: string) => Promise<{
    id: string
    userId: string
    tokenHash?: string
    deviceLabel?: string | null
    expiresAt: Date
    revokedAt: Date | null
    lastUsedAt?: Date | null
  } | null>
  insertToken: (row: {
    userId: string
    tokenHash: string
    deviceLabel: string | null
    expiresAt: Date
  }) => Promise<unknown>
  revokeToken: (id: string) => Promise<boolean>
  revokeAllForUser: (userId: string) => Promise<number>
  /** Access token imzalamak için — yenileme sonrası yeni token üretilir. */
  jwtSecret: string
}

export interface RotateResult {
  refreshToken: string
  userId: string
  /**
   * Yeni access token.
   *
   * KRİTİK: bu alan olmadan istemci yenileme sonrası access token'ı
   * kaybediyordu (`body.accessToken` null). Sonuç: her 15 dakikada bir
   * oturum düşüyordu — kullanıcı "90 gün giriş yapıp kalsın dedik ama
   * bir saatte doluyor" diyordu.
   */
  accessToken: string
}

/**
 * Refresh token'ı döndürür (rotasyon).
 *
 * Akış:
 * 1. Hash'le, DB'de ara
 * 2. Bulunamazsa reddet
 * 3. **Revoke edilmişse** → token hırsızlığı sinyali → TÜM oturumları kapat
 * 4. Süresi dolmuşsa reddet
 * 5. Eskiyi revoke et
 * 6. Yenisini üret (aynı cihaz etiketi)
 *
 * Review Focus #5: rotasyon atlanırsa eski token 90 gün geçerli kalır.
 */
export async function rotateRefreshToken(
  raw: string,
  deps: RefreshDeps,
): Promise<RotateResult> {
  const hash = hashToken(raw)
  const record = await deps.findByHash(hash)

  if (!record) {
    throw new Error('Geçersiz yenileme tokenı')
  }

  // Token hırsızlığı tespiti: revoke edilmiş token tekrar kullanıldı
  if (record.revokedAt !== null) {
    await deps.revokeAllForUser(record.userId)
    throw new Error('Geçersiz yenileme tokenı')
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw new Error('Yenileme tokenının süresi dolmuş')
  }

  // Rotasyon: eskiyi kapat
  await deps.revokeToken(record.id)

  // Yeniyi üret
  const next = createRefreshToken()
  await deps.insertToken({
    userId: record.userId,
    tokenHash: next.hash,
    deviceLabel: record.deviceLabel ?? null,
    expiresAt: next.expiresAt,
  })

  // Yeni access token DA üretilir. Aksi halde istemci 15 dakika sonra
  // yine 401 alır ve refresh döngüsü işe yaramaz.
  const accessToken = signAccessToken({ userId: record.userId }, deps.jwtSecret)

  return { refreshToken: next.raw, userId: record.userId, accessToken }
}

/**
 * Tek bir refresh token'ı iptal eder (logout).
 *
 * Idempotent: bulunamazsa veya zaten iptal edilmişse sessizce döner.
 */
export async function revokeRefreshToken(
  raw: string,
  deps: Pick<RefreshDeps, 'findByHash' | 'revokeToken'>,
): Promise<void> {
  const record = await deps.findByHash(hashToken(raw))
  if (!record) return
  if (record.revokedAt !== null) return
  await deps.revokeToken(record.id)
}

/**
 * Kullanıcının tüm refresh token'larını iptal eder (logout-all).
 *
 * Çalınan cihaz, token hırsızlığı veya "tüm cihazlardan çık" için.
 */
export async function revokeAllUserTokens(
  userId: string,
  deps: Pick<RefreshDeps, 'revokeAllForUser'>,
): Promise<number> {
  return deps.revokeAllForUser(userId)
}
