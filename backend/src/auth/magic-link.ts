import { generateToken, hashToken, generateShortCode } from '../lib/crypto.js'

/**
 * Magic link — giriş bağlantısı üretimi.
 *
 * Akış (design §15.1):
 * 1. E-posta normalize edilir, kullanıcı bulunur/oluşturulur
 * 2. 32 bayt token + 6 haneli yedek kod üretilir
 * 3. **Yalnızca hash'leri** DB'ye yazılır (5 dk TTL)
 * 4. Ham token + kod e-posta ile gönderilir
 * 5. Önceki kullanılmamış linkler geçersiz kılınır
 *
 * GET isteği token'ı TÜKETMEZ — e-posta güvenlik tarayıcıları linki
 * yakalarsa kullanıcı dışarıda kalmasın. Tüketim yalnızca POST /auth/verify.
 */

export const MAGIC_LINK_TTL_MINUTES = 5
/**
 * Giriş bağlantısının tabanı.
 *
 * **Sondaki eğik çizgi ÖNEMLİ:** Cloudflare Pages `/auth` isteğini
 * `/auth/` adresine 308 ile yönlendiriyor. Yönlendirme fragment'ı
 * koruyabilir ama garanti değil — bazı tarayıcı sürümleri ve proxy'ler
 * `Location` başlığını izlerken `#token` kısmını düşürür. Doğrudan
 * `/auth/` üretmek bu riski tamamen ortadan kaldırır.
 */
export const MAGIC_LINK_BASE_URL = 'https://dugunce.com.tr/auth/'

/** Basit ama yeterli e-posta doğrulama (RFC 5322'nin pratik alt kümesi). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * E-postayı normalize eder: trim + lowercase + doğrulama.
 *
 * @throws {Error} format geçersizse
 */
export function normalizeEmail(input: string): string {
  const normalized = input.trim().toLowerCase()
  if (!EMAIL_RE.test(normalized)) {
    throw new Error('Geçersiz e-posta adresi')
  }
  return normalized
}

export interface MagicLinkUser {
  id: string
  email: string
  displayName?: string
  status?: string
}

export interface MagicLinkDeps {
  findUserByEmail: (email: string) => Promise<MagicLinkUser | null>
  createUser: (email: string, displayName: string) => Promise<MagicLinkUser>
  insertMagicLink: (row: {
    userId: string
    tokenHash: string
    shortCodeHash: string
    expiresAt: Date
  }) => Promise<unknown>
  invalidatePreviousLinks: (userId: string) => Promise<number>
  sendEmail: (params: {
    to: string
    name: string
    link: string
    code: string
  }) => Promise<void>
}

export interface RequestMagicLinkParams {
  email: string
  deps: MagicLinkDeps
}

/**
 * Magic link isteği — kullanıcı yoksa oluşturur, e-posta gönderir.
 *
 * @throws {Error} e-posta geçersizse, kullanıcı askıya alınmışsa veya
 *                 gönderim başarısızsa
 */
export async function requestMagicLink({
  email,
  deps,
}: RequestMagicLinkParams): Promise<void> {
  const normalized = normalizeEmail(email)

  // Kullanıcıyı bul veya oluştur
  let user = await deps.findUserByEmail(normalized)
  if (!user) {
    const displayName = normalized.split('@')[0] ?? 'Kullanıcı'
    user = await deps.createUser(normalized, displayName)
  }

  // Askıya alınmış/silinmiş kullanıcıya link gönderilmez
  if (user.status && user.status !== 'ACTIVE') {
    throw new Error('Bu hesap kullanılamıyor')
  }

  // Önceki kullanılmamış linkleri geçersiz kıl — tek aktif link
  await deps.invalidatePreviousLinks(user.id)

  // Token + yedek kod
  const rawToken = generateToken(32)
  const rawCode = generateShortCode()
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000)

  // Yalnızca hash'ler DB'ye
  await deps.insertMagicLink({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    shortCodeHash: hashToken(rawCode),
    expiresAt,
  })

  // Ham değerler yalnızca e-postada
  const link = `${MAGIC_LINK_BASE_URL}#${rawToken}`

  await deps.sendEmail({
    to: user.email,
    name: user.displayName ?? 'Merhaba',
    link,
    code: rawCode,
  })
}

// ---------------------------------------------------------------------------
// Doğrulama (token tüketimi)
// ---------------------------------------------------------------------------

