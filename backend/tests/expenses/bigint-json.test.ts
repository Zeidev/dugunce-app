import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

/**
 * BigInt JSON serileştirme — bildirilen 2. hata.
 *
 * `Kurus = bigint` ve Express `res.json()` BigInt'te patlar:
 *   TypeError: Do not know how to serialize a BigInt
 *
 * Bu, harcama ekleme dahil TÜM harcama uçlarını 500'e düşürüyordu.
 * Kuruş string olarak taşınmalı (float yuvarlaması olmasın).
 */
describe('BigInt → JSON', () => {
  it('BigInt değer string olarak serileşir', () => {
    const app = createApp({ healthCheckDb: async () => true })
    // Express'in ayarını doğrudan test et
    const replacer = app.get('json replacer')
    expect(typeof replacer).toBe('function')
    expect(replacer('amountKurus', 1200000n)).toBe('1200000')
    expect(replacer('x', 42)).toBe(42)
    expect(replacer('x', 'metin')).toBe('metin')
    expect(replacer('x', null)).toBe(null)
  })

  it('kuruş hassasiyeti korunur (float yuvarlaması yok)', () => {
    const app = createApp({ healthCheckDb: async () => true })
    const replacer = app.get('json replacer')
    // 9999999999999999999n gibi büyük değerler float'ta bozulur
    expect(replacer('a', 9999999999999999999n)).toBe('9999999999999999999')
  })

  it('iç içe nesnede de çalışır', () => {
    const app = createApp({ healthCheckDb: async () => true })
    const replacer = app.get('json replacer')
    const obj = { expense: { amountKurus: 500000n, title: 'Salon' } }
    const json = JSON.stringify(obj, replacer)
    expect(json).toContain('"amountKurus":"500000"')
    expect(json).not.toContain('n,')
  })
})

/**
 * Auth uçlarında CORS — bildirilen 1. hata.
 *
 * `/auth/` sayfası dugunce.com.tr'de, API api.dugunce.com.tr'de.
 * CORS başlığı olmadan tarayıcı yanıtı okuyamaz.
 */
describe('auth CORS', () => {
  it('izinli origin yansıtılır', async () => {
    const app = createApp({ healthCheckDb: async () => true })
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .set('Origin', 'https://dugunce.com.tr')
      .send({ token: 'x' })
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
  })

  it('izinsiz origin başlık almaz', async () => {
    const app = createApp({ healthCheckDb: async () => true })
    const res = await request(app)
      .post('/api/v1/auth/verify')
      .set('Origin', 'https://kotu.example')
      .send({ token: 'x' })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('preflight 204 döner', async () => {
    const app = createApp({ healthCheckDb: async () => true })
    const res = await request(app)
      .options('/api/v1/auth/verify')
      .set('Origin', 'https://dugunce.com.tr')
      .set('Access-Control-Request-Method', 'POST')
    expect(res.status).toBe(204)
  })

  it('magic-link ucu da CORS alır', async () => {
    const app = createApp({ healthCheckDb: async () => true })
    const res = await request(app)
      .post('/api/v1/auth/magic-link')
      .set('Origin', 'https://dugunce.com.tr')
      .send({ email: 'x@y.com' })
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
  })
})
