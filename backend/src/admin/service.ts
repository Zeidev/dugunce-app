/**
 * Admin çekirdeği — parola hash'leme, parola güçlülüğü ve hesap kilidi.
 *
 * Kullanıcı (`users`) ve yardımcı (`helpers`) evrenlerinden TAMAMEN AYRI:
 * admin parolası Argon2id ile saklanır, magic-link token'ı ile ilgisi yoktur.
 * İki evren karışırsa tam yetki sızıntısı olur (Review Focus #1).
 *
 * Parola hash'i için Argon2id kullanılır — bu repoda İLK kullanım.
 * Varsayılan parametreler (Argon2id, 19 MiB, t=2, p=1) yeterlidir.
 */

import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'

/** Yönetim parolası için asgari uzunluk — kullanıcı parolasından daha katı. */
export const MIN_ADMIN_PASSWORD_LENGTH = 16
/** Bu sayıya ulaşan ardışık hata hesabı kilitler. */
export const MAX_FAILED_ATTEMPTS = 5
/** Kilit süresi — 15 dakika. */
export const LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * Parolayı Argon2id ile hash'ler.
 *
 * Her çağrıda rastgele tuz üretilir; aynı parola iki farklı hash verir.
 * Düz metin ASLA saklanmaz, loglanmaz (Review Focus #4).
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain)
}

/**
 * Parolayı hash ile doğrular.
 *
 * Bozuk/geçersiz hash'te fırlatmak yerine `false` döner: giriş akışı
 * tek bir "hatalı kimlik bilgisi" yoluna düşsün, hata tipi sızmasın.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, plain)
  } catch {
    return false
  }
}

/**
 * Parola güçlülüğü — uzunluk ≥ 16, en az bir harf, en az bir rakam.
 *
 * `reason` Türkçe ve kullanıcıya gösterilebilir; parolayı asla içermez.
 */
export function validatePasswordStrength(
  plain: string,
): { ok: true } | { ok: false; reason: string } {
  if (plain.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Parola en az ${MIN_ADMIN_PASSWORD_LENGTH} karakter olmalı`,
    }
  }
  if (!/\p{L}/u.test(plain)) {
    return { ok: false, reason: 'Parola en az bir harf içermeli' }
  }
  if (!/\p{N}/u.test(plain)) {
    return { ok: false, reason: 'Parola en az bir rakam içermeli' }
  }
  return { ok: true }
}

/**
 * Hesabın şu anki kilit durumu.
 *
 * `lockedUntil` geçmişte kaldıysa kilit kendiliğinden düşer — ayrı bir
 * temizleme işi gerekmez. `failedAttempts` tek başına kilit sebebi değildir;
 * kilit yalnızca `lockedUntil` ile ifade edilir.
 */
export function computeLockState(
  admin: { failedAttempts: number; lockedUntil: Date | null },
  now: Date = new Date(),
): 'OK' | 'LOCKED' {
  if (!admin.lockedUntil) return 'OK'
  return admin.lockedUntil.getTime() > now.getTime() ? 'LOCKED' : 'OK'
}

/**
 * Bir sonraki başarısız giriş denemesinin durumu.
 *
 * Sayaç `MAX_FAILED_ATTEMPTS`'e ulaştığında `lockedUntil` doldurulur.
 * Sayaç kilit sonrası da artmaya devam eder (bilgi kaybı olmasın); kilit
 * kararı yalnızca `lockedUntil` üzerinden verilir.
 */
export function nextFailedState(
  current: number,
  now: Date = new Date(),
): { failedAttempts: number; lockedUntil: Date | null } {
  const failedAttempts = current + 1
  const lockedUntil =
    failedAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCK_DURATION_MS)
      : null
  return { failedAttempts, lockedUntil }
}
