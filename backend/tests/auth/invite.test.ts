import { describe, it, expect, vi } from 'vitest'
import {
  createInvite,
  acceptInvite,
  INVITE_TTL_MINUTES,
} from '../../src/auth/invite.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    insertInvite: vi.fn().mockResolvedValue({
      id: 'i1',
      code: 'ABC2345',
      role: 'CO_OWNER',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    }),
    findByCode: vi.fn().mockResolvedValue({
      id: 'i1',
      weddingId: 'w1',
      code: 'ABC2345',
      role: 'CO_OWNER',
      expiresAt: new Date(Date.now() + 10 * 60_000),
      usedAt: null,
    }),
    markInviteUsed: vi.fn().mockResolvedValue(true),
    insertMember: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    ...overrides,
  }
}

describe('createInvite', () => {
  it('7 karakterli kod üretir', async () => {
    const d = makeDeps()
    const r = await createInvite({ weddingId: 'w1', role: 'CO_OWNER', createdBy: 'u1' }, d)
    expect(r.code).toHaveLength(7)
  })

  it('kod karışmayan karakter setinden gelir', async () => {
    const d = makeDeps()
    const r = await createInvite({ weddingId: 'w1', role: 'CO_OWNER', createdBy: 'u1' }, d)
    expect(r.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/)
  })

  it('10 dakika geçerlilik', async () => {
    expect(INVITE_TTL_MINUTES).toBe(10)
    const d = makeDeps()
    const before = Date.now()
    await createInvite({ weddingId: 'w1', role: 'CO_OWNER', createdBy: 'u1' }, d)
    const inserted = d.insertInvite.mock.calls[0]![0] as { expiresAt: Date }
    const ttl = new Date(inserted.expiresAt).getTime() - before
    expect(ttl).toBeGreaterThan(9 * 60_000)
    expect(ttl).toBeLessThan(11 * 60_000)
  })

  it('displayName opsiyonel', async () => {
    const d = makeDeps()
    await createInvite(
      { weddingId: 'w1', role: 'CO_OWNER', createdBy: 'u1', displayName: 'Mert' },
      d,
    )
    const inserted = d.insertInvite.mock.calls[0]![0] as { displayName: string }
    expect(inserted.displayName).toBe('Mert')
  })

  it('geçersiz rol reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createInvite({ weddingId: 'w1', role: 'ADMIN' as never, createdBy: 'u1' }, d),
    ).rejects.toThrow(/rol/i)
  })
})

describe('acceptInvite', () => {
  it('geçerli kod ile üyelik oluşur', async () => {
    const d = makeDeps()
    const r = await acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)

    expect(r.weddingId).toBe('w1')
    expect(r.role).toBe('CO_OWNER')
    // İkinci argüman `tx` — transaction içinde çağrıldığının kanıtı.
    // `tx` geçirilmezse üyelik transaction DIŞINDA yazılır ve kod
    // tüketilip üyelik başarısız olursa kod yanar.
    expect(d.insertMember).toHaveBeenCalledWith(
      { weddingId: 'w1', userId: 'u2', role: 'CO_OWNER' },
      expect.anything(),
    )
  })

  it('kod büyük harfe normalize edilir (kullanıcı küçük yazsa da)', async () => {
    const d = makeDeps()
    await acceptInvite({ code: 'abc2345', userId: 'u2' }, d)
    expect(d.findByCode).toHaveBeenCalledWith('ABC2345')
  })

  it('boşluklar temizlenir', async () => {
    const d = makeDeps()
    await acceptInvite({ code: '  ABC2345  ', userId: 'u2' }, d)
    expect(d.findByCode).toHaveBeenCalledWith('ABC2345')
  })

  it('bulunamayan kod 404-benzeri hata', async () => {
    const d = makeDeps({ findByCode: vi.fn().mockResolvedValue(null) })
    await expect(acceptInvite({ code: 'YOKYOK1', userId: 'u2' }, d)).rejects.toThrow(/bulunamadı/i)
  })

  it('kullanılmış kod reddedilir', async () => {
    const d = makeDeps({
      findByCode: vi.fn().mockResolvedValue({
        id: 'i1', weddingId: 'w1', code: 'ABC2345', role: 'CO_OWNER',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      }),
    })
    await expect(acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)).rejects.toThrow(/kullanılmış/i)
  })

  it('süresi dolmuş kod reddedilir', async () => {
    const d = makeDeps({
      findByCode: vi.fn().mockResolvedValue({
        id: 'i1', weddingId: 'w1', code: 'ABC2345', role: 'CO_OWNER',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      }),
    })
    await expect(acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)).rejects.toThrow(/süre/i)
  })

  it('YARIŞ KOŞULU: markInviteUsed false dönerse reddedilir', async () => {
    const d = makeDeps({ markInviteUsed: vi.fn().mockResolvedValue(false) })
    await expect(acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)).rejects.toThrow(/kullanılmış/i)
    expect(d.insertMember).not.toHaveBeenCalled()
  })

  it('transaction içinde çalışır (kod tüket + üyelik atomik)', async () => {
    const d = makeDeps()
    await acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)
    expect(d.transaction).toHaveBeenCalledOnce()
  })

  it('zaten üye olan kullanıcı hata alır (unique constraint)', async () => {
    const d = makeDeps({
      insertMember: vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint')),
    })
    await expect(acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)).rejects.toThrow(/zaten|üye/i)
  })

  it('kod tüketimi üyelikten ÖNCE yapılır', async () => {
    const order: string[] = []
    const d = makeDeps({
      markInviteUsed: vi.fn().mockImplementation(async () => { order.push('used'); return true }),
      insertMember: vi.fn().mockImplementation(async () => { order.push('member') }),
    })
    await acceptInvite({ code: 'ABC2345', userId: 'u2' }, d)
    expect(order).toEqual(['used', 'member'])
  })
})
