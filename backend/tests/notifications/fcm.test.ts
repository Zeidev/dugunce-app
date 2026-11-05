import { describe, it, expect, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import {
  parseServiceAccount,
  createFcmSender,
  createFcmSenderFromEnv,
} from '../../src/notifications/fcm.js'

/**
 * FCM istemcisi — ağa ÇIKMAZ, `fetch` enjekte edilir.
 *
 * NEDEN GERÇEK RSA ANAHTARI ÜRETİLİYOR: JWT imzası gerçekten
 * imzalanmalı. Sahte bir imza üretmek, imzalama kodunun bozuk olmasını
 * gizlerdi — oysa üretimde tek hata noktası orası.
 */

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const ACCOUNT = {
  project_id: 'dugunce-app',
  client_email: 'firebase-adminsdk-fbsvc@dugunce-app.iam.gserviceaccount.com',
  private_key: privateKey,
}

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

describe('parseServiceAccount', () => {
  it('geçerli base64 JSON ayrıştırır', () => {
    const acc = parseServiceAccount(b64(ACCOUNT))
    expect(acc?.project_id).toBe('dugunce-app')
    expect(acc?.client_email).toContain('dugunce-app')
  })

  it('boş değerde null döner (sunucu çökmemeli)', () => {
    expect(parseServiceAccount('')).toBeNull()
  })

  it('bozuk base64te null döner', () => {
    expect(parseServiceAccount('!!!bozuk!!!')).toBeNull()
  })

  it('eksik alanlı JSON null döner', () => {
    expect(parseServiceAccount(b64({ project_id: 'x' }))).toBeNull()
  })

  it('boş private_key null döner', () => {
    expect(
      parseServiceAccount(b64({ project_id: 'p', client_email: 'e', private_key: '' })),
    ).toBeNull()
  })
})

describe('createFcmSender', () => {
  it('doğru URL, Bearer başlığı ve gövde kullanır', async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = []
    const fakeFetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      })
      if (String(url).includes('oauth2')) {
        return new Response('{"access_token":"tok123","expires_in":3600}', { status: 200 })
      }
      return new Response('{"name":"projects/dugunce-app/messages/1"}', { status: 200 })
    })

    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('DEVICE_TOKEN', 'Başlık', 'Gövde', { type: 'RSVP_RECEIVED' })

    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token')
    expect(calls[1]?.url).toBe(
      'https://fcm.googleapis.com/v1/projects/dugunce-app/messages:send',
    )
    expect(calls[1]?.headers['Authorization']).toBe('Bearer tok123')

    const parsed = JSON.parse(calls[1]?.body ?? '{}') as {
      message: { token: string; notification: { title: string; body: string }; data: Record<string, string> }
    }
    expect(parsed.message.token).toBe('DEVICE_TOKEN')
    expect(parsed.message.notification.title).toBe('Başlık')
    expect(parsed.message.notification.body).toBe('Gövde')
    expect(parsed.message.data['type']).toBe('RSVP_RECEIVED')
  })

  it('404 UNREGISTERED → unregistered:true (token silinmeli)', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      return new Response(
        '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}',
        { status: 404 },
      )
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('tok', 'B', 'G', {})

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.unregistered).toBe(true)
  })

  it('500 → unregistered:false, sunucu ÇÖKMEZ', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      return new Response('boom', { status: 500 })
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('tok', 'B', 'G', {})

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.unregistered).toBe(false)
  })

  it('ağ hatası fırlatmaz, sonuç döner', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      throw new Error('ECONNREFUSED')
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('tok', 'B', 'G', {})

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('ECONNREFUSED')
  })

  it('OAuth2 token 1 saat önbelleklenir (ikinci gönderimde yeniden alınmaz)', async () => {
    let tokenCalls = 0
    const fakeFetch = vi.fn(async (url: string) => {
      if (String(url).includes('oauth2')) {
        tokenCalls += 1
        return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      }
      return new Response('{"name":"ok"}', { status: 200 })
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    await sender.send('a', 'B', 'G', {})
    await sender.send('b', 'B', 'G', {})

    expect(tokenCalls).toBe(1)
  })

  it('OAuth2 hata verirse gönderim başarısız döner, fırlatmaz', async () => {
    const fakeFetch = vi.fn(async () => new Response('nope', { status: 401 }))
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('tok', 'B', 'G', {})

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.unregistered).toBe(false)
  })
})

describe('createFcmSenderFromEnv', () => {
  it('PUSH_ENABLED=false iken null döner', () => {
    expect(
      createFcmSenderFromEnv({ PUSH_ENABLED: false, FCM_SERVICE_ACCOUNT_BASE64: b64(ACCOUNT) }),
    ).toBeNull()
  })

  it('anahtar yokken null döner, ÇÖKMEZ', () => {
    expect(createFcmSenderFromEnv({ PUSH_ENABLED: true })).toBeNull()
    expect(createFcmSenderFromEnv({ PUSH_ENABLED: true, FCM_SERVICE_ACCOUNT_BASE64: '' })).toBeNull()
  })

  it('anahtar bozuksa null döner, ÇÖKMEZ', () => {
    expect(
      createFcmSenderFromEnv({ PUSH_ENABLED: true, FCM_SERVICE_ACCOUNT_BASE64: 'bozuk' }),
    ).toBeNull()
  })

  it('ikisi de geçerliyse gönderici üretir', () => {
    const s = createFcmSenderFromEnv({
      PUSH_ENABLED: true,
      FCM_SERVICE_ACCOUNT_BASE64: b64(ACCOUNT),
    })
    expect(s).not.toBeNull()
  })
})
