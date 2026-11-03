import { describe, it, expect } from 'vitest'
import { weddingPatchSchema } from '../../src/weddings/service.js'

describe('mapUrl şema güvenliği', () => {
  it('https kabul edilir', () => {
    const r = weddingPatchSchema.safeParse({ mapUrl: 'https://maps.google.com/x' })
    expect(r.success).toBe(true)
  })

  it('http kabul edilir', () => {
    const r = weddingPatchSchema.safeParse({ mapUrl: 'http://maps.google.com/x' })
    expect(r.success).toBe(true)
  })

  it('javascript: reddedilir', () => {
    const r = weddingPatchSchema.safeParse({ mapUrl: 'javascript:alert(1)' })
    expect(r.success).toBe(false)
  })

  it('data: reddedilir', () => {
    const r = weddingPatchSchema.safeParse({ mapUrl: 'data:text/html,<script>x</script>' })
    expect(r.success).toBe(false)
  })

  it('ftp reddedilir', () => {
    const r = weddingPatchSchema.safeParse({ mapUrl: 'ftp://example.com/x' })
    expect(r.success).toBe(false)
  })
})

describe('boş PATCH', () => {
  it('boş gövde 400 EMPTY_PATCH döner (500 değil)', async () => {
    const { updateWedding } = await import('../../src/weddings/service.js')
    const deps = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
      findById: async () => ({ id: 'w1' }),
      updateWedding: async () => undefined,
    } as never
    await expect(
      updateWedding({ weddingId: 'w1', userId: 'u1', patch: {} }, deps),
    ).rejects.toMatchObject({ statusCode: 400, code: 'EMPTY_PATCH' })
  })
})

describe('Zod mesajları Türkçe', () => {
  it('geçersiz şablon Türkçe mesaj verir', () => {
    const r = weddingPatchSchema.safeParse({ template: 'YOK' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Geçersiz şablon')
    }
  })

  it('geçersiz font Türkçe mesaj verir', () => {
    const r = weddingPatchSchema.safeParse({ fontKey: 'YOK' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Geçersiz font')
    }
  })

  it('geçersiz mapUrl Türkçe mesaj verir', () => {
    const r = weddingPatchSchema.safeParse({ mapUrl: 'javascript:alert(1)' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues[0]?.message ?? ''
      expect(msg).toMatch(/http|bağlantı/i)
    }
  })
})
