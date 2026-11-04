import { describe, it, expect } from 'vitest'
import { weddingPatchSchema, updateWedding } from '../../src/weddings/service.js'

describe('PATCH null toleransı', () => {
  it('null alanlar atılır, geçerli alanlar korunur', () => {
    const r = weddingPatchSchema.parse({
      template: 'GECE', fontKey: 'BODONI',
      coupleNames: null, weddingDate: null, mapUrl: null,
    })
    expect(r).toEqual({ template: 'GECE', fontKey: 'BODONI' })
  })

  it('tümü null ise boş nesne döner', () => {
    const r = weddingPatchSchema.parse({ template: null, fontKey: null })
    expect(r).toEqual({})
  })

  it('service boş patch için 400 verir', async () => {
    const deps = { findById: async () => ({ id: 'w1' }), updateWedding: async () => undefined } as never
    await expect(
      updateWedding({ weddingId: 'w1', userId: 'u1', patch: { template: null } }, deps),
    ).rejects.toMatchObject({ statusCode: 400, code: 'EMPTY_PATCH' })
  })

  it('gerçek mobil gövdesiyle kaydeder', async () => {
    let captured: Record<string, unknown> | null = null
    const deps = {
      // Plan PREMIUM: bu test null toleransını doğruluyor, plan
      // kapısını değil — GECE premium bir şablon.
      findById: async () => ({ id: 'w1', plan: 'PREMIUM' }),
      updateWedding: async (_id: string, vals: Record<string, unknown>) => {
        captured = vals
        // Bu testler null toleransını doğruluyor, plan kapısını değil —
        // premium şablon (GECE) kullandıkları için PREMIUM düğün gerekli.
        return { id: 'w1', coupleNames: 'A', weddingDate: new Date(), plan: 'PREMIUM', status: 'ACTIVE', timezone: 'Europe/Istanbul', ...vals }
      },
    } as never
    await updateWedding({
      weddingId: 'w1', userId: 'u1',
      patch: { template: 'GECE', fontKey: 'BODONI', coupleNames: null, weddingDate: null, venueName: null },
    }, deps)
    expect(captured).toEqual({ template: 'GECE', fontKey: 'BODONI' })
  })
})
