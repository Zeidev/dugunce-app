/**
 * Davetiye sayfası — harita bağlantısı üretimi.
 *
 * Ayrı modül, çünkü `d/index.html` statik bir sayfa ve JS'i birim
 * testiyle sınanamıyor. Karar mantığı burada durur, sayfa buradan
 * import eder.
 *
 * KURAL (kullanıcı isteği): adres alanında her şablonda "haritada
 * göster" butonu olsun ve Google Maps'te açsın. Çift `mapUrl` girdiyse
 * o önceliklidir (özel pin); girmediyse adresten otomatik üretilir —
 * yoksa buton pratikte hiç görünmüyordu (mobilde `mapUrl` alanı yok).
 */

/** Google Maps evrensel arama ucu — API anahtarı gerektirmez. */
const MAPS_SEARCH = 'https://www.google.com/maps/search/?api=1&query='

/**
 * Harita bağlantısını çözer.
 *
 * @param {object} data — `/invitations/:token` yanıtı
 * @returns {string|null} açılabilir https URL, yoksa null
 */
export function resolveMapUrl(data) {
  if (!data || typeof data !== 'object') return null

  // 1. Çiftin girdiği bağlantı öncelikli — özel pin, koordinat, ne varsa.
  //    YALNIZ http(s): `javascript:`/`data:` şeması `<a href>` içine
  //    konulamaz (SECURITY §8). Backend de doğruluyor ama istemci
  //    tarafında da kapı var — defense in depth.
  const custom = typeof data.mapUrl === 'string' ? data.mapUrl.trim() : ''
  if (custom && /^https?:\/\//i.test(custom)) return custom

  // 2. Adres + mekân adından otomatik arama.
  const parts = [data.venueName, data.venueAddress]
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim())

  // Yalnız adres varsa da yeterli; yalnız mekân adı varsa şehir belirsiz
  // olabilir ama yine de en iyi tahmindir.
  if (parts.length === 0) return null

  return MAPS_SEARCH + encodeURIComponent(parts.join(', '))
}
