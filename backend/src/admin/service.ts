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
import { logger } from '../lib/logger.js'

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
  // NFC NORMALİZASYONU ZORUNLU — Türkçe için hayati.
  //
  // "ş" tek kod noktası (U+015F) veya "s" + birleşik çengel (U+0073
  // U+0327) olarak yazılabilir. İkisi EKRANDA AYNI görünür ama farklı
  // baytlardır; normalize edilmezse doğru parola reddedilir.
  // Farklı işletim sistemi / klavye / IME girdileri bu farkı üretir.
  return argon2Hash(plain.normalize('NFC'))
}

/**
 * Parolayı hash ile doğrular.
 *
 * Bozuk/geçersiz hash'te fırlatmak yerine `false` döner: giriş akışı
 * tek bir "hatalı kimlik bilgisi" yoluna düşsün, hata tipi sızmasın.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    // `hashPassword` ile AYNI normalizasyon — aksi hâlde yazım ile
    // doğrulama farklı baytları karşılaştırır.
    return await argon2Verify(hash, plain.normalize('NFC'))
  } catch (err) {
    // Bozuk hash / argon2 hatası ile "yanlış parola" AYNI sonucu döner
    // (hata tipi sızmasın), ama LOG'A yazılır: aksi hâlde bozuk bir
    // kayıt sessizce sayaç artırır ve hesabı kalıcı kilitler.
    // Parola ASLA log'lanmaz.
    logger.error({ err }, 'admin parola doğrulaması başarısız (altyapı hatası)')
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
 * SAYAÇ KİLİT DOLUNCA SIFIRLANIR. Aksi hâlde şu ölümcül döngü oluşur:
 *
 *   1. 5 hatalı deneme → kilit (15 dk), `failedAttempts = 5`
 *   2. Kilit dolar, sayaç hâlâ 5 (yalnız `lockedUntil` geçmişte)
 *   3. TEK bir hatalı deneme → sayaç 6 → YENİDEN 15 dk kilit
 *
 * Yani saldırgan 15 dakikada bir istek atarak TEK admin hesabını kalıcı
 * olarak kilitleyebilir — parola sıfırlama akışı da yok. Kullanıcı
 * doğrulandı: bu senaryo gerçekti.
 *
 * Çözüm: `current` zaten `MAX_FAILED_ATTEMPTS` veya üzerindeyse (yani
 * önceki kilit dolmuş ve sayaç temizlenmemişse) sayaç 1'den başlar.
 * Kilit kararı yine `lockedUntil` üzerinden verilir.
 */
export function nextFailedState(
  current: number,
  now: Date = new Date(),
): { failedAttempts: number; lockedUntil: Date | null } {
  // Önceki kilit dönemi bittiyse sayaç YENİDEN başlar.
  const base = current >= MAX_FAILED_ATTEMPTS ? 0 : current
  const failedAttempts = base + 1
  const lockedUntil =
    failedAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCK_DURATION_MS)
      : null
  return { failedAttempts, lockedUntil }
}
