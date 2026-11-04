import { eq, and, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { refreshTokens } from '../db/schema.js'
import type { RefreshDeps } from './tokens.js'

/**
 * Refresh token deposunun Drizzle implementasyonu.
 *
 * `tokens.ts` içindeki saf mantık test edilebilir kalsın diye
 * bağımlılıklar enjekte edilir; bu dosya gerçek DB'ye bağlar.
 */
export function drizzleRefreshDeps(jwtSecret: string): RefreshDeps {
  const db = getDb()

  return {
    // Yenileme sonrası yeni access token imzalamak için.
    jwtSecret,
    async findByHash(hash) {
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hash))
        .limit(1)
      return rows[0] ?? null
    },

    async insertToken(row) {
      await db.insert(refreshTokens).values({
        userId: row.userId,
        tokenHash: row.tokenHash,
        deviceLabel: row.deviceLabel,
        expiresAt: row.expiresAt,
      })
    },

    async revokeToken(id) {
      const result = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id })
      return result.length > 0
    },

    async revokeAllForUser(userId) {
      const result = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
        )
        .returning({ id: refreshTokens.id })
      return result.length
    },
  }
}

/**
 * Süresi dolmuş token'ları temizler (cron için).
 *
 * Silinen düğün/kullanıcı CASCADE ile gider; bu fonksiyon sadece
 * süresi dolmuş ama revoke edilmemiş kayıtları temizler.
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const db = getDb()
  const result = await db
    .delete(refreshTokens)
    .where(sql`${refreshTokens.expiresAt} < now()`)
    .returning({ id: refreshTokens.id })
  return result.length
}
