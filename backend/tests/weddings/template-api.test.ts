import { describe, it, expect } from 'vitest'
import { weddingPatchSchema, weddingInputSchema } from '../../src/weddings/service.js'
import { errorHandler } from '../../src/middleware/error-handler.js'
import { AppError } from '../../src/lib/errors.js'

/**
 * Davetiye şablonu + font sözleşmesi.
 *
 * İki katman ayrı doğrulanır:
 *   1. Şema katmanı — hangi değerler kabul edilir (Zod).
 *   2. Router katmanı — doğrulama hatası 400 döner (eskiden 500).
 */
describe('wedding template schema', () => {
  it('geçerli şablon ve font kabul edilir', () => {
    const r = weddingPatchSchema.parse({ template: 'GECE', fontKey: 'BODONI' })
    expect(r.template).toBe('GECE')
    expect(r.fontKey).toBe('BODONI')
  })

  it('geçersiz şablon reddedilir', () => {
    expect(() => weddingPatchSchema.parse({ template: 'YOK' })).toThrow()
  })

  it('geçersiz font reddedilir', () => {
    expect(() => weddingPatchSchema.parse({ fontKey: 'YOK' })).toThrow()
  })

  it('şablonsuz güncelleme geçerli (partial)', () => {
    const r = weddingPatchSchema.parse({ coupleNames: 'Ayşe & Burak' })
    expect(r.coupleNames).toBe('Ayşe & Burak')
    expect(r.template).toBeUndefined()
  })

  it('oluşturmada varsayılan şablon zorunlu değil', () => {
    const r = weddingInputSchema.parse({
      coupleNames: 'Ayşe & Burak',
      weddingDate: '2026-06-14T15:30:00Z',
    })
    expect(r.template).toBeUndefined()
  })
})

describe('errorHandler — Zod hatası 400 döner', () => {
  /**
   * Router testleri auth middleware'ine takıldığı için (401), Zod→400
   * eşlemesini doğrudan merkezi hata yakalayıcı üzerinde doğruluyoruz.
   * Bu, tüm router'ların kazandığı davranışın kendisi.
   */
  function mockReq() {
    return { path: '/api/v1/weddings', baseUrl: '', method: 'POST' } as never
  }

  function mockRes() {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      headersSent: false,
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: unknown) {
        this.body = payload
        return this
      },
    }
    return res
  }

  it('ZodError 400 VALIDATION_ERROR döner', () => {
    const err = weddingPatchSchema.safeParse({ template: 'YOK' })
    expect(err.success).toBe(false)
    const res = mockRes()
    errorHandler(err.error, mockReq(), res as never, (() => {}) as never)
    expect(res.statusCode).toBe(400)
    const body = res.body as { error: { code: string; details: { fields: unknown[] } } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(Array.isArray(body.error.details.fields)).toBe(true)
    expect(body.error.details.fields.length).toBeGreaterThan(0)
  })

  it('alan yolu ve mesajı taşınır, ham Zod yapısı sızmaz', () => {
    const err = weddingPatchSchema.safeParse({ coupleNames: '' })
    expect(err.success).toBe(false)
    const res = mockRes()
    errorHandler(err.error, mockReq(), res as never, (() => {}) as never)
    const body = res.body as { error: { details: { fields: { path: string; message: string }[] } } }
    const field = body.error.details.fields[0]
    expect(field?.path).toBe('coupleNames')
    expect(typeof field?.message).toBe('string')
    expect(JSON.stringify(body)).not.toContain('code:')
    expect(JSON.stringify(body)).not.toContain('unionErrors')
  })

  it('AppError davranışı değişmedi', () => {
    const res = mockRes()
    errorHandler(AppError.notFound('yok'), mockReq(), res as never, (() => {}) as never)
    expect(res.statusCode).toBe(404)
  })
})
