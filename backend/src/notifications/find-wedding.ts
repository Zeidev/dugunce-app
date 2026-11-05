import { eq } from 'drizzle-orm'
import { weddings } from '../db/schema.js'
import { getDb } from '../db/client.js'

/**
 * Bildirim için düğünün tarihini getirir.
 *
 * NEDEN AYRI DOSYA: `NotifyDeps.findWedding` yalnız `weddingDate`e
 * ihtiyaç duyuyor (sessiz saat hesabı ve düğün öncesi hafta istisnası).
 * Tüm `WeddingRecord`'u döndürmek gereksiz alan taşır ve testte
 * doldurulması gereken bir sürü alan demek olurdu.
 *
 * `null` döner: düğün silinmişse bildirim gönderilmez (çağıran
 * `notifyWeddingMembers` bunu erken çıkış olarak kullanıyor).
 */
export async function findWeddingForNotify(
  weddingId: string,
): Promise<{ weddingDate: Date | null } | null> {
  // UUID biçimi bozuksa DB hatası yerine `null` — çağıran zaten
  // "düğün yok" durumunu ele alıyor.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(weddingId)) {
    return null
  }

  const rows = await getDb()
    .select({ weddingDate: weddings.weddingDate })
    .from(weddings)
    .where(eq(weddings.id, weddingId))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return { weddingDate: row.weddingDate ?? null }
}
