import { eq, and, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { invites, weddingMembers } from '../db/schema.js'
import type { InviteDeps } from './invite.js'

/**
 * Davet kodu deposunun Drizzle implementasyonu.
 */
export function drizzleInviteDeps(): InviteDeps {
  const db = getDb()

  return {
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    async insertInvite(row) {
      const rows = await db
        .insert(invites)
        .values({
          weddingId: row.weddingId,
          code: row.code,
          role: row.role,
          displayName: row.displayName,
          expiresAt: row.expiresAt,
          createdBy: row.createdBy,
        })
        .returning({
          id: invites.id,
          code: invites.code,
          role: invites.role,
          expiresAt: invites.expiresAt,
        })
      const created = rows[0]
      if (!created || !created.expiresAt) throw new Error('Davet kodu oluşturulamadı')
      return {
        id: created.id,
        code: created.code,
        role: created.role,
        expiresAt: created.expiresAt,
      }
    },

    async findByCode(code) {
      const rows = await db
        .select({
          id: invites.id,
          weddingId: invites.weddingId,
          code: invites.code,
          role: invites.role,
          expiresAt: invites.expiresAt,
          usedAt: invites.usedAt,
        })
        .from(invites)
        .where(eq(invites.code, code))
        .limit(1)
      return rows[0] ?? null
    },

    /**
     * Koşullu tüketim — yarış koşulu koruması.
     *
     * `WHERE used_at IS NULL` sayesinde iki eşzamanlı istekten yalnızca
     * biri `true` alır.
     */
    async markInviteUsed(id) {
      const rows = await db
        .update(invites)
        .set({ usedAt: new Date() })
        .where(and(eq(invites.id, id), isNull(invites.usedAt)))
        .returning({ id: invites.id })
      return rows.length > 0
    },

    async insertMember(row) {
      await db.insert(weddingMembers).values(row)
    },
  }
}

/** Süresi dolmuş davet kodlarını temizler (cron). */
export async function cleanupExpiredInvites(): Promise<number> {
  const db = getDb()
  const rows = await db
    .delete(invites)
    .where(sql`${invites.expiresAt} < now() - interval '1 day'`)
    .returning({ id: invites.id })
  return rows.length
}
