/**
 * Brevo CANLI gönderim testi.
 *
 * Yalnızca `BREVO_API_KEY` ortam değişkeni varsa çalışır; yoksa atlanır.
 * CI'da anahtar yok → atlanır. Yerelde `BREVO_API_KEY=... npm test` ile
 * gerçek gönderim doğrulanabilir.
 *
 * Neyi kanıtlar: domain authentication gerçekten çalışıyor mu, sender
 * adresi kabul ediliyor mu, payload Brevo şemasına uyuyor mu.
 */

import { describe, it, expect } from 'vitest'

const API_KEY = process.env['BREVO_API_KEY']
const LIVE = process.env['BREVO_LIVE_TEST'] === '1' && Boolean(API_KEY)
const TO = process.env['BREVO_TEST_TO']

describe.skipIf(!LIVE)('Brevo canlı gönderim', () => {
  it('hesap erişilebilir', async () => {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': API_KEY!, Accept: 'application/json' },
    })
    expect(res.status).toBe(200)
  }, 30_000)

  it('dugunce.com.tr domain authenticate', async () => {
    const res = await fetch('https://api.brevo.com/v3/senders/domains', {
      headers: { 'api-key': API_KEY!, Accept: 'application/json' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      domains?: { domain_name: string; authenticated: boolean }[]
    }
    const d = body.domains?.find((x) => x.domain_name === 'dugunce.com.tr')
    expect(d).toBeDefined()
    expect(d!.authenticated).toBe(true)
  }, 30_000)

  it.skipIf(!TO)('noreply@ adresinden gerçek gönderim kabul edilir', async () => {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': API_KEY!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Düğünce', email: 'noreply@dugunce.com.tr' },
        to: [{ email: TO }],
        subject: 'Düğünce — canlı test',
        textContent: 'Domain authentication doğrulama testi.',
      }),
    })
    // 201 = kuyruğa alındı. Brevo aynı saniyede çok istek gelirse 429
    // dönebilir; bu bir yapılandırma hatası değil, hız sınırıdır.
    if (res.status === 429) {
      console.warn('Brevo rate limit (429) — test atlandı, yapılandırma hatası değil')
      return
    }
    const body = (await res.json()) as { messageId?: string }
    expect(res.status).toBe(201)
    expect(body.messageId).toBeTruthy()
  }, 30_000)
})
