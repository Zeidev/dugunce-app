import { and, eq, ne } from 'drizzle-orm'
import { deviceTokens, weddingMembers } from '../db/schema.js'

/**
 * Cihaz token deposu.
 *
 * NEDEN DAR ARAYÜZ: bildirim servisi yalnız bu beş işlemi yapıyor.
 * Drizzle'ın tam yüzeyini geçirmek servis testlerini gerçek DB'ye
 * bağlardı; oysa servis mantığı (sessiz saat, sıralı gönderim, ölü
 * token) DB'den bağımsız sınanabilmeli.
 */

export interface DeviceTokenRow {
  id: string
  userId: string
  token: string
  platform: string
}

export interface UpsertDeviceTokenInput {
  userId: string
  token: string
  platform: string
}

export interface DeviceTokenDeps {
  upsertDeviceToken(input: UpsertDeviceTokenInput): Promise<void>
  /**
   * Token'ı YALNIZ sahibi silerse siler.
   *
   * @returns `true` = silindi, `false` = token yok VEYA başka kullanıcının
   *
   * NEDEN `userId` ZORUNLU: token gövdeyle geliyor. Sahiplik kontrolü
   * olmadan bir kullanıcı başkasının token'ını bilirse onun
   * bildirimlerini kesebilirdi (yetkisiz müdahale).
   */
  deleteDeviceToken(token: string, userId: string): Promise<boolean>
  /**
   * Sahiplik kontrolü YAPMADAN siler — yalnız `/auth/logout` için.
   *
   * NEDEN AYRI METOT: çıkış ucu kimlik doğrulaması istemiyor (yalnız
   * refresh token iptali), dolayısıyla `userId` bilinmiyor. Sahiplik
   * kontrolü yapılamaz; bu yüzden niyeti ADIYLA belli olan ayrı bir
   * metot kullanılıyor — normal silme yolunda yanlışlıkla
   * kullanılmasın.
   */
  deleteDeviceTokenAnyOwner(token: string): Promise<void>
  deleteAllForUser(userId: string): Promise<void>
  listTokensForUser(userId: string): Promise<DeviceTokenRow[]>
  /**
   * Düğünün tüm üyelerinin token'ları.
   *
   * `excludeUserId` = bildirimi TETİKLEYEN kullanıcı; kendine bildirim
   * gitmez (kendi yazdığı mesajın bildirimi anlamsız).
   */
  listTokensForWeddingMembers(
    weddingId: string,
    excludeUserId: string | null,
  ): Promise<DeviceTokenRow[]>
}

/**
 * Depo bağımlılıkları — Drizzle uyumlu her istemciyle çalışır.
 *
 * TİP: `getDb()` dönüş tipi kullanılıyor (node-postgres). Testlerde
 * PGlite sürücüsü veriliyor; ikisinin Drizzle yüzeyi aynı, tip
 * parametreleri farklı. Mevcut `panel-store.ts` deseni de böyle
 * yapıyor (`db as Parameters<...>`). `any` kullanılmıyor.
 */
type DrizzleClient = ReturnType<typeof import('../db/client.js').getDb>

export function drizzleDeviceTokenDeps(db: DrizzleClient): DeviceTokenDeps {
  return {
    async upsertDeviceToken(input) {
      await db
        .insert(deviceTokens)
        .values({
          userId: input.userId,
          token: input.token,
          platform: input.platform,
        })
        .onConflictDoUpdate({
          target: deviceTokens.token,
          // Sahip değişebilir: aynı fiziksel cihazda başka kullanıcı
          // giriş yaparsa eski kullanıcıya bildirim gitmemeli.
          set: { userId: input.userId, lastSeenAt: new Date() },
        })
    },

    async deleteDeviceToken(token, userId) {
      /*
        `and` ile İKİ koşul: token eşleşmeli VE sahibi bu kullanıcı
        olmalı. Yalnız token ile silmek yetkilendirme açığıydı.
      */
      const deleted = await db
        .delete(deviceTokens)
        .where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId)))
        .returning({ id: deviceTokens.id })
      return deleted.length > 0
    },

    async deleteDeviceTokenAnyOwner(token) {
      await db.delete(deviceTokens).where(eq(deviceTokens.token, token))
    },

    async deleteAllForUser(userId) {
      await db.delete(deviceTokens).where(eq(deviceTokens.userId, userId))
    },

    async listTokensForUser(userId) {
      const rows = await db
        .select({
          id: deviceTokens.id,
          userId: deviceTokens.userId,
          token: deviceTokens.token,
          platform: deviceTokens.platform,
        })
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, userId))
      return rows
    },

    async listTokensForWeddingMembers(weddingId, excludeUserId) {
      const condition =
        excludeUserId === null
          ? eq(weddingMembers.weddingId, weddingId)
          : and(eq(weddingMembers.weddingId, weddingId), ne(weddingMembers.userId, excludeUserId))

      // TEK SORGU: kullanıcı başına ayrı token sorgusu N+1 üretirdi.
      return db
        .select({
          id: deviceTokens.id,
          userId: deviceTokens.userId,
          token: deviceTokens.token,
          platform: deviceTokens.platform,
        })
        .from(weddingMembers)
        .innerJoin(deviceTokens, eq(deviceTokens.userId, weddingMembers.userId))
        .where(condition)
    },
  }
}
