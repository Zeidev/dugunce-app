import { z } from 'zod'

/**
 * Ortam değişkenleri şeması.
 *
 * Zorunlu alanlar eksikse veya geçersizse uygulama başlamaz — yarı yapılandırılmış
 * bir sunucunun çalışmasındansa hiç başlamaması daha güvenlidir.
 *
 * Hata mesajlarına secret DEĞERLERİ yazılmaz; yalnızca alan adları.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL boş olamaz')
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL postgres:// veya postgresql:// ile başlamalı',
    }),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET en az 32 karakter olmalı'),

  NODE_ENV: z.enum(['development', 'test', 'production'], {
    errorMap: () => ({ message: 'NODE_ENV development | test | production olmalı' }),
  }),

  PORT: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? 3000 : Number(v)))
    .pipe(z.number().int().positive().max(65535)),

  // --- Opsiyonel: ilgili aşamada zorunlu olur ---
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  PLAY_SERVICE_ACCOUNT_JSON: z.string().optional(),
  APPSTORE_KEY_ID: z.string().optional(),
  APPSTORE_ISSUER_ID: z.string().optional(),
  APPSTORE_PRIVATE_KEY: z.string().optional(),

  BACKUP_GPG_PASSPHRASE: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

/**
 * Ortam değişkenlerini doğrular.
 *
 * @param source Ham ortam (varsayılan: process.env)
 * @throws {Error} Doğrulama başarısızsa — hangi alanların sorunlu olduğunu söyler,
 *                 değerleri sızdırmaz.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => {
        const field = issue.path.join('.') || '(kök)'
        return `  • ${field}: ${issue.message}`
      })
      .join('\n')

    // DİKKAT: hata mesajına değer yazılmaz — sadece alan adı ve kural.
    throw new Error(`Ortam değişkenleri geçersiz:\n${fields}`)
  }

  return result.data
}
