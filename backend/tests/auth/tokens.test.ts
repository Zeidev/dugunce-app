import { describe, it, expect } from 'vitest'
import {
  signAccessToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
} from '../../src/auth/tokens.js'

const SECRET = 'a'.repeat(40)

describe('signAccessToken / verifyAccessToken', () => {
  it('imzalanır ve doğrulanır', () => {
    const t = signAccessToken({ userId: 'u1' }, SECRET)
    const p = verifyAccessToken(t, SECRET)
    expect(p?.userId).toBe('u1')
  })

  it('yanlış secret ile doğrulanmaz', () => {
    const t = signAccessToken({ userId: 'u1' }, SECRET)
    expect(verifyAccessToken(t, 'b'.repeat(40))).toBeNull()
  })

  it('süresi dolmuş token null döner', () => {
    const t = signAccessToken({ userId: 'u1' }, SECRET, -1)
    expect(verifyAccessToken(t, SECRET)).toBeNull()
  })

  it('bozuk token null döner (hata fırlatmaz)', () => {
    expect(verifyAccessToken('bozuk.token.xyz', SECRET)).toBeNull()
    expect(verifyAccessToken('', SECRET)).toBeNull()
    expect(verifyAccessToken('abc', SECRET)).toBeNull()
  })

  it('15 dakika varsayılan ömür', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900)
    const t = signAccessToken({ userId: 'u1' }, SECRET)
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())
    expect(payload.exp - payload.iat).toBe(900)
  })

  it('payload userId taşır, başka hassas veri yok', () => {
    const t = signAccessToken({ userId: 'u1' }, SECRET)
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())
    expect(payload.userId).toBe('u1')
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('password')
  })

  it('farklı kullanıcılar farklı payload', () => {
    const a = verifyAccessToken(signAccessToken({ userId: 'u1' }, SECRET), SECRET)
    const b = verifyAccessToken(signAccessToken({ userId: 'u2' }, SECRET), SECRET)
    expect(a?.userId).not.toBe(b?.userId)
  })

  it('Türkçe karakterli userId bozulmaz', () => {
    const t = signAccessToken({ userId: 'kullanıcı-şğü' }, SECRET)
    expect(verifyAccessToken(t, SECRET)?.userId).toBe('kullanıcı-şğü')
  })

  it('refresh token ömrü 90 gün', () => {
    expect(REFRESH_TOKEN_TTL_DAYS).toBe(90)
  })
})
