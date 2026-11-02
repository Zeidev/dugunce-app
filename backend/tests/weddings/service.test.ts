import { describe, it, expect, vi } from 'vitest'
import {
  createWedding,
  listUserWeddings,
  getWedding,
  updateWedding,
  validateWeddingInput,
} from '../../src/weddings/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    insertWedding: vi.fn().mockResolvedValue({
      id: 'w1',
      coupleNames: 'Elif & Mert',
      weddingDate: new Date('2026-09-12T19:00:00Z'),
      plan: 'FREE',
      status: 'ACTIVE',
      timezone: 'Europe/Istanbul',
    }),
    insertMember: vi.fn().mockResolvedValue(undefined),
    listByUser: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    updateWedding: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    ...overrides,
  }
}

describe('validateWeddingInput', () => {
  it('geçerli girdi kabul edilir', () => {
    const r = validateWeddingInput({
      coupleNames: 'Elif & Mert',
      weddingDate: '2026-09-12T19:00:00Z',
    })
    expect(r.coupleNames).toBe('Elif & Mert')
  })

  it('coupleNames boşsa hata', () => {
    expect(() => validateWeddingInput({ coupleNames: '', weddingDate: '2026-09-12' })).toThrow()
  })

  it('coupleNames çok uzunsa hata (200 karakter)', () => {
    expect(() =>
      validateWeddingInput({ coupleNames: 'a'.repeat(201), weddingDate: '2026-09-12' }),
    ).toThrow()
  })

  it('geçersiz tarih hata', () => {
    expect(() =>
      validateWeddingInput({ coupleNames: 'A & B', weddingDate: 'gecersiz' }),
    ).toThrow()
  })

  it('Türkçe karakterler korunur', () => {
    const r = validateWeddingInput({
      coupleNames: 'Şükrü & Çağrı',
      weddingDate: '2026-09-12T19:00:00Z',
    })
    expect(r.coupleNames).toBe('Şükrü & Çağrı')
  })

  it('timezone verilmezse Europe/Istanbul', () => {
    const r = validateWeddingInput({
      coupleNames: 'A & B',
      weddingDate: '2026-09-12T19:00:00Z',
    })
    expect(r.timezone).toBe('Europe/Istanbul')
  })
})

describe('createWedding', () => {
  it('düğün oluşturur ve yaratıcıyı OWNER yapar', async () => {
    const d = makeDeps()
    const r = await createWedding(
      { userId: 'u1', input: { coupleNames: 'E & M', weddingDate: '2026-09-12T19:00:00Z' } },
      d,
    )
    expect(r.id).toBe('w1')
    expect(d.insertMember).toHaveBeenCalledOnce()

    const member = d.insertMember.mock.calls[0]![0] as {
      weddingId: string
      userId: string
      role: string
    }
    expect(member.weddingId).toBe('w1')
    expect(member.userId).toBe('u1')
    expect(member.role).toBe('OWNER')
  })

  it('transaction içinde çalışır (düğün + üyelik atomik)', async () => {
    const d = makeDeps()
    await createWedding(
      { userId: 'u1', input: { coupleNames: 'E & M', weddingDate: '2026-09-12T19:00:00Z' } },
      d,
    )
    expect(d.transaction).toHaveBeenCalledOnce()
  })

  it('üyelik eklenirken hata olursa düğün de geri alınır', async () => {
    const d = makeDeps({
      insertMember: vi.fn().mockRejectedValue(new Error('DB hatası')),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        try {
          return await fn({})
        } catch (e) {
          throw e // gerçek transaction rollback
        }
      }),
    })
    await expect(
      createWedding(
        { userId: 'u1', input: { coupleNames: 'E & M', weddingDate: '2026-09-12T19:00:00Z' } },
        d,
      ),
    ).rejects.toThrow()
  })

  it('plan FREE olarak başlar', async () => {
    const d = makeDeps()
    const r = await createWedding(
      { userId: 'u1', input: { coupleNames: 'E & M', weddingDate: '2026-09-12T19:00:00Z' } },
      d,
    )
    expect(r.plan).toBe('FREE')
  })
})

describe('listUserWeddings', () => {
  it('yalnızca kullanıcının üye olduğu düğünleri döner', async () => {
    const d = makeDeps({
      listByUser: vi.fn().mockResolvedValue([
        { id: 'w1', coupleNames: 'A & B', role: 'OWNER' },
      ]),
    })
    const r = await listUserWeddings('u1', d)
    expect(r).toHaveLength(1)
    expect(d.listByUser).toHaveBeenCalledWith('u1')
  })

  it('üye olunmayan düğün listede yok', async () => {
    const d = makeDeps({ listByUser: vi.fn().mockResolvedValue([]) })
    const r = await listUserWeddings('u1', d)
    expect(r).toEqual([])
  })
})

describe('getWedding', () => {
  it('üye olunan düğünü döner', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({ id: 'w1', coupleNames: 'A & B' }),
    })
    const r = await getWedding({ weddingId: 'w1', userId: 'u1' }, d)
    expect(r?.id).toBe('w1')
  })

  it('üye olunmayan düğün null döner (404 için)', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await getWedding({ weddingId: 'w2', userId: 'u1' }, d)
    expect(r).toBeNull()
  })

  it('sorgu weddingId + userId ile yapılır (IDOR koruması)', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    await getWedding({ weddingId: 'w2', userId: 'u1' }, d)
    expect(d.findById).toHaveBeenCalledWith('w2', 'u1')
  })
})

describe('updateWedding', () => {
  it('alanları günceller', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({ id: 'w1' }),
      updateWedding: vi.fn().mockResolvedValue({ id: 'w1', coupleNames: 'Yeni İsim' }),
    })
    const r = await updateWedding(
      { weddingId: 'w1', userId: 'u1', patch: { coupleNames: 'Yeni İsim' } },
      d,
    )
    expect(r?.coupleNames).toBe('Yeni İsim')
  })

  it('boş patch hata fırlatır', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue({ id: 'w1' }) })
    await expect(
      updateWedding({ weddingId: 'w1', userId: 'u1', patch: {} }, d),
    ).rejects.toThrow()
  })

  it('üye olunmayan düğün güncellenemez', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await updateWedding(
      { weddingId: 'w2', userId: 'u1', patch: { coupleNames: 'Hack' } },
      d,
    )
    expect(r).toBeNull()
    expect(d.updateWedding).not.toHaveBeenCalled()
  })

  it('plan/purchase alanları kullanıcı tarafından değiştirilemez', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({ id: 'w1' }),
      updateWedding: vi.fn().mockResolvedValue({ id: 'w1' }),
    })
    await updateWedding(
      {
        weddingId: 'w1',
        userId: 'u1',
        patch: { coupleNames: 'X', plan: 'PREMIUM' } as never,
      },
      d,
    )
    const passed = d.updateWedding.mock.calls[0]![0] as Record<string, unknown>
    expect(passed).not.toHaveProperty('plan')
  })
})
