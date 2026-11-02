import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { AppError } from '../../src/lib/errors.js'
import { errorHandler } from '../../src/middleware/error-handler.js'

/** Tek route'lu test uygulaması üretir. */
function appWith(handler: express.RequestHandler) {
  const app = express()
  app.get('/test', handler)
  app.use(errorHandler)
  return app
}

describe('errorHandler', () => {
  it('AppError tutarlı JSON döner', async () => {
    const app = appWith(() => {
      throw new AppError(400, 'BAD_INPUT', 'Geçersiz girdi')
    })
    const res = await request(app).get('/test')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: { code: 'BAD_INPUT', message: 'Geçersiz girdi' } })
  })

  it('bilinmeyen hata 500 döner', async () => {
    const app = appWith(() => {
      throw new Error('gizli detay')
    })
    const res = await request(app).get('/test')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
  })

  it('bilinmeyen hata iç detayı response\'a sızdırmaz', async () => {
    const app = appWith(() => {
      throw new Error('gizli detay: postgres://user:pass@host/db')
    })
    const res = await request(app).get('/test')
    expect(JSON.stringify(res.body)).not.toContain('gizli detay')
    expect(JSON.stringify(res.body)).not.toContain('postgres://')
  })

  it('stack trace response\'a yazılmaz', async () => {
    const app = appWith(() => {
      throw new Error('boom')
    })
    const res = await request(app).get('/test')
    expect(JSON.stringify(res.body)).not.toContain('at ')
    expect(res.body).not.toHaveProperty('stack')
  })

  it('statik yardımcılar doğru kod üretir', () => {
    expect(AppError.notFound().statusCode).toBe(404)
    expect(AppError.unauthorized().statusCode).toBe(401)
    expect(AppError.forbidden().statusCode).toBe(403)
    expect(AppError.conflict().statusCode).toBe(409)
    expect(AppError.upgradeRequired().statusCode).toBe(426)
    expect(AppError.tooManyRequests().statusCode).toBe(429)
  })

  it('headers gönderildiyse ikinci kez yanıt yazmaz', async () => {
    const app = express()
    app.get('/test', (req, res, next) => {
      res.status(200).json({ ok: true })
      next(new Error('geç kalan hata'))
    })
    app.use(errorHandler)
    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
