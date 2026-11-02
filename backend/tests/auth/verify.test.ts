import { describe, it, expect, vi } from 'vitest'
import { verifyMagicLink } from '../../src/auth/magic-link.js'
import { hashToken } from '../../src/lib/crypto.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  const rawToken = 'raw-token-value'
  return {
    rawToken,
    findMagicLinkByHash: vi.fn().mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      shortCodeHash: hashToken('123456'),
    }),
    findMagicLinkByShortCode: vi.fn().mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      shortCodeHash: hashToken('123456'),
    }),
    markMagicLinkUsed: vi.fn().mockResolvedValue(true),
    incrementAttempts: vi.fn().mockResolvedValue(1),
    findUserById: vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      displayName: 'A',
      status: 'ACTIVE',
    }),
    issueTokens: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('verifyMagicLink — token yolu', () => {
  it('geçerli token ile çift döner', async () => {
    const d = makeDeps()
    const r = await verifyMagicLink({ token: d.rawToken, deps: d })
    expect(r.accessToken).toBe('at')
    expect(r.refreshToken).toBe('rt')
    expect(r.user.id).toBe('u1')
  })

  it('token hash ile aranır (ham değil)', async () => {
    const d = makeDeps()
    await verifyMagicLink({ token: d.rawToken, deps: d })
    expect(d.findMagicLinkByHash).toHaveBeenCalledWith(hashToken(d.rawToken))
  })

  it('kullanılmış token reddedilir', async () => {
    const d = makeDeps({
      findMagicLinkByHash: vi.fn().mockResolvedValue({
        id: 'm1', userId: 'u1', attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      }),
    })
    await expect(verifyMagicLink({ token: 'x', deps: d })).rejects.toThrow(/geçersiz|kullanılmış/i)
  })

  it('süresi dolmuş token reddedilir', async () => {
    const d = makeDeps({
      findMagicLinkByHash: vi.fn().mockResolvedValue({
        id: 'm1', userId: 'u1', attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      }),
    })
    await expect(verifyMagicLink({ token: 'x', deps: d })).rejects.toThrow(/süre/i)
  })

  it('bulunamayan token genel hata verir (enumeration koruması)', async () => {
    const d = makeDeps({ findMagicLinkByHash: vi.fn().mockResolvedValue(null) })
    await expect(verifyMagicLink({ token: 'yok', deps: d })).rejects.toThrow(/geçersiz/i)
  })

  it('REVIEW FOCUS #4 — yarış koşulu: markMagicLinkUsed false dönerse reddedilir', async () => {
    // İki eşzamanlı istek; biri UPDATE'i kazandı, diğeri 0 satır güncelledi
    const d = makeDeps({ markMagicLinkUsed: vi.fn().mockResolvedValue(false) })
    await expect(verifyMagicLink({ token: 'x', deps: d })).rejects.toThrow(/geçersiz|kullanılmış/i)
  })

  it('başarılı doğrulamada last_login güncellenir', async () => {
    const d = makeDeps()
    await verifyMagicLink({ token: d.rawToken, deps: d })
    expect(d.touchLastLogin).toHaveBeenCalledWith('u1')
  })

  it('askıya alınmış kullanıcı giriş yapamaz', async () => {
    const d = makeDeps({
      findUserById: vi.fn().mockResolvedValue({ id: 'u1', status: 'SUSPENDED' }),
    })
    await expect(verifyMagicLink({ token: d.rawToken, deps: d })).rejects.toThrow(/kullanılamıyor|yetki/i)
  })

  it('silinmiş kullanıcı giriş yapamaz', async () => {
    const d = makeDeps({
      findUserById: vi.fn().mockResolvedValue({ id: 'u1', status: 'DELETED' }),
    })
    await expect(verifyMagicLink({ token: d.rawToken, deps: d })).rejects.toThrow()
  })

  it('DB\'de olmayan kullanıcı reddedilir', async () => {
    const d = makeDeps({ findUserById: vi.fn().mockResolvedValue(null) })
    await expect(verifyMagicLink({ token: d.rawToken, deps: d })).rejects.toThrow()
  })
})

describe('verifyMagicLink — kod yolu', () => {
  it('doğru kod ile çift döner', async () => {
    const d = makeDeps()
    const r = await verifyMagicLink({ code: '123456', deps: d })
    expect(r.accessToken).toBe('at')
  })

  it('yanlış kod reddedilir ve attempts artar', async () => {
    const d = makeDeps()
    await expect(verifyMagicLink({ code: '999999', deps: d })).rejects.toThrow(/kod/i)
    expect(d.incrementAttempts).toHaveBeenCalledWith('m1')
  })

  it('3 hatalı denemeden sonra token kapanır', async () => {
    const d = makeDeps({
      findMagicLinkByShortCode: vi.fn().mockResolvedValue({
        id: 'm1', userId: 'u1', attempts: 3,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        shortCodeHash: hashToken('123456'),
      }),
    })
    await expect(verifyMagicLink({ code: '123456', deps: d })).rejects.toThrow(/deneme/i)
  })

  it('kod yoksa token yolu zorunlu', async () => {
    const d = makeDeps()
    await expect(verifyMagicLink({ deps: d })).rejects.toThrow(/token|kod/i)
  })
})
