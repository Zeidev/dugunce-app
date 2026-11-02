/**
 * CORS — davetiye sayfası API'yi çağırabilmeli.
 *
 * Sayfa `dugunce.com.tr` (Cloudflare Pages) üzerinde, API ise
 * `api.dugunce.com.tr` (serv00) üzerinde. Farklı origin olduğu için
 * tarayıcı CORS başlığı arar; yoksa isteği ENGELLER ve davetiye
 * sayfası boş kalır.
 *
 * GÜVENLİK: `*` KULLANILMAZ. Yalnızca beyaz listedeki origin'ler.
 * Davetiye token'ı hassas; herhangi bir siteye açık olmamalı.
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

const noopStore = {
  findByTokenHash: async () => null,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
} as never

describe('CORS — davetiye uçları', () => {
  it('dugunce.com.tr origin\'i kabul edilir', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/invitations/testtoken')
      .set('Origin', 'https://dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
  })

  it('www.dugunce.com.tr de kabul edilir', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/invitations/testtoken')
      .set('Origin', 'https://www.dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).toBe('https://www.dugunce.com.tr')
  })

  it('localhost geliştirme için kabul edilir', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/invitations/testtoken')
      .set('Origin', 'http://localhost:5173')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('BİLİNMEYEN origin reddedilir (allow-origin dönmez)', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/invitations/testtoken')
      .set('Origin', 'https://kotu-site.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('wildcard (*) KULLANILMAZ', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/invitations/testtoken')
      .set('Origin', 'https://dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).not.toBe('*')
  })

  it('OPTIONS preflight 204 döner', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .options('/api/v1/invitations/testtoken/rsvp')
      .set('Origin', 'https://dugunce.com.tr')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
    expect([200, 204]).toContain(res.status)
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
    expect(res.headers['access-control-allow-methods']).toContain('POST')
  })

  it('Vary: Origin taşır (cache zehirlenmesi önlemi)', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/invitations/testtoken')
      .set('Origin', 'https://dugunce.com.tr')
    expect(String(res.headers['vary'] ?? '')).toContain('Origin')
  })

  it('çift tarafı uçlar CORS başlığı ALMAZ (aynı origin varsayımı)', async () => {
    // Mobil uygulama CORS kullanmaz; web admin aynı origin'de olacak.
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .get('/api/v1/weddings/00000000-0000-0000-0000-000000000001/guests')
      .set('Origin', 'https://kotu-site.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
