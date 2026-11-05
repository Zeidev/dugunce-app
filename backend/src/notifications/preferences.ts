import { eq } from 'drizzle-orm'
import { users } from '../db/schema.js'

/**
 * Bildirim tercihleri.
 *
 * NEDEN AYRI DOSYA: tercihler `users` tablosunda yaşıyor ama token
 * deposundan farklı bir sorumluluk. Router iki ayrı arayüz tüketiyor;
 * birleştirmek `DeviceTokenDeps`'i şişirir ve testte gereksiz metot
 * sahtelemesi isterdi.
 */

export interface Preferences {
  enabled: boolean
  quietHoursOverride: boolean
}

export interface PreferencesDeps {
  get(userId: string): Promise<Preferences>
  /** Yalnız `patch`'te TANIMLI alanlar yazılır. */
  set(userId: string, patch: Partial<Preferences>): Promise<void>
}

type DrizzleClient = ReturnType<typeof import('../db/client.js').getDb>

export function drizzlePreferencesDeps(db: DrizzleClient): PreferencesDeps {
  return {
    async get(userId) {
      const rows = await db
        .select({
          enabled: users.notificationsEnabled,
          quietHoursOverride: users.quietHoursOverride,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      /*
        Kullanıcı yoksa GÜVENLİ varsayılan: bildirim kapalı.
        `requireAuth` zaten kullanıcıyı doğruluyor; bu savunma hattı
        (kullanıcı arada silinmiş olabilir). `enabled: true` dönmek,
        var olmayan bir kullanıcıya gönderim denemesi demekti.
      */
      return rows[0] ?? { enabled: false, quietHoursOverride: false }
    },

    async set(userId, patch) {
      const values: { notificationsEnabled?: boolean; quietHoursOverride?: boolean } = {}
      if (patch.enabled !== undefined) values.notificationsEnabled = patch.enabled
      if (patch.quietHoursOverride !== undefined) {
        values.quietHoursOverride = patch.quietHoursOverride
      }
      // Boş patch'te UPDATE ÇAĞIRMA: gereksiz yazma ve `updated_at`
      // tazelemesi olurdu.
      if (Object.keys(values).length === 0) return
      await db.update(users).set(values).where(eq(users.id, userId))
    },
  }
}
