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
