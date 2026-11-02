import { describe, it, expect, vi } from 'vitest'
import { createEmailClient } from '../../src/auth/brevo.js'

const SENDER = { name: 'Düğünce', email: 'noreply@dugunce.com.tr' }

function makeClient(sendImpl = vi.fn().mockResolvedValue({ messageId: 'm1' })) {
  return {
    send: sendImpl,
    client: createEmailClient({
      apiKey: 'test-key',
      sender: SENDER,
      transport: sendImpl,
    }),
  }
}

describe('sendMagicLinkEmail', () => {
  it('doğru alıcı ve konu ile gönderir', async () => {
    const { client, send } = makeClient()
    await client.sendMagicLinkEmail({
      to: 'elif@ornek.com',
      name: 'Elif',
      link: 'https://dugunce.com.tr/auth#tok123',
      code: '123456',
    })

    expect(send).toHaveBeenCalledOnce()
    const payload = send.mock.calls[0]![0] as {
      to: { email: string }[]
      subject: string
      htmlContent: string
      textContent: string
    }
    expect(payload.to[0]!.email).toBe('elif@ornek.com')
    expect(payload.subject).toContain('Düğünce')
  })

  it('link ve kod gövdede bulunur', async () => {
    const { client, send } = makeClient()
    await client.sendMagicLinkEmail({
      to: 'a@b.com',
      name: 'A',
      link: 'https://dugunce.com.tr/auth#tok-abc',
      code: '654321',
    })

    const payload = send.mock.calls[0]![0] as { htmlContent: string; textContent: string }
    expect(payload.htmlContent).toContain('tok-abc')
    expect(payload.htmlContent).toContain('654321')
    expect(payload.textContent).toContain('tok-abc')
    expect(payload.textContent).toContain('654321')
  })

  it('Türkçe karakterler bozulmaz', async () => {
    const { client, send } = makeClient()
    await client.sendMagicLinkEmail({
      to: 'a@b.com',
      name: 'Şükrü Çağrı',
      link: 'https://x/y',
      code: '000000',
    })
    const payload = send.mock.calls[0]![0] as { htmlContent: string }
    expect(payload.htmlContent).toContain('Şükrü Çağrı')
  })

  it('gönderen adresi doğru', async () => {
    const { client, send } = makeClient()
    await client.sendMagicLinkEmail({ to: 'a@b.com', name: 'A', link: 'l', code: '1' })
    const payload = send.mock.calls[0]![0] as { sender: { email: string; name: string } }
    expect(payload.sender.email).toBe('noreply@dugunce.com.tr')
    expect(payload.sender.name).toBe('Düğünce')
  })

  it('transport hatası fırlatır (sessizce yutmaz)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Brevo 401'))
    const client = createEmailClient({ apiKey: 'k', sender: SENDER, transport: send })
    await expect(
      client.sendMagicLinkEmail({ to: 'a@b.com', name: 'A', link: 'l', code: '1' }),
    ).rejects.toThrow(/Brevo/)
  })

  it('HTML kaçışı — isim içinde etiket varsa çalışmaz', async () => {
    const { client, send } = makeClient()
    await client.sendMagicLinkEmail({
      to: 'a@b.com',
      name: '<script>alert(1)</script>',
      link: 'l',
      code: '1',
    })
    const payload = send.mock.calls[0]![0] as { htmlContent: string }
    expect(payload.htmlContent).not.toContain('<script>')
    expect(payload.htmlContent).toContain('&lt;script&gt;')
  })
})

describe('sendInviteEmail', () => {
  it('düğün isimlerini ve linki içerir', async () => {
    const { client, send } = makeClient()
    await client.sendInviteEmail({
      to: 'mert@ornek.com',
      name: 'Mert',
      weddingNames: 'Elif & Mert',
      link: 'https://dugunce.com.tr/invite#abc',
      role: 'CO_OWNER',
    })
    const payload = send.mock.calls[0]![0] as { htmlContent: string }
    expect(payload.htmlContent).toContain('Elif &amp; Mert')
    expect(payload.htmlContent).toContain('abc')
  })

  it('rol metni Türkçe gösterilir', async () => {
    const { client, send } = makeClient()
    await client.sendInviteEmail({
      to: 'a@b.com', name: 'A', weddingNames: 'X & Y', link: 'l', role: 'CO_OWNER',
    })
    const payload = send.mock.calls[0]![0] as { htmlContent: string }
    expect(payload.htmlContent.toLowerCase()).toContain('ortak')
  })
})

describe('createEmailClient — transport seçimi', () => {
  it('transport verilmezse gerçek fetch kullanır', () => {
    const client = createEmailClient({ apiKey: 'k', sender: SENDER })
    expect(client).toHaveProperty('sendMagicLinkEmail')
  })

  it('NODE_ENV=test ve transport yoksa hata fırlatır (yanlışlıkla gerçek mail atmasın)', () => {
    expect(() =>
      createEmailClient({ apiKey: 'k', sender: SENDER, env: 'test' }),
    ).toThrow(/transport/i)
  })
})

describe('API anahtarı yoksa fail-fast', () => {
  it('üretimde boş anahtar hata fırlatır (sessizce devam etmez)', () => {
    // Boş anahtarla Brevo 401 döner, magic link hiç gitmez ve kullanıcı
    // "e-posta gelmedi" der. Uygulamanın açılışta patlaması daha iyi.
    expect(() =>
      createEmailClient({
        apiKey: '',
        sender: { name: 'Düğünce', email: 'noreply@dugunce.com.tr' },
        env: 'production',
      }),
    ).toThrow(/BREVO_API_KEY/)
  })

  it('test ortamında transport varsa anahtar gerekmez', () => {
    const client = createEmailClient({
      apiKey: '',
      sender: { name: 'Düğünce', email: 'noreply@dugunce.com.tr' },
      env: 'test',
      transport: async () => ({}),
    })
    expect(client).toBeDefined()
  })

  it('transport enjekte edilirse üretimde de anahtar gerekmez', () => {
    const client = createEmailClient({
      apiKey: '',
      sender: { name: 'Düğünce', email: 'noreply@dugunce.com.tr' },
      env: 'production',
      transport: async () => ({}),
    })
    expect(client).toBeDefined()
  })

  it('anahtar varsa sorunsuz oluşur', () => {
    const client = createEmailClient({
      apiKey: 'xkeysib-test',
      sender: { name: 'Düğünce', email: 'noreply@dugunce.com.tr' },
      env: 'production',
    })
    expect(client).toBeDefined()
  })
})
