import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

/**
 * Uçtan uca route testleri — DB'siz çalışanlar.
 *
 * DB gerektiren akışlar (magic link → wedding) Aşama 2 sonunda
 * gerçek PostgreSQL ile ayrıca test edilecek. Burada router'ların
 * doğru bağlandığı ve auth katmanının çalıştığı doğrulanır.
 */
describe('route bağlama', () => {
  it('GET /health çalışıyor', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.app).toBe('dugunce-api')
  })

  it('POST /api/v1/auth/magic-link — e-posta yoksa 400', async () => {
    const res = await request(createApp())
      .post('/api/v1/auth/magic-link')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })

  it('POST /api/v1/auth/magic-link — geçersiz e-posta 400', async () => {
    const res = await request(createApp())
      .post('/api/v1/auth/magic-link')
      .send({ email: 'gecersiz' })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/auth/verify — token/kod yoksa 400', async () => {
    const res = await request(createApp()).post('/api/v1/auth/verify').send({})
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/auth/refresh — token yoksa 400', async () => {
    const res = await request(createApp()).post('/api/v1/auth/refresh').send({})
    expect(res.status).toBe(400)
  })

  it('GET /api/v1/weddings — token yoksa 401', async () => {
    const res = await request(createApp()).get('/api/v1/weddings')
    expect(res.status).toBe(401)
  })

  it('POST /api/v1/weddings — token yoksa 401', async () => {
    const res = await request(createApp()).post('/api/v1/weddings').send({})
    expect(res.status).toBe(401)
  })

  it('GET /api/v1/weddings/:id — token yoksa 401 (üyelik kontrolüne gelmez)', async () => {
    const res = await request(createApp()).get('/api/v1/weddings/herhangi-bir-id')
    expect(res.status).toBe(401)
  })

  it('POST /api/v1/weddings/:id/invites — token yoksa 401', async () => {
    const res = await request(createApp())
      .post('/api/v1/weddings/herhangi-bir-id/invites')
      .send({ role: 'CO_OWNER' })
    expect(res.status).toBe(401)
  })

  it('POST /api/v1/invites/accept — token yoksa 401', async () => {
    const res = await request(createApp())
      .post('/api/v1/invites/accept')
      .send({ code: 'ABC2345' })
    expect(res.status).toBe(401)
  })

  it('POST /api/v1/auth/logout-all — token yoksa 401', async () => {
    const res = await request(createApp()).post('/api/v1/auth/logout-all')
    expect(res.status).toBe(401)
  })

  it('GET /api/v1/auth/me — token yoksa 401', async () => {
    const res = await request(createApp()).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })

  it('bilinmeyen API yolu 404 döner', async () => {
    const res = await request(createApp()).get('/api/v1/olmayan')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('bozuk token 401 (500 değil)', async () => {
    const res = await request(createApp())
      .get('/api/v1/weddings')
      .set('Authorization', 'Bearer tamamen.bozuk.token')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('Bearer olmayan scheme 401', async () => {
    const res = await request(createApp())
      .get('/api/v1/weddings')
      .set('Authorization', 'Basic abc123')
    expect(res.status).toBe(401)
  })
})
