import pino from 'pino'

/**
 * Yapılandırılmış logger — secret maskeleme ile.
 *
 * Maskeleme kuralları (SECURITY §3.5):
 * - Authorization başlığı
 * - password, token, secret, apiKey alanları
 * - telefon, e-posta
 * - Hata mesajlarındaki bağlantı dizeleri (postgres://...)
 *
 * Üretimde JSON, geliştirmede okunabilir çıktı.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'tokenHash',
  '*.tokenHash',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'phone',
  '*.phone',
  'email',
  '*.email',
  'JWT_SECRET',
  'DATABASE_URL',
  'BACKUP_GPG_PASSPHRASE',
  'BREVO_API_KEY',
  'R2_SECRET_ACCESS_KEY',
  'VAPID_PRIVATE_KEY',
  'APPSTORE_PRIVATE_KEY',
  'PLAY_SERVICE_ACCOUNT_JSON',
  // Push anahtarı bir PAROLADIR: eline geçen proje adına bildirim gönderir.
  'FCM_SERVICE_ACCOUNT_BASE64',
]

/**
 * E-posta maskesi — KVKK.
 *
 * E-posta kişisel veridir ve Drizzle'ın ürettiği hata mesajlarında
 * (`params: kullanici@example.com,1`) düz metin geçiyor.
 *
 * KISMİ maskeleme: ilk 2 karakter + domain korunur. Amaç log'dan
 * "hangi kullanıcı" sorusunu cevaplayabilmek, adresi ifşa etmeden.
 * `lumibyte.dev@gmail.com` → `lu***@gmail.com`
 */
const EMAIL_PATTERN = /([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

/** Bağlantı dizesi desenleri — mesaj içinden temizlenir. */
const CONNECTION_STRING_PATTERNS: Array<[RegExp, string]> = [
  [EMAIL_PATTERN, '$1***$2'],
  [/postgres(ql)?:\/\/[^\s"']+/gi, 'postgres://[REDACTED]'],
  [/mysql:\/\/[^\s"']+/gi, 'mysql://[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]'],
]

/**
 * Bir metindeki hassas desenleri maskeler.
 * Hata mesajları için kullanılır — Pino'nun redact'i nested `err.message`'i
 * güvenilir şekilde temizlemediği için ayrıca uygulanır.
 */
export function scrubText(input: string): string {
  let out = input
  for (const [pattern, replacement] of CONNECTION_STRING_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * Log objesini maskeler — `err` alanının mesajını da temizler.
 */
export function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...obj }

  if (copy['err'] instanceof Error) {
    const e = copy['err'] as Error
    copy['err'] = {
      name: e.name,
      message: scrubText(e.message),
      stack: e.stack ? scrubText(e.stack) : undefined,
    }
  }

  if (typeof copy['message'] === 'string') {
    copy['message'] = scrubText(copy['message'] as string)
  }

  return copy
}

const isProduction = process.env['NODE_ENV'] === 'production'

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? (isProduction ? 'info' : 'debug'),
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  // Hata mesajlarını ve stack'ini desen bazlı temizle
  hooks: {
    logMethod(args, method) {
      const cleaned = args.map((arg) => {
        if (typeof arg === 'string') return scrubText(arg)
        if (arg instanceof Error) {
          const e = new Error(scrubText(arg.message))
          e.name = arg.name
          e.stack = arg.stack ? scrubText(arg.stack) : undefined
          return e
        }
        if (arg && typeof arg === 'object') return redact(arg as Record<string, unknown>)
        return arg
      })
      return method.apply(this, cleaned as Parameters<typeof method>)
    },
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
})
