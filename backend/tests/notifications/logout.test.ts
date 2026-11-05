import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAuthRouter } from '../../src/routes/auth.js'
import type { DeviceTokenDeps } from '../../src/notifications/store.js'
import { errorHandler } from '../../src/middleware/error-handler.js'

/**
 * Çıkışta push token temizliği.
 *
 * NEDEN GEREKLİ (spec §5.2): "`/auth/logout` sunucu tarafında o
 * kullanıcının tüm token'larını siler — istemci silmeyi unutsa bile."
 *
 * İstemci `DELETE /notifications/device` çağrısını unutursa (ağ hatası,
 * uygulama kapanması) token DB'de kalır ve o cihazda oturum açan bir
 * sonraki kullanıcı ESKİ kullanıcının bildirimlerini alır.
 */

function deviceDeps(): DeviceTokenDeps {
  return {
    upsertDeviceToken: vi.fn(async () => undefined),
    deleteDeviceToken: vi.fn(async () => undefined),
    deleteAllForUser: vi.fn(async () => undefined),
    listTokensForUser: vi.fn(async () => []),
    listTokensForWeddingMembers: vi.fn(async () => []),
  }
}

function app(tokens: DeviceTokenDeps) {
  const a = express()
  a.use(express.json())
  a.use(
    '/api/v1/auth',
    createAuthRouter({
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'u1' }
        next()
      },
      deviceTokenDeps: tokens,
      // Gerçek DB'ye bağlanmasın: bu testler refresh akışını değil
      // push token temizliğini sınıyor.
      refreshDeps: {
        jwtSecret: 'test-secret-en-az-32-karakter-uzunlugunda',
        findByHash: async () => null,
        revokeByHash: async () => undefined,
        revokeAllForUser: async () => 0,
      } as never,
    } as never),
  )
  a.use(errorHandler)
  return a
}

describe('POST /auth/logout — push token temizliği', () => {
  it('gövdede token varsa o tokenı siler', async () => {
    const tokens = deviceDeps()
    const res = await request(app(tokens))
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'r1', deviceToken: 'fcm-tok' })

    expect(res.status).toBe(200)
    expect(tokens.deleteDeviceToken).toHaveBeenCalledWith('fcm-tok')
  })

  it('token yoksa silme ÇAĞRILMAZ (gereksiz iş yok)', async () => {
    const tokens = deviceDeps()
    const res = await request(app(tokens))
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'r1' })

    expect(res.status).toBe(200)
    expect(tokens.deleteDeviceToken).not.toHaveBeenCalled()
  })

  it('deviceToken string değilse yok sayılır (tip zorlaması)', async () => {
    const tokens = deviceDeps()
    await request(app(tokens))
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'r1', deviceToken: 12345 })

    expect(tokens.deleteDeviceToken).not.toHaveBeenCalled()
  })

  it('token silme HATA VERSE bile çıkış başarılı sayılır', async () => {
    const tokens = deviceDeps()
    tokens.deleteDeviceToken = vi.fn(async () => {
      throw new Error('DB hatası')
    })
    const res = await request(app(tokens))
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'r1', deviceToken: 'fcm-tok' })

    // Çıkış kullanıcının niyeti; bildirim temizliği ikincil. Hata
    // çıkışı ENGELLEMEMELİ.
    expect(res.status).toBe(200)
  })
})

describe('POST /auth/logout-all — push token temizliği', () => {
  it('kullanıcının TÜM tokenlarını siler', async () => {
    const tokens = deviceDeps()
    const res = await request(app(tokens)).post('/api/v1/auth/logout-all').send({})

    expect(res.status).toBe(200)
    // `logout-all` userId biliyor (requireAuth) → tüm cihazlar.
    expect(tokens.deleteAllForUser).toHaveBeenCalledWith('u1')
  })
})
