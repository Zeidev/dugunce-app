import { describe, it, expect, vi } from 'vitest'
import { hashToken } from '../../src/lib/crypto.js'
import {
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  verifyAccessToken,
} from '../../src/auth/tokens.js'

/**
 * Rotasyon testleri — Review Focus #5.
 *
 * Rotasyon atlanırsa eski refresh token süresi dolana kadar (90 gün)
 * geçerli kalır. Bu, çalınmış token'ın süresiz kullanımı demektir.
 */

function makeDeps(overrides: Record<string, unknown> = {}) {
  const raw = 'raw-refresh-token-value'
  const hash = hashToken(raw)
  return {
    raw,
    hash,
    findByHash: vi.fn().mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      tokenHash: hash,
      deviceLabel: 'Pixel 8',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastUsedAt: null,
    }),
    insertToken: vi.fn().mockResolvedValue(undefined),
    revokeToken: vi.fn().mockResolvedValue(true),
    revokeAllForUser: vi.fn().mockResolvedValue(3),
    jwtSecret: 'test-secret-that-is-at-least-32-chars-long!!',
    ...overrides,
  }
}

describe('rotateRefreshToken', () => {
  it('geçerli token yeni çift döner', async () => {
    const d = makeDeps()
    const result = await rotateRefreshToken(d.raw, d)

    expect(result.refreshToken).toBeTruthy()
    expect(result.refreshToken).not.toBe(d.raw) // yeni token
    expect(d.insertToken).toHaveBeenCalledOnce()
  })

  it('eski token revoke edilir (rotasyon)', async () => {
    const d = makeDeps()
    await rotateRefreshToken(d.raw, d)
    expect(d.revokeToken).toHaveBeenCalledWith('rt1')
  })

  it('cihaz etiketi korunur', async () => {
    const d = makeDeps()
    await rotateRefreshToken(d.raw, d)
    const inserted = d.insertToken.mock.calls[0][0]
    expect(inserted.deviceLabel).toBe('Pixel 8')
  })

  it('yeni token 90 gün geçerli', async () => {
    const d = makeDeps()
    const before = Date.now()
    await rotateRefreshToken(d.raw, d)
    const inserted = d.insertToken.mock.calls[0][0]
    const ttl = new Date(inserted.expiresAt).getTime() - before
    expect(ttl).toBeGreaterThan(89 * 24 * 3600 * 1000)
    expect(ttl).toBeLessThan(91 * 24 * 3600 * 1000)
  })

  it('revoke edilmiş token reddedilir', async () => {
    const d = makeDeps({
      findByHash: vi.fn().mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(), // revoke edilmiş
      }),
    })
    await expect(rotateRefreshToken(d.raw, d)).rejects.toThrow()
  })

  it('süresi dolmuş token reddedilir', async () => {
    const d = makeDeps({
      findByHash: vi.fn().mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      }),
    })
    await expect(rotateRefreshToken(d.raw, d)).rejects.toThrow(/süre/i)
  })

  it('bulunamayan token reddedilir', async () => {
    const d = makeDeps({ findByHash: vi.fn().mockResolvedValue(null) })
    await expect(rotateRefreshToken('yok', d)).rejects.toThrow()
  })

  it('TOKEN HIRSIZLIĞI: revoke edilmiş token kullanılırsa tüm oturumlar kapanır', async () => {
    // Eski token tekrar kullanıldı = çalınmış olabilir → tüm cihazları çıkar
    const d = makeDeps({
      findByHash: vi.fn().mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(), // zaten kullanılmış/revoke
      }),
    })
    await expect(rotateRefreshToken(d.raw, d)).rejects.toThrow()
    expect(d.revokeAllForUser).toHaveBeenCalledWith('u1')
  })

  it('yeni token hash olarak saklanır, ham değil', async () => {
    const d = makeDeps()
    const result = await rotateRefreshToken(d.raw, d)
    const inserted = d.insertToken.mock.calls[0][0]

    expect(inserted.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(inserted.tokenHash).not.toBe(result.refreshToken)
    expect(inserted.tokenHash).toBe(hashToken(result.refreshToken))
  })
})

describe('revokeRefreshToken', () => {
  it('token revoke edilir', async () => {
    const d = makeDeps()
    await revokeRefreshToken(d.raw, d)
    expect(d.revokeToken).toHaveBeenCalledWith('rt1')
  })

  it('bulunamayan token sessizce geçer (idempotent logout)', async () => {
    const d = makeDeps({ findByHash: vi.fn().mockResolvedValue(null) })
    await expect(revokeRefreshToken('yok', d)).resolves.not.toThrow()
  })

  it('zaten revoke edilmiş token tekrar revoke edilmez', async () => {
    const d = makeDeps({
      findByHash: vi.fn().mockResolvedValue({
        id: 'rt1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      }),
    })
    await revokeRefreshToken(d.raw, d)
    expect(d.revokeToken).not.toHaveBeenCalled()
  })
})

describe('revokeAllUserTokens', () => {
  it('tüm tokenları revoke eder', async () => {
    const d = makeDeps()
    const count = await revokeAllUserTokens('u1', d)
    expect(d.revokeAllForUser).toHaveBeenCalledWith('u1')
    expect(count).toBe(3)
  })
})

describe('refresh — access token döner (oturum ömrü)', () => {
  /**
   * BİLDİRİLEN HATA: "90 gün giriş yapıp kalsın demiştik ama bir saatte
   * doluyor, sürekli giriş ekranına atıyor."
   *
   * KÖK NEDEN: `/auth/refresh` yalnız `refreshToken` dönüyordu;
   * `accessToken` HİÇ dönmüyordu. Mobil `body.accessToken` okuyunca
   * null alıyor, `tokens.accessToken = null` oluyor ve oturum düşüyordu.
   * Access token ömrü 15 dakika olduğu için bu her 15 dakikada bir
   * tekrarlanıyordu.
   */
  it('yenileme yanıtı accessToken İÇERİR', async () => {
    const raw = 'gecerli-refresh-token'
    const d = makeDeps({
      findByHash: vi.fn().mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      }),
    })

    const result = await rotateRefreshToken(raw, d)

    expect(result.accessToken).toBeTruthy()
    // Geçerli bir JWT olmalı (üç parça)
    expect(result.accessToken.split('.')).toHaveLength(3)
  })

  it('yenilenen access token doğrulanabilir ve doğru kullanıcıyı taşır', async () => {
    const d = makeDeps({
      findByHash: vi.fn().mockResolvedValue({
        id: 'r1',
        userId: 'kullanici-42',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
      }),
    })

    const result = await rotateRefreshToken('tok', d)
    const payload = verifyAccessToken(result.accessToken, d.jwtSecret)

    expect(payload).not.toBeNull()
    expect(payload?.userId).toBe('kullanici-42')
  })
})
