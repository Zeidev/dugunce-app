/**
 * "Bu ay" hesabı — saat dilimine duyarlı.
 *
 * NEDEN AYRI MODÜL:
 * Ay hesaplaması iki yerde gerekiyor (bütçe özeti varsayılanı, ileride
 * raporlar) ve yanlış yapıldığında SESSİZ hata veriyor: rakamlar doğru
 * görünür, yalnız hangi aya ait olduğu yanlıştır.
 *
 * ESKİ HATA: `new Date().toISOString().slice(0, 7)` kullanılıyordu.
 * `toISOString()` UTC'ye çevirir; Türkiye UTC+3 olduğu için ayın ilk
 * günü 00:00–03:00 arasında "bu ay" hâlâ ÖNCEKİ aydı. Ayın 1'inde
 * sabah erkenden bütçesini açan çift yanlış ayın taksitlerini görüyordu.
 */

/** Çiftin saat dilimi belirtilmediğinde kullanılan varsayılan. */
export const DEFAULT_TIMEZONE = 'Europe/Istanbul'

/**
 * Verilen anda, verilen saat diliminde içinde bulunulan ay (`YYYY-MM`).
 *
 * @param timezone IANA saat dilimi. Geçersizse `DEFAULT_TIMEZONE`.
 * @param now Test edilebilirlik için; varsayılan şimdiki an.
 */
export function currentMonthIn(
  timezone?: string | null,
  now: Date = new Date(),
): string {
  const tz = normalizeTimezone(timezone)

  // `en-CA` yerel biçimi `YYYY-MM-DD` verir — ayrıştırma gerekmez.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value

  // Saat dilimi motoru şaşarsa UTC'ye düş — ay hesabı hiç olmamasından
  // iyidir ve bu yol pratikte erişilemez.
  if (!year || !month) return now.toISOString().slice(0, 7)
  return `${year}-${month}`
}

/** Geçersiz/boş saat dilimini varsayılana çevirir. */
export function normalizeTimezone(timezone?: string | null): string {
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    return DEFAULT_TIMEZONE
  }
  try {
    // Geçersiz dilim `RangeError` atar — burada yakalayıp varsayılana döneriz.
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    return timezone
  } catch {
    return DEFAULT_TIMEZONE
  }
}
