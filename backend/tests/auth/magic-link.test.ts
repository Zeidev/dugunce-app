import { describe, it, expect, vi } from 'vitest'
import { requestMagicLink, normalizeEmail, MAGIC_LINK_TTL_MINUTES } from '../../src/auth/magic-link.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', displayName: 'A' }),
    insertMagicLink: vi.fn().mockResolvedValue(undefined),
    invalidatePreviousLinks: vi.fn().mockResolvedValue(0),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('normalizeEmail', () => {
  it('küçük harfe çevirir ve boşluk temizler', () => {
    expect(normalizeEmail('  Ali@Ornek.COM  ')).toBe('ali@ornek.com')
  })

  it('geçersiz e-posta hata fırlatır', () => {
    expect(() => normalizeEmail('gecersiz')).toThrow()
    expect(() => normalizeEmail('')).toThrow()
    expect(() => normalizeEmail('a@')).toThrow()
  })

  it('Türkçe karakterli e-posta kabul edilir', () => {
    expect(normalizeEmail('çağrı@örnek.com')).toBe('çağrı@örnek.com')
  })
})

describe('requestMagicLink', () => {
  it('bilinmeyen e-posta için kullanıcı oluşturur', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    expect(d.createUser).toHaveBeenCalledOnce()
  })

  it('mevcut kullanıcı için yeni kullanıcı oluşturmaz', async () => {
    const d = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' }),
    })
    await requestMagicLink({ email: 'a@b.com', deps: d })
    expect(d.createUser).not.toHaveBeenCalled()
  })

  it('e-posta normalize edilerek aranır', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: '  Ali@Ornek.COM ', deps: d })
    expect(d.findUserByEmail).toHaveBeenCalledWith('ali@ornek.com')
  })

  it('token HASH olarak saklanır, ham değil', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    const inserted = d.insertMagicLink.mock.calls[0]![0] as { tokenHash: string }
    expect(inserted.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gönderilen e-posta ham token içerir ama hash içermez', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    const inserted = d.insertMagicLink.mock.calls[0]![0] as { tokenHash: string }
    const emailArg = JSON.stringify(d.sendEmail.mock.calls[0]![0])
    expect(emailArg).not.toContain(inserted.tokenHash)
  })

  it('5 dakika geçerlilik', async () => {
    expect(MAGIC_LINK_TTL_MINUTES).toBe(5)
    const d = makeDeps()
    const before = Date.now()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    const inserted = d.insertMagicLink.mock.calls[0]![0] as { expiresAt: Date }
    const ttlMs = new Date(inserted.expiresAt).getTime() - before
    expect(ttlMs).toBeGreaterThan(4 * 60 * 1000)
    expect(ttlMs).toBeLessThan(6 * 60 * 1000)
  })

  it('önceki kullanılmamış linkler geçersiz kılınır', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    expect(d.invalidatePreviousLinks).toHaveBeenCalledWith('u1')
  })

  it('6 haneli yedek kod üretilir ve hash\'i saklanır', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    const inserted = d.insertMagicLink.mock.calls[0]![0] as { shortCodeHash: string }
    expect(inserted.shortCodeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gönderilen kod 6 hane', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    const emailArg = d.sendEmail.mock.calls[0]![0] as { code: string }
    expect(emailArg.code).toMatch(/^\d{6}$/)
  })

  it('linke ham token gömülür', async () => {
    const d = makeDeps()
    await requestMagicLink({ email: 'a@b.com', deps: d })
    const emailArg = d.sendEmail.mock.calls[0]![0] as { link: string }
    expect(emailArg.link).toMatch(/^https:\/\/dugunce\.com\.tr\/auth#/)
    expect(emailArg.link.split('#')[1]!.length).toBeGreaterThan(20)
  })

  it('e-posta gönderimi başarısızsa hata fırlatır', async () => {
    const d = makeDeps({ sendEmail: vi.fn().mockRejectedValue(new Error('smtp down')) })
    await expect(requestMagicLink({ email: 'a@b.com', deps: d })).rejects.toThrow()
  })

  it('geçersiz e-posta formatı hata fırlatır', async () => {
    const d = makeDeps()
    await expect(requestMagicLink({ email: 'gecersiz', deps: d })).rejects.toThrow()
  })

  it('askıya alınmış kullanıcıya link gönderilmez', async () => {
    const d = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', status: 'SUSPENDED' }),
    })
    await expect(requestMagicLink({ email: 'a@b.com', deps: d })).rejects.toThrow()
    expect(d.sendEmail).not.toHaveBeenCalled()
  })
})
