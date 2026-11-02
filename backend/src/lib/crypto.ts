import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Kriptografik token yardımcıları.
 *
 * Kural (SECURITY §1.2, §2): Token'lar DB'de **hash'li** saklanır.
 * Ham token yalnızca kullanıcıya gönderilir, asla kalıcı yazılmaz.
 */

/** Davet kodunda kullanılan karakter seti — karışan karakterler çıkarıldı. */
const INVITE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0,O,1,I yok
const INVITE_LENGTH = 7

/**
 * Kriptografik rastgele token (base64url).
 *
 * Varsayılan 32 bayt = 256 bit entropi (SECURITY §1.2 min 128 bit ister).
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Token'ı SHA-256 ile hash'ler (hex).
 *
 * DB'de yalnızca bu değer saklanır. Token'lar yüksek entropili olduğu için
 * SHA-256 yeterlidir — parola gibi yavaş hash (argon2) gerekmez.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * 6 haneli yedek giriş kodu (kriptografik rastgele).
 *
 * Deep link çalışmadığında kullanıcı bu kodu web sayfasına girer.
 * Başında sıfır olabilir — padStart ile korunur.
 */
export function generateShortCode(): string {
  // Modulo bias'ı önlemek için reddetme örneklemesi
  const MAX = 1_000_000
  const LIMIT = Math.floor(0xffffffff / MAX) * MAX
  let n: number
  do {
    n = randomBytes(4).readUInt32BE(0)
  } while (n >= LIMIT)
  return (n % MAX).toString().padStart(6, '0')
}

/**
 * 7 karakterli davet kodu (CO_OWNER için).
 *
 * Karışan karakterler (0/O, 1/I) çıkarıldı — kullanıcı telefonda okuyup
 * yazabilsin. 32^7 ≈ 3.4e10 kombinasyon, kaba kuvvete karşı yeterli
 * (rate limit ile birlikte).
 */
export function generateInviteCode(): string {
  const MAX_VALID = Math.floor(256 / INVITE_CHARSET.length) * INVITE_CHARSET.length
  let code = ''
  while (code.length < INVITE_LENGTH) {
    const buf = randomBytes(INVITE_LENGTH * 2)
    for (const byte of buf) {
      if (byte >= MAX_VALID) continue // modulo bias'ı önle
      code += INVITE_CHARSET[byte % INVITE_CHARSET.length]
      if (code.length === INVITE_LENGTH) break
    }
  }
  return code
}

/**
 * Sabit zamanlı hash karşılaştırma — timing saldırısını önler.
 *
 * Geçersiz hex veya farklı uzunlukta hata fırlatmaz, false döner.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')

  // Buffer.from geçersiz hex'te kısaltır — uzunluk kontrolü şart
  if (bufA.length !== bufB.length || bufA.length === 0) return false

  return timingSafeEqual(bufA, bufB)
}
