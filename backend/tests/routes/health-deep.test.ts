import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

/**
 * /health/deep — veritabanı dahil derin kontrol.
 *
 * `/health` bilinçli olarak DB'ye dokunmaz (UptimeRobot her saat çağırır).
 * Bu ayrı uç, DB'nin gerçekten erişilebilir olduğunu doğrular ve
 * izleme/teşhis için kullanılır.
 *
 * GÜVENLİK: Hata detayı dışarı sızmaz — yalnızca "ok" / "fail".
 */
describe('GET /health/deep', () => {
  it('DB erisilebilirse 200 ve db:ok doner', async () => {
    const app = createApp({ healthCheckDb: async () => true })
    const res = await request(app).get('/health/deep')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', app: 'dugunce-api', db: 'ok' })
  })

  it('DB erisilemezse 503 ve db:fail doner', async () => {
    const app = createApp({ healthCheckDb: async () => false })
    const res = await request(app).get('/health/deep')
    expect(res.status).toBe(503)
    expect(res.body.db).toBe('fail')
  })

  it('hata detayi SIZMAZ (baglanti dizesi, kullanici adi yok)', async () => {
    const app = createApp({
      healthCheckDb: async () => {
        throw new Error('postgres://user:secret@host/db bağlantı hatası')
      },
    })
    const res = await request(app).get('/health/deep')
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('secret')
    expect(body).not.toContain('postgres://')
    expect(res.body.db).toBe('fail')
  })

  it('Cache-Control: no-store tasir', async () => {
    const app = createApp({ healthCheckDb: async () => true })
    const res = await request(app).get('/health/deep')
    expect(res.headers['cache-control']).toContain('no-store')
  })

  it('/health hala DB-ye DOKUNMAZ', async () => {
    let called = false
    const app = createApp({
      healthCheckDb: async () => {
        called = true
        return true
      },
    })
    await request(app).get('/health')
    expect(called).toBe(false)
  })
})
