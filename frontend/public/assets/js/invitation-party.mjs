/**
 * Davetiye — kişi sayısı alanının kararları.
 *
 * Ayrı modül çünkü `d/index.html` statik bir sayfa; bu kararlar birim
 * testiyle kilitlenmezse sessizce bozuluyor.
 *
 * İKİ BİLDİRİLEN HATA burada çözülüyor:
 *
 *  A) Alan yalnız "Geliyorum"a basıldıktan sonra görünüyordu. Oysa
 *     "kaç kişi geleceksiniz" sorusu seçimden ÖNCE de anlamlıdır —
 *     davetli sayıyı görüp ona göre karar verebilir.
 *
 *  B) `sendRsvp` tüm düğmeleri devre dışı bırakıp sonda açıyordu;
 *     art arda tıklamada yalnız ilki işliyordu. Artık sayaç yerel
 *     olarak ANINDA güncellenir, ağ isteği arka planda tekilleştirilir.
 */

/**
 * Kişi sayısı alanı görünsün mü?
 *
 * - Özellik kapalı → hiç görünmez (çift istemedi).
 * - "Gelemeyeceğim" seçili → görünmez (kaç kişi sorusu anlamsız).
 * - Aksi hâlde (seçim yok veya "Geliyorum") → görünür.
 */
export function shouldShowSizeBox({ partySizeEnabled, choice }) {
  if (partySizeEnabled === false) return false
  if (choice === 'DECLINED') return false
  return true
}

/**
 * Sayaç sonraki değeri — sınırlar içinde.
 *
 * @param {number} current mevcut değer
 * @param {number} max izin verilen üst sınır
 * @param {number} delta +1 veya -1
 */
export function nextPartySize(current, max, delta) {
  const upper = Math.max(1, Number(max) || 1)
  const base = Math.min(Math.max(1, Number(current) || 1), upper)
  const next = base + delta
  if (next < 1) return 1
  if (next > upper) return upper
  return next
}
