import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  FREE_TEMPLATES,
  isTemplateFree,
  PREMIUM_TEMPLATES,
} from '../../src/weddings/templates.js'

/**
 * Şablonların ücretsiz/premium ayrımı.
 *
 * KULLANICI KARARI (2026-11-04): "Şablonların başı olan 2 tanesi ücretsiz,
 * diğerleri premium özel olacak."
 *
 * Ücretsiz: ZARIF (varsayılan, klasik) + BOTANIK (kır düğünü).
 *
 * KRİTİK: Bu ayrım SUNUCUDA uygulanır. İstemci "premium şablon seç"
 * derse backend reddetmeli — aksi hâlde premium özelliği herkese açık
 * olurdu.
 */
describe('sablon ucretlendirmesi', () => {
  it('ilk iki sablon ucretsiz', () => {
    expect(FREE_TEMPLATES).toEqual(['ZARIF', 'BOTANIK'])
  })

  it('ucretsiz sablonlar TEMPLATES in basindaki ikisi', () => {
    expect(TEMPLATES.slice(0, 2)).toEqual([...FREE_TEMPLATES])
  })

  it('kalan dokuz sablon premium', () => {
    expect(PREMIUM_TEMPLATES).toHaveLength(9)
    expect(PREMIUM_TEMPLATES).toEqual([
      'ROMANTIK', 'MINIMAL', 'GECE', 'ZEYTIN', 'EDITORYAL',
      'MONOGRAM', 'LUKS', 'FOTOGRAFLI', 'TIPOGRAFI',
    ])
  })

  it('ucretsiz + premium = tum sablonlar (kayip veya tekrar yok)', () => {
    const all = [...FREE_TEMPLATES, ...PREMIUM_TEMPLATES].sort()
    expect(all).toEqual([...TEMPLATES].sort())
  })

  it('isTemplateFree dogru cevap verir', () => {
    expect(isTemplateFree('ZARIF')).toBe(true)
    expect(isTemplateFree('BOTANIK')).toBe(true)
    expect(isTemplateFree('GECE')).toBe(false)
    expect(isTemplateFree('LUKS')).toBe(false)
    expect(isTemplateFree('UYDURMA')).toBe(false)
  })

  it('varsayilan sablon ucretsiz — yeni dugun engellenmez', () => {
    // DEFAULT_TEMPLATE ücretsiz olmazsa yeni düğün açan herkes
    // "premium gerekli" hatası alırdı.
    expect(isTemplateFree(TEMPLATES[0]!)).toBe(true)
  })
})

describe('premium sablon kapisi — sunucu', () => {
  it('ucretsiz dugun premium sablon secemez', async () => {
    const { updateWedding } = await import('../../src/weddings/service.js')
    const d = {
      findById: async () => ({
        id: 'w1', coupleNames: 'A & B', weddingDate: new Date(),
        plan: 'FREE', template: 'ZARIF', fontKey: '',
      }),
      updateWedding: async () => { throw new Error('yazmamaliydi') },
    } as never

    await expect(
      updateWedding({ weddingId: 'w1', userId: 'u1', patch: { template: 'GECE' } }, d),
    ).rejects.toMatchObject({ code: 'PREMIUM_REQUIRED' })
  })

  it('ucretsiz dugun ucretsiz sablonu secebilir', async () => {
    const { updateWedding } = await import('../../src/weddings/service.js')
    let written: Record<string, unknown> | null = null
    const d = {
      findById: async () => ({
        id: 'w1', coupleNames: 'A & B', weddingDate: new Date(),
        plan: 'FREE', template: 'ZARIF', fontKey: '',
      }),
      updateWedding: async (_id: string, p: Record<string, unknown>) => {
        written = p
        return { id: 'w1', ...p }
      },
    } as never

    await updateWedding({ weddingId: 'w1', userId: 'u1', patch: { template: 'BOTANIK' } }, d)
    expect(written).toMatchObject({ template: 'BOTANIK' })
  })

  it('premium dugun istedigi sablonu secebilir', async () => {
    const { updateWedding } = await import('../../src/weddings/service.js')
    let written: Record<string, unknown> | null = null
    const d = {
      findById: async () => ({
        id: 'w1', coupleNames: 'A & B', weddingDate: new Date(),
        plan: 'PREMIUM', template: 'ZARIF', fontKey: '',
      }),
      updateWedding: async (_id: string, p: Record<string, unknown>) => {
        written = p
        return { id: 'w1', ...p }
      },
    } as never

    await updateWedding({ weddingId: 'w1', userId: 'u1', patch: { template: 'GECE' } }, d)
    expect(written).toMatchObject({ template: 'GECE' })
  })
})
