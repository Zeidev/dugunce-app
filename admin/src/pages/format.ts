/**
 * Tarih/sayı biçimlendirme yardımcıları — sayfalar arasında ORTAK.
 *
 * NEDEN AYRI DOSYA: altı sayfa tarih gösteriyor. Her sayfada
 * `new Date(...)` + `toLocaleString` yazmak, birinde `tr-TR` diğerinde
 * tarayıcı yerel ayarı kullanılmasına ve aynı panelde iki farklı biçim
 * (05.11.2026 vs 11/5/2026) görünmesine yol açardı.
 *
 * TÜM FONKSİYONLAR GEÇERSİZ TARİHTE "—" DÖNER. `toLocaleString` geçersiz
 * tarihte "Invalid Date" yazar; operatöre anlamsız bir metin göstermek
 * yerine veri eksikliğini açıkça belirtmek doğru.
 */

/** Geçersiz/boş değerde gösterilecek metin. */
const MISSING = '—'

/**
 * ISO metni `Date`e çevirir; geçersizse `null`.
 *
 * NEDEN `Number.isNaN`: `new Date('bozuk').getTime()` `NaN` döner.
 * `isNaN(date)` de çalışırdı ama `Date` nesnesini sayıya zorlar ve
 * `noImplicitAny`/`strict` altında niyeti gizler.
 */
function parse(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === '') return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** `12.09.2026` — gün bazlı gösterim (tablo kolonları). */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso)
  if (date === null) return MISSING
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** `12.09.2026 19:00` — saat önemliyse (denetim kaydı, detay). */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso)
  if (date === null) return MISSING
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Oranı yüzde metnine çevirir: `(3, 38)` → `%7,9`.
 *
 * NEDEN TAM SAYIYA YUVARLAMIYORUZ: premium oranı v1'de tek haneli
 * olacak (%2-8). Tam sayıya yuvarlamak `%0` gösterir ve "hiç satış yok"
 * izlenimi verir — oysa satış var.
 *
 * `total === 0` → `%0` DEĞİL `—`: sıfıra bölme tanımsız; "%0" demek
 * "oran sıfır" iddiasıdır, oysa hiç düğün yok.
 */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) return MISSING
  const ratio = (part / total) * 100
  return `%${ratio.toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`
}
