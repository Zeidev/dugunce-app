import { createSign } from 'node:crypto'

/**
 * FCM HTTP v1 istemcisi — SDK YOK.
 *
 * NEDEN `firebase-admin` KULLANILMIYOR: o paket grpc native ikilisi
 * getirir (~50 MB) ve backend serv00 paylaşımlı hosting'te Passenger
 * altında çalışıyor; native ikili orada kırılgan. İhtiyaç duyulan tek
 * şey bir RSA imzası — `node:crypto` yeterli. Böylece `package.json`
 * dependencies listesi DEĞİŞMEZ.
 *
 * PROTOKOL:
 *  1. Service account ile RS256 imzalı JWT üret (aud = OAuth2 ucu).
 *  2. JWT'yi `jwt-bearer` grant'iyle takas et → access token.
 *  3. `Authorization: Bearer <token>` ile `messages:send` çağır.
 */

export interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

/**
 * Gönderim sonucu.
 *
 * `unregistered` AYRI ALAN: çağıran ölü token'ı DB'den silmeli. Bunu
 * `reason` metninden ayıklamak kırılgan olurdu (FCM hata biçimi
 * değişebilir).
 */
export type FcmResult =
  | { ok: true }
  | { ok: false; unregistered: boolean; reason: string }

export interface FcmSender {
  send(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<FcmResult>
}

const OAUTH_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

/** Token ömründen 60 sn önce yenile — saat kayması payı. */
const TOKEN_SAFETY_MS = 60_000

/**
 * Base64 service account JSON'unu ayrıştırır.
 *
 * HER HATA `null` DÖNER, fırlatmaz. NEDEN: `PUSH_ENABLED=true` ama
 * anahtar bozuksa uygulamanın geri kalanı (giriş, harcama, davetli)
 * çalışmaya devam etmeli. Push tek bir özellik; onun yüzünden sunucu
 * açılmamazlık etmemeli.
 */
export function parseServiceAccount(base64: string): ServiceAccount | null {
  if (base64.trim() === '') return null

  let json: unknown
  try {
    json = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null

  const rec = json as Record<string, unknown>
  const projectId = rec['project_id']
  const clientEmail = rec['client_email']
  const privateKey = rec['private_key']

  if (typeof projectId !== 'string' || projectId === '') return null
  if (typeof clientEmail !== 'string' || clientEmail === '') return null
  if (typeof privateKey !== 'string' || privateKey === '') return null

  return { project_id: projectId, client_email: clientEmail, private_key: privateKey }
}

/**
 * FCM göndericisi üretir.
 *
 * `fetchImpl` enjekte edilebilir: testler ağa çıkmadan davranışı sınar.
 */
export function createFcmSender(
  account: ServiceAccount,
  fetchImpl: typeof fetch = fetch,
): FcmSender {
  /** OAuth2 access token önbelleği — modül kapanışında, çağrılar arası. */
  let cached: { value: string; expiresAt: number } | null = null

  async function accessToken(): Promise<string> {
    const now = Date.now()
    if (cached !== null && now < cached.expiresAt - TOKEN_SAFETY_MS) {
      return cached.value
    }

    const iat = Math.floor(now / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: OAUTH_URL,
        iat,
        exp: iat + 3600,
      }),
    )
    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${claims}`)
    const signature = signer.sign(account.private_key)
    const jwt = `${header}.${claims}.${b64url(signature)}`

    const res = await fetchImpl(OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    })
    if (!res.ok) throw new Error(`OAuth2 ${res.status}`)

    const body: unknown = await res.json()
    const rec = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const token = rec['access_token']
    const expiresIn = rec['expires_in']
    if (typeof token !== 'string' || token === '') throw new Error('OAuth2: access_token yok')

    const ttlSec = typeof expiresIn === 'number' ? expiresIn : 3600
    cached = { value: token, expiresAt: now + ttlSec * 1000 }
    return token
  }

  return {
    async send(token, title, body, data) {
      let bearer: string
      try {
        bearer = await accessToken()
      } catch (err) {
        return { ok: false, unregistered: false, reason: errText(err) }
      }

      const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`

      let res: Response
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { token, notification: { title, body }, data },
          }),
        })
      } catch (err) {
        // Ağ hatası FIRLATILMAZ: bir token'ın hatası tüm gönderimi
        // durdurmamalı (servis döngüsü devam eder).
        return { ok: false, unregistered: false, reason: errText(err) }
      }

      if (res.ok) return { ok: true }

      const text = await res.text().catch(() => '')
      /*
        `UNREGISTERED` = uygulama kaldırılmış veya token ölmüş.
        Çağıran bu token'ı SİLMELİ; yoksa her bildirimde boşa istek
        atılır ve FCM kotası tükenir.
      */
      const unregistered = res.status === 404 && text.includes('UNREGISTERED')
      return { ok: false, unregistered, reason: `FCM ${res.status}: ${text.slice(0, 200)}` }
    },
  }
}

/**
 * Ortamdan gönderici üretir; yapılandırma eksikse `null`.
 *
 * `null` = "push kapalı" (hata değil). Çağıran `null` görünce gönderimi
 * atlar; uygulamanın kalanı etkilenmez.
 */
export function createFcmSenderFromEnv(
  env: { PUSH_ENABLED: boolean; FCM_SERVICE_ACCOUNT_BASE64?: string | undefined },
  fetchImpl: typeof fetch = fetch,
): FcmSender | null {
  if (!env.PUSH_ENABLED) return null
  const account = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_BASE64 ?? '')
  if (account === null) return null
  return createFcmSender(account, fetchImpl)
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
