import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createRateLimit } from '../../src/middleware/rate-limit.js'
import { errorHandler } from '../../src/middleware/error-handler.js'

function makeApp(limit: {
  windowMs: number
  max: number
  keyFn?: (req: express.Request) => string
}) {
  const app = express()
  app.use(express.json())
  app.post('/login', createRateLimit(limit), (_req, res) => {
    res.json({ ok: true })
  })
  app.use(errorHandler)
  return app
}

describe('createRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('limit altında geçer', async () => {
    const app = makeApp({ windowMs: 60_000, max: 3 })
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/login')
      expect(res.status).toBe(200)
    }
  })

  it('limit aşılınca 429 RATE_LIMITED', async () => {
    const app = makeApp({ windowMs: 60_000, max: 2 })
    await request(app).post('/login')
    await request(app).post('/login')
    const res = await request(app).post('/login')
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('RATE_LIMITED')
  })

  it('Retry-After başlığı verir', async () => {
    const app = makeApp({ windowMs: 60_000, max: 1 })
    await request(app).post('/login')
    const res = await request(app).post('/login')
    expect(res.headers['retry-after']).toBeDefined()
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('pencere dolunca sıfırlanır', async () => {
    const app = makeApp({ windowMs: 60_000, max: 1 })
    await request(app).post('/login')
    expect((await request(app).post('/login')).status).toBe(429)

    vi.advanceTimersByTime(61_000)

    const res = await request(app).post('/login')
    expect(res.status).toBe(200)
  })

  it('özel keyFn ile ayrı sayaçlar (e-posta bazlı)', async () => {
    const app = express()
    app.use(express.json())
    app.post(
      '/login',
      createRateLimit({
        windowMs: 60_000,
        max: 1,
        keyFn: (req) => String((req.body as { email?: string }).email ?? 'anon'),
      }),
      (_req, res) => res.json({ ok: true }),
    )
    app.use(errorHandler)

    await request(app).post('/login').send({ email: 'a@b.com' })
    // Aynı e-posta → 429
    expect((await request(app).post('/login').send({ email: 'a@b.com' })).status).toBe(429)
    // Farklı e-posta → geçer
    expect((await request(app).post('/login').send({ email: 'c@d.com' })).status).toBe(200)
  })

  it('429 yanıtı cache edilmemeli', async () => {
    const app = makeApp({ windowMs: 60_000, max: 1 })
    await request(app).post('/login')
    const res = await request(app).post('/login')
    expect(res.headers['cache-control']).toContain('no-store')
  })

  it('reset() sayacı temizler (test/operasyon için)', async () => {
    const limiter = createRateLimit({ windowMs: 60_000, max: 1 })
    const app = express()
    app.post('/x', limiter, (_req, res) => res.json({ ok: true }))
    app.use(errorHandler)

    await request(app).post('/x')
    expect((await request(app).post('/x')).status).toBe(429)

    limiter.reset()
    expect((await request(app).post('/x')).status).toBe(200)
  })
})