export const MAX_CODE_ATTEMPTS = 3

export interface VerifyMagicLinkDeps {
  findMagicLinkByHash: (hash: string) => Promise<{
    id: string
    userId: string
    attempts: number
    expiresAt: Date
    usedAt: Date | null
    shortCodeHash?: string | null
  } | null>
  /** Kod yolu: kod hash'ine göre aktif kaydı bulur. */
  findMagicLinkByShortCode?: (hash: string) => Promise<{
    id: string
    userId: string
    attempts: number
    expiresAt: Date
    usedAt: Date | null
    shortCodeHash?: string | null
  } | null>
  markMagicLinkUsed: (id: string) => Promise<boolean>
  incrementAttempts: (id: string) => Promise<number>
  findUserById: (id: string) => Promise<{
    id: string
    email: string
    displayName?: string
    status?: string
  } | null>
  issueTokens: (userId: string) => Promise<{
    accessToken: string
    refreshToken: string
  }>
  touchLastLogin: (userId: string) => Promise<void>
}

export interface VerifyMagicLinkParams {
  token?: string
  code?: string
  deps: VerifyMagicLinkDeps
}

export interface VerifyResult {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; displayName?: string }
}

/**
 * Magic link doğrulama — token'ı TÜKETİR.
 *
 * Güvenlik sırası:
 * 1. Hash'le, DB'de ara — bulunamazsa **genel hata** (enumeration koruması)
 * 2. Kullanılmışsa reddet
 * 3. Süresi dolmuşsa reddet
 * 4. Deneme limiti aşılmışsa reddet
 * 5. Kod yolu: yanlışsa attempts++ ve reddet
 * 6. Token yolu: **koşullu UPDATE** (WHERE used_at IS NULL) — yarış koşulu koruması
 * 7. Kullanıcı askıya alınmışsa reddet
 * 8. Token çifti üret, last_login güncelle
 */
export async function verifyMagicLink({
  token,
  code,
  deps,
}: VerifyMagicLinkParams): Promise<VerifyResult> {
  if (!token && !code) {
    throw new Error('Token veya kod gerekli')
  }

  // Token yolu: token hash'i ile doğrudan arama.
  // Kod yolu: kod hash'i ile arama (kod 6 hane, 1M olasılık — rate limit korur).
  let record: Awaited<ReturnType<VerifyMagicLinkDeps['findMagicLinkByHash']>> = null

  if (token) {
    record = await deps.findMagicLinkByHash(hashToken(token))
  } else if (code) {
    if (!deps.findMagicLinkByShortCode) {
      throw new Error('Kod ile giriş desteklenmiyor')
    }
    record = await deps.findMagicLinkByShortCode(hashToken(code))
  }

  // Enumeration koruması: bulunamadı / kullanılmış / süresi dolmuş
  // aynı mesajı verir (sadece süre için ayrı mesaj test ediliyor)
  if (!record) {
    throw new Error('Geçersiz veya süresi dolmuş giriş bağlantısı')
  }

  if (record.usedAt !== null) {
    throw new Error('Geçersiz veya süresi dolmuş giriş bağlantısı')
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw new Error('Giriş bağlantısının süresi dolmuş')
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    throw new Error('Çok fazla hatalı deneme — yeni bağlantı isteyin')
  }

  // Kod yolu: kodu doğrula
  if (code) {
    const expected = record.shortCodeHash
    if (!expected || hashToken(code) !== expected) {
      await deps.incrementAttempts(record.id)
      throw new Error('Giriş kodu hatalı')
    }
  }

  // Token tüketimi — KOŞULLU UPDATE (yarış koşulu koruması)
  const consumed = await deps.markMagicLinkUsed(record.id)
  if (!consumed) {
    // Başka bir istek aynı token'ı aynı anda tüketti
    throw new Error('Geçersiz veya süresi dolmuş giriş bağlantısı')
  }

  // Kullanıcı kontrolü
  const user = await deps.findUserById(record.userId)
  if (!user) {
    throw new Error('Kullanıcı bulunamadı')
  }
  if (user.status && user.status !== 'ACTIVE') {
    throw new Error('Bu hesap kullanılamıyor')
  }

  const tokens = await deps.issueTokens(user.id)
  await deps.touchLastLogin(user.id)

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: { id: user.id, email: user.email, displayName: user.displayName },
  }
}
