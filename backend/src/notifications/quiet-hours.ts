import { DEFAULT_TIMEZONE } from '../lib/month.js'

/**
 * Sessiz saat mantığı — spec §6b.3.
 *
 * SAF FONKSİYON: `Date.now()` çağrılmıyor, "şimdi" parametre olarak
 * geliyor. NEDEN: gece 03:00 senaryosu ancak sistem saatini değiştirerek
 * sınanabilirdi; CI'da tekrarlanamaz ve yerelde de kırılgandır.
 */

/** Sessiz saat başlangıcı (dahil) — 22:00. */
const QUIET_START_HOUR = 22

/** Sessiz saat bitişi (hariç) — 09:00. */
const QUIET_END_HOUR = 9

/**
 * Düğün öncesi istisna penceresi (gün).
 *
 * Spec §6b.3: "Sessiz saat 22:00–09:00 arası bildirim gönderilmez
 * (düğün öncesi hafta hariç)". Son hafta RSVP ve görev trafiği zirvede;
 * gece gelen bir yanıt sabaha kadar beklememeli.
 */
const PRE_WEDDING_DAYS = 7

/**
 * Şu an bildirim gönderilmeli mi?
 *
 * SIRA ÖNEMLİ — kurallar şu sırayla değerlendirilir:
 *
 *  1. `quietHoursOverride` → her şeyi ezer (kullanıcı tercihi).
 *  2. Düğüne 0 < kalan ≤ 7 gün → istisna, gönderilir.
 *  3. 22:00–09:00 arası → GÖNDERİLMEZ.
 *  4. Aksi hâlde gönderilir.
 *
 * NEDEN düğün GEÇMİŞSE istisna yok: arşivlenmiş bir düğün için gece
 * bildirimi anlamsız gürültü. `daysLeft <= 0` istisnayı kapatır.
 */
export function shouldSendNow(
  now: Date,
  weddingDate: Date | null,
  quietHoursOverride: boolean,
  timezone: string = DEFAULT_TIMEZONE,
): boolean {
  if (quietHoursOverride) return true

  if (weddingDate !== null) {
    const msLeft = weddingDate.getTime() - now.getTime()
    const daysLeft = msLeft / (24 * 60 * 60 * 1000)
    if (daysLeft > 0 && daysLeft <= PRE_WEDDING_DAYS) return true
  }

  const hour = hourIn(timezone, now)
  // Aralık günü aşar: [22, 24) ∪ [0, 9)
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return false
  return true
}

/**
 * Verilen anın saat dilimindeki saatini (0–23) döner.
 *
 * NEDEN `Intl.DateTimeFormat`, sabit ofset DEĞİL: `Europe/Istanbul`
 * 2016'dan beri sabit UTC+3 ama tarihsel kayıtlarda yaz saati vardı.
 * Sabit ofset varsaymak, eski bir tarihle çalışan bir testte sessizce
 * yanlış sonuç verir. `Intl` doğru cevabı verir.
 */
function hourIn(timezone: string, at: Date): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(at)
  // `en-GB` + hour12:false → "14"; gece yarısı "00" (bazı ICU
  // sürümlerinde "24") → % 24 ile normalize edilir.
  return Number.parseInt(formatted, 10) % 24
}
