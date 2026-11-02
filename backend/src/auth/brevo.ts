/**
 * E-posta gönderimi — Brevo.
 *
 * Transport enjekte edilebilir: test ortamında gerçek ağ çağrısı yapılmaz,
 * mock transport kullanılır. DNS/domain doğrulaması tamamlanmadan da
 * kod çalışır ve test edilir (design §15.2).
 */

export interface EmailSender {
  name: string
  email: string
}

export interface BrevoPayload {
  sender: EmailSender
  to: { email: string; name?: string }[]
  subject: string
  htmlContent: string
  textContent: string
}

export type EmailTransport = (payload: BrevoPayload) => Promise<unknown>

export interface CreateEmailClientOptions {
  apiKey: string
  sender: EmailSender
  /** Test için mock; verilmezse gerçek Brevo API'sine gider. */
  transport?: EmailTransport
  /** Test ortamında transport zorunlu — kazara gerçek mail atılmasın. */
  env?: string
}

export interface MagicLinkEmailParams {
  to: string
  name: string
  link: string
  code: string
}

export interface InviteEmailParams {
  to: string
  name: string
  weddingNames: string
  link: string
  role: string
}

/** HTML özel karakterlerini kaçırır — XSS önlemi. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function roleLabel(role: string): string {
  switch (role) {
    case 'CO_OWNER':
      return 'ortak'
    case 'OWNER':
      return 'sahip'
    default:
      return 'yardımcı'
  }
}

/** Gerçek Brevo API transport'u. */
function brevoHttpTransport(apiKey: string): EmailTransport {
  return async (payload) => {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Brevo gönderim hatası: ${res.status} ${body.slice(0, 200)}`)
    }

    return res.json()
  }
}

export interface EmailClient {
  sendMagicLinkEmail(params: MagicLinkEmailParams): Promise<void>
  sendInviteEmail(params: InviteEmailParams): Promise<void>
}

export function createEmailClient(options: CreateEmailClientOptions): EmailClient {
  const { apiKey, sender, env } = options

  // Güvenlik: test ortamında transport verilmediyse gerçek mail atmayalım
  if (!options.transport && env === 'test') {
    throw new Error('Test ortamında e-posta transport\'u zorunlu (gerçek mail atılmasın)')
  }

  // FAIL-FAST: üretimde API anahtarı yoksa sessizce devam etme.
  //
  // Boş anahtarla Brevo 401 döner, magic link hiç gönderilmez ve
  // kullanıcı "e-posta gelmedi" der — sebebi loglarda kaybolur.
  // Uygulamanın açılışta patlaması, sessizce giriş yapılamamasından iyidir.
  if (!options.transport && env !== 'test' && !apiKey) {
    throw new Error(
      'BREVO_API_KEY tanımlı değil — e-posta gönderilemez, giriş çalışmaz',
    )
  }

  const transport = options.transport ?? brevoHttpTransport(apiKey)

  return {
    async sendMagicLinkEmail({ to, name, link, code }: MagicLinkEmailParams) {
      const safeName = escapeHtml(name)
      const safeLink = escapeHtml(link)

      const html = `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:22px;color:#2d3a2e">Düğünce</h1>
          <p style="margin:0 0 24px;color:#7a746a;font-size:14px">Düğün hazırlığın tek yerde</p>

          <p style="margin:0 0 16px;color:#33302b;font-size:15px">Merhaba ${safeName},</p>
          <p style="margin:0 0 24px;color:#33302b;font-size:15px;line-height:1.6">
            Giriş yapmak için aşağıdaki butona dokun. Bağlantı <strong>5 dakika</strong> geçerlidir.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr><td style="background:#4a5f45;border-radius:10px;padding:14px 28px">
              <a href="${safeLink}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">Giriş yap</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;color:#7a746a;font-size:13px">Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:</p>
          <p style="margin:0 0 24px;word-break:break-all;font-size:12px;color:#4a5f45">${safeLink}</p>

          <div style="border-top:1px solid #eee;padding-top:20px">
            <p style="margin:0 0 8px;color:#7a746a;font-size:13px">Ya da uygulamada bu kodu gir:</p>
            <p style="margin:0;font-size:26px;letter-spacing:6px;font-weight:700;color:#2d3a2e">${escapeHtml(code)}</p>
          </div>

          <p style="margin:24px 0 0;color:#aeaeb2;font-size:12px;line-height:1.5">
            Bu girişi sen istemediysen bu e-postayı yok sayabilirsin.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

      const text = `Düğünce — Giriş

Merhaba ${name},

Giriş yapmak için: ${link}

Kod: ${code}

Bağlantı 5 dakika geçerlidir.
Bu girişi sen istemediysen bu e-postayı yok sayabilirsin.`

      await transport({
        sender,
        to: [{ email: to, name }],
        subject: 'Düğünce — Giriş bağlantın',
        htmlContent: html,
        textContent: text,
      })
    },

    async sendInviteEmail({ to, name, weddingNames, link, role }: InviteEmailParams) {
      const safeName = escapeHtml(name)
      const safeWedding = escapeHtml(weddingNames)
      const safeLink = escapeHtml(link)
      const label = roleLabel(role)

      const html = `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:22px;color:#2d3a2e">Düğünce</h1>
          <p style="margin:0 0 24px;color:#7a746a;font-size:14px">Düğün hazırlığın tek yerde</p>

          <p style="margin:0 0 16px;color:#33302b;font-size:15px">Merhaba ${safeName},</p>
          <p style="margin:0 0 24px;color:#33302b;font-size:15px;line-height:1.6">
            <strong>${safeWedding}</strong> düğününe <strong>${label}</strong> olarak davet edildin.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr><td style="background:#4a5f45;border-radius:10px;padding:14px 28px">
              <a href="${safeLink}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">Katıl</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;color:#7a746a;font-size:13px">Buton çalışmazsa:</p>
          <p style="margin:0;word-break:break-all;font-size:12px;color:#4a5f45">${safeLink}</p>

          <p style="margin:24px 0 0;color:#aeaeb2;font-size:12px;line-height:1.5">
            Bu daveti beklemiyorsan bu e-postayı yok sayabilirsin.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

      const text = `Düğünce — Davet

Merhaba ${name},

${weddingNames} düğününe ${label} olarak davet edildin.

Katılmak için: ${link}

Bu daveti beklemiyorsan bu e-postayı yok sayabilirsin.`

      await transport({
        sender,
        to: [{ email: to, name }],
        subject: `${weddingNames} — Düğünce daveti`,
        htmlContent: html,
        textContent: text,
      })
    },
  }
}
