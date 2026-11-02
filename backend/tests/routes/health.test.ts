import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('GET /health', () => {
  it('200 ve beklenen gövde döner', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', app: 'dugunce-api' })
  })

  it('DB erişimi yapmaz — 100ms altında yanıtlar', async () => {
    const app = createApp()
    const t0 = Date.now()
    await request(app).get('/health')
    expect(Date.now() - t0).toBeLessThan(100)
  })

  it('bilinmeyen yol 404 döner ve tutarlı hata formatı kullanır', async () => {
    const res = await request(createApp()).get('/yok-boyle-bir-yol')
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
    expect(res.body.error).toHaveProperty('code')
  })

  it('health yanıtı cache edilmemeli (no-store)', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.headers['cache-control']).toContain('no-store')
  })
})
