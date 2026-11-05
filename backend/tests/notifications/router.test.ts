import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createNotificationsRouter } from '../../src/notifications/router.js'
import type { DeviceTokenDeps } from '../../src/notifications/store.js'
import type { PreferencesDeps } from '../../src/notifications/preferences.js'
import { errorHandler } from '../../src/middleware/error-handler.js'

/**
 * Bildirim uçları.
 *
 * `requireAuth` sahteleniyor: sınanan şey route davranışı, kimlik
 * doğrulama değil (o `require-auth` testlerinde ayrıca sınanıyor).
 */

function tokens(): DeviceTokenDeps {
  return {
    upsertDeviceToken: vi.fn(async () => undefined),
    deleteDeviceToken: vi.fn(async () => undefined),
    deleteAllForUser: vi.fn(async () => undefined),
    listTokensForUser: vi.fn(async () => []),
    listTokensForWeddingMembers: vi.fn(async () => []),
  }
}

function prefs(): PreferencesDeps {
  return {
    get: vi.fn(async () => ({ enabled: true, quietHoursOverride: false })),
    set: vi.fn(async () => undefined),
  }
}

function app(t: DeviceTokenDeps = tokens(), p: PreferencesDeps = prefs()) {
  const a = express()
  a.use(express.json())
  a.use(
    '/api/v1/notifications',
    createNotificationsRouter({
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'u1' }
        next()
      },
      tokens: t,
      preferences: p,
    }),
  )
  // ÜRETİMLE AYNI hata yolu: `{error:{code,message}}` gövdesini bu üretir.
  // Eklenmezse testte `res.body.error` undefined olur ve kod doğrulaması
  // yanlış yere bakardı.
  a.use(errorHandler)
  return a
}

describe('POST /device', () => {
  it('token kaydeder ve 204 döner', async () => {
    const t = tokens()
    const res = await request(app(t))
      .post('/api/v1/notifications/device')
      .send({ token: 'tok', platform: 'ANDROID' })

    expect(res.status).toBe(204)
    expect(t.upsertDeviceToken).toHaveBeenCalledWith({
      userId: 'u1',
      token: 'tok',
      platform: 'ANDROID',
    })
  })

  it('boş token → 400 INVALID_TOKEN', async () => {
    const res = await request(app()).post('/api/v1/notifications/device').send({ token: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })

  it('token yok → 400', async () => {
    const res = await request(app()).post('/api/v1/notifications/device').send({})
    expect(res.status).toBe(400)
  })

  it('geçersiz platform → 400 INVALID_PLATFORM', async () => {
    const res = await request(app())
      .post('/api/v1/notifications/device')
      .send({ token: 'tok', platform: 'WINDOWS' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PLATFORM')
  })

  it('platform verilmezse ANDROID varsayılır', async () => {
    const t = tokens()
    await request(app(t)).post('/api/v1/notifications/device').send({ token: 'tok' })
    expect(t.upsertDeviceToken).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'ANDROID' }),
    )
  })

  it('token baştaki/sondaki boşluklardan arındırılır', async () => {
    const t = tokens()
    await request(app(t)).post('/api/v1/notifications/device').send({ token: '  tok  ' })
    expect(t.upsertDeviceToken).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok' }))
  })
})

describe('DELETE /device', () => {
  it('tokenı siler ve 204 döner', async () => {
    const t = tokens()
    const res = await request(app(t))
      .delete('/api/v1/notifications/device')
      .send({ token: 'tok' })

    expect(res.status).toBe(204)
    expect(t.deleteDeviceToken).toHaveBeenCalledWith('tok')
  })

  it('boş token → 400', async () => {
    const res = await request(app()).delete('/api/v1/notifications/device').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /preferences', () => {
  it('mevcut tercihleri döner', async () => {
    const res = await request(app()).get('/api/v1/notifications/preferences')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: true, quietHoursOverride: false })
  })
})

describe('PATCH /preferences', () => {
  it('yalnız gönderilen alanı değiştirir', async () => {
    const p = prefs()
    const res = await request(app(tokens(), p))
      .patch('/api/v1/notifications/preferences')
      .send({ enabled: false })

    expect(res.status).toBe(200)
    expect(p.set).toHaveBeenCalledWith('u1', { enabled: false })
  })

  it('boş gövde → 400 EMPTY_PATCH (sessiz no-op yok)', async () => {
    const res = await request(app())
      .patch('/api/v1/notifications/preferences')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('EMPTY_PATCH')
  })

  it('bilinmeyen alan → 400 INVALID_PATCH', async () => {
    const res = await request(app())
      .patch('/api/v1/notifications/preferences')
      .send({ enabled: true, admin: true })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PATCH')
  })

  it('boolean olmayan değer yok sayılır (tip zorlaması)', async () => {
    const p = prefs()
    const res = await request(app(tokens(), p))
      .patch('/api/v1/notifications/preferences')
      .send({ enabled: 'evet' })

    // 'evet' boolean değil → patch boş kalır → 400.
    expect(res.status).toBe(400)
    expect(p.set).not.toHaveBeenCalled()
  })
})

describe('kimlik doğrulama', () => {
  it('req.auth yoksa 401', async () => {
    const a = express()
    a.use(express.json())
    a.use(
      '/api/v1/notifications',
      createNotificationsRouter({
        requireAuth: (_req, _res, next) => next(),
        tokens: tokens(),
        preferences: prefs(),
      }),
    )
    a.use(errorHandler)
    const res = await request(a).post('/api/v1/notifications/device').send({ token: 'tok' })
    expect(res.status).toBe(401)
  })
})
