import { describe, it, expect, vi } from 'vitest'
import { createWedding, updateWedding, weddingInputSchema } from '../../src/weddings/service.js'

function makeDeps(existing: Record<string, unknown> = {}) {
  const record = {
    id: 'w1',
    coupleNames: 'A & B',
    weddingDate: new Date('2026-09-12T19:00:00Z'),
    partySizeEnabled: true,
    defaultPartySize: 2,
    maxPartySize: 10,
    ...existing,
  }
  return {
    findById: vi.fn().mockResolvedValue(record),
    updateWedding: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
      ...record,
      ...patch,
    })),
  } as any
}

describe('kisi sayisi ayarlari — dogrulama', () => {
  it('uc alan birlikte kaydedilir', async () => {
    const d = makeDeps()
    await updateWedding(
      {
        weddingId: 'w1',
        userId: 'u1',
        patch: { partySizeEnabled: false, defaultPartySize: 3, maxPartySize: 6 },
      },
      d,
    )
    expect(d.updateWedding).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        partySizeEnabled: false,
        defaultPartySize: 3,
        maxPartySize: 6,
      }),
    )
  })

  it('varsayilan azamiyi gecerse 400 PARTY_SIZE_INCONSISTENT', async () => {
    const d = makeDeps({ defaultPartySize: 2, maxPartySize: 10 })
    await expect(
      updateWedding(
        {
          weddingId: 'w1',
          userId: 'u1',
          patch: { defaultPartySize: 8, maxPartySize: 4 },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'PARTY_SIZE_INCONSISTENT' })
    expect(d.updateWedding).not.toHaveBeenCalled()
  })

  it('yalniz max dusurulurse mevcut default ile karsilastirilir', async () => {
    const d = makeDeps({ defaultPartySize: 5, maxPartySize: 10 })
    await expect(
      updateWedding(
        { weddingId: 'w1', userId: 'u1', patch: { maxPartySize: 3 } },
        d,
      ),
    ).rejects.toMatchObject({ code: 'PARTY_SIZE_INCONSISTENT' })
  })

  it('0 ve 11 reddedilir', () => {
    expect(() =>
      weddingInputSchema.parse({
        coupleNames: 'A',
        weddingDate: '2026-09-12',
        defaultPartySize: 0,
      }),
    ).toThrow()
    expect(() =>
      weddingInputSchema.parse({
        coupleNames: 'A',
        weddingDate: '2026-09-12',
        maxPartySize: 11,
      }),
    ).toThrow()
  })

  it('1 ve 10 sinirlari kabul edilir', () => {
    const r = weddingInputSchema.parse({
      coupleNames: 'A',
      weddingDate: '2026-09-12',
      defaultPartySize: 1,
      maxPartySize: 10,
    })
    expect(r.defaultPartySize).toBe(1)
    expect(r.maxPartySize).toBe(10)
  })

  it('kesirli sayi reddedilir', () => {
    expect(() =>
      weddingInputSchema.parse({
        coupleNames: 'A',
        weddingDate: '2026-09-12',
        defaultPartySize: 2.5,
      }),
    ).toThrow()
  })
})

describe('olusturmada kisi sayisi ayarlari', () => {
  it('verilen degerler INSERT e yazilir, sessizce dusurulmez', async () => {
    const insertWedding = vi.fn(async (values: Record<string, unknown>) => ({
      id: 'w9', ...values,
    }))
    const d = {
      transaction: vi.fn(async (fn: any) => fn({})),
      insertWedding,
      insertMember: vi.fn().mockResolvedValue(undefined),
      listByUser: vi.fn(),
      findById: vi.fn(),
      updateWedding: vi.fn(),
    } as any

    await createWedding(
      {
        userId: 'u1',
        input: {
          coupleNames: 'A & B',
          weddingDate: '2026-09-12',
          partySizeEnabled: false,
          defaultPartySize: 3,
          maxPartySize: 6,
        },
      },
      d,
    )

    const values = insertWedding.mock.calls[0][0] as Record<string, unknown>
    expect(values['partySizeEnabled']).toBe(false)
    expect(values['defaultPartySize']).toBe(3)
    expect(values['maxPartySize']).toBe(6)
  })

  it('olusturmada da default > max reddedilir', async () => {
    const d = {
      transaction: vi.fn(async (fn: any) => fn({})),
      insertWedding: vi.fn(),
      insertMember: vi.fn(),
      listByUser: vi.fn(),
      findById: vi.fn(),
      updateWedding: vi.fn(),
    } as any

    await expect(
      createWedding(
        {
          userId: 'u1',
          input: {
            coupleNames: 'A & B',
            weddingDate: '2026-09-12',
            defaultPartySize: 8,
            maxPartySize: 4,
          },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'PARTY_SIZE_INCONSISTENT' })
    expect(d.insertWedding).not.toHaveBeenCalled()
  })
})
