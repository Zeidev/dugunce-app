import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

/**
 * Bütçe route'ları — auth katmanı testleri.
 *
 * DB gerektirmeyen kontroller: token yok → 401, bozuk token → 401.
 * Gerçek CRUD akışı Aşama 3 kapanışında PGlite ile ayrıca doğrulanır.
 */
describe('bütçe route bağlama', () => {
  const weddingId = '00000000-0000-0000-0000-000000000001'

  it('GET /expenses — token yoksa 401', async () => {
    const res = await request(createApp()).get(
      `/api/v1/weddings/${weddingId}/expenses`,
    )
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('POST /expenses — token yoksa 401', async () => {
    const res = await request(createApp())
      .post(`/api/v1/weddings/${weddingId}/expenses`)
      .send({ title: 'X', amount: '100', purchaseDate: '2026-01-15' })
    expect(res.status).toBe(401)
  })

  it('PATCH /expenses/:id — token yoksa 401', async () => {
    const res = await request(createApp())
      .patch(`/api/v1/weddings/${weddingId}/expenses/e1`)
      .send({ title: 'Y' })
    expect(res.status).toBe(401)
  })

  it('DELETE /expenses/:id — token yoksa 401', async () => {
    const res = await request(createApp()).delete(
      `/api/v1/weddings/${weddingId}/expenses/e1`,
    )
    expect(res.status).toBe(401)
  })

  it('GET /budget-summary — token yoksa 401', async () => {
    const res = await request(createApp()).get(
      `/api/v1/weddings/${weddingId}/budget-summary`,
    )
    expect(res.status).toBe(401)
  })

  it('bozuk token 401 (500 değil)', async () => {
    const res = await request(createApp())
      .get(`/api/v1/weddings/${weddingId}/expenses`)
      .set('Authorization', 'Bearer bozuk.token.xyz')
    expect(res.status).toBe(401)
  })

  it('geçersiz weddingId formatı 401 döner (auth önce)', async () => {
    const res = await request(createApp()).get('/api/v1/weddings/gecersiz-id/expenses')
    expect(res.status).toBe(401)
  })
})
