import { describe, it, expect, vi } from 'vitest'
import {
  FREE_GUEST_LIMIT,
  GuestLimitError,
  createGuest,
  createGuestsBulk,
  getGuestUsage,
} from '../../src/guests/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
    insertGuest: vi.fn().mockResolvedValue({ id: 'g1', name: 'Ayşe', rsvp: 'PENDING' }),
    insertGuests: vi.fn().mockResolvedValue([]),
    listByWedding: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 'g1' }),
    updateGuest: vi.fn(),
    softDelete: vi.fn(),
    revokeInvitations: vi.fn(),
    countActiveGuests: vi.fn().mockResolvedValue(0),
    lockWeddingForUpdate: vi.fn().mockResolvedValue(undefined),
    getPlan: vi.fn().mockResolvedValue('FREE'),
    ...overrides,
  }
}

describe('FREE_GUEST_LIMIT', () => {
  it('30 — kullanıcı kararı (2026-11-02)', () => {
    expect(FREE_GUEST_LIMIT).toBe(30)
  })
})

describe('davetli limiti (Review Focus #1)', () => {
  it('29 kayıt varken 30. davetli eklenir', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(29) })
    await expect(
      createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d),
    ).resolves.toBeDefined()
  })

  it('30 kayıt varken 31. davetli reddedilir', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(30) })
    await expect(
      createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d),
    ).rejects.toThrow(GuestLimitError)
  })

  it('limit aşımında YAZMA yapılmaz', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(30) })
    await expect(
      createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d),
    ).rejects.toThrow()
    expect(d.insertGuest).not.toHaveBeenCalled()
  })

  it('premium planda limit yok', async () => {
    const d = makeDeps({
      countActiveGuests: vi.fn().mockResolvedValue(500),
      getPlan: vi.fn().mockResolvedValue('PREMIUM'),
    })
    await expect(
      createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d),
    ).resolves.toBeDefined()
  })

  it('limit kontrolü TRANSACTION İÇİNDE yapılır (yarış koşulu)', async () => {
    const d = makeDeps()
    await createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d)
    expect(d.transaction).toHaveBeenCalled()
    const txArg = d.countActiveGuests.mock.calls[0]?.[0]
    expect(txArg).toEqual({ __tx: true })
  })

  it('düğün satırı sayımdan ÖNCE kilitlenir (TOCTOU)', async () => {
    // Kilit sayımdan sonra alınırsa iki istek ikisi de eski sayıyı görür.
    const d = makeDeps()
    await createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d)
    expect(d.lockWeddingForUpdate).toHaveBeenCalled()

    const lockOrder = d.lockWeddingForUpdate.mock.invocationCallOrder[0]!
    const countOrder = d.countActiveGuests.mock.invocationCallOrder[0]!
    expect(lockOrder).toBeLessThan(countOrder)
  })

  it('hata mesajı limiti ve mevcut sayıyı içerir', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(30) })
    await expect(
      createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d),
    ).rejects.toThrow(/30/)
  })

  it('GuestLimitError limit ve current taşır (API yanıtı için)', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(30) })
    try {
      await createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d)
      expect.fail('hata bekleniyordu')
    } catch (err) {
      expect(err).toBeInstanceOf(GuestLimitError)
      const e = err as GuestLimitError
      expect(e.limit).toBe(30)
      expect(e.current).toBe(30)
    }
  })
})

describe('createGuestsBulk — toplu ekleme', () => {
  it('limit içinde kalan toplu ekleme geçer', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(10) })
    await createGuestsBulk(
      { weddingId: 'w1', userId: 'u1', inputs: [{ name: 'A' }, { name: 'B' }] },
      d,
    )
    expect(d.insertGuests).toHaveBeenCalled()
  })

  it('toplu ekleme limiti aşarsa HİÇBİRİ eklenmez', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(25) })
    await expect(
      createGuestsBulk(
        {
          weddingId: 'w1',
          userId: 'u1',
          inputs: Array.from({ length: 10 }, (_, i) => ({ name: `G${i}` })),
        },
        d,
      ),
    ).rejects.toThrow(GuestLimitError)
    expect(d.insertGuests).not.toHaveBeenCalled()
  })

  it('tam sınıra kadar toplu ekleme geçer', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(25) })
    await createGuestsBulk(
      { weddingId: 'w1', userId: 'u1', inputs: Array.from({ length: 5 }, (_, i) => ({ name: `G${i}` })) },
      d,
    )
    expect(d.insertGuests).toHaveBeenCalled()
  })

  it('tek bir girdi geçersizse hiçbiri eklenmez', async () => {
    const d = makeDeps()
    await expect(
      createGuestsBulk(
        { weddingId: 'w1', userId: 'u1', inputs: [{ name: 'A' }, { name: '' }] },
        d,
      ),
    ).rejects.toThrow()
    expect(d.insertGuests).not.toHaveBeenCalled()
  })

  it('boş liste hata fırlatır', async () => {
    const d = makeDeps()
    await expect(
      createGuestsBulk({ weddingId: 'w1', userId: 'u1', inputs: [] }, d),
    ).rejects.toThrow()
  })

  it('tek seferde en fazla 100 kişi', async () => {
    const d = makeDeps({ getPlan: vi.fn().mockResolvedValue('PREMIUM') })
    await expect(
      createGuestsBulk(
        { weddingId: 'w1', userId: 'u1', inputs: Array.from({ length: 101 }, (_, i) => ({ name: `G${i}` })) },
        d,
      ),
    ).rejects.toThrow(/100/)
  })
})

describe('getGuestUsage', () => {
  it('limit, kullanılan ve plan döner', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(12) })
    const u = await getGuestUsage({ weddingId: 'w1', userId: 'u1' }, d)
    expect(u).toEqual({ limit: 30, used: 12, plan: 'FREE', remaining: 18 })
  })

  it('premium planda limit null', async () => {
    const d = makeDeps({
      countActiveGuests: vi.fn().mockResolvedValue(200),
      getPlan: vi.fn().mockResolvedValue('PREMIUM'),
    })
    const u = await getGuestUsage({ weddingId: 'w1', userId: 'u1' }, d)
    expect(u.limit).toBeNull()
    expect(u.remaining).toBeNull()
  })
})
