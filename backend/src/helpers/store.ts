import { eq, and, isNull, sql, desc } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { helpers, tasks, weddings, weddingMembers } from '../db/schema.js'
import type { HelperDeps, HelperRecord } from './service.js'
import type { HelperTokenDeps, HelperTokenRow } from './token.js'

/**
 * Yardımcı deposu — Drizzle.
 *
 * KRİTİK: Çift tarafı tüm sorgular `wedding_members` join'i ile kapsamlı
 * (SECURITY §1.1). Yardımcı tarafı (token) tek yetki kaynağıdır.
 *
 * NOT (Aşama 4 dersi): `tx` parametresi alan her metot onu KULLANMALI.
 * Dış `db` kullanılırsa PGlite tek bağlantıda kilitlenir, gerçek
 * PostgreSQL'de ise sessizce transaction dışına çıkar.
 */

type Db = ReturnType<typeof getDb>

function memberJoin(weddingId: string, userId: string) {
  return and(
    eq(weddingMembers.weddingId, weddingId),
    eq(weddingMembers.userId, userId),
  )
}

function helperColumns() {
  return {
    id: helpers.id,
    weddingId: helpers.weddingId,
    displayName: helpers.displayName,
    tokenRevokedAt: helpers.tokenRevokedAt,
    lastSeenAt: helpers.lastSeenAt,
    createdAt: helpers.createdAt,
  }
}

export function drizzleHelperDeps(
  dbOverride?: Db,
): HelperDeps & HelperTokenDeps {
  const db = dbOverride ?? getDb()

  return {
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    async insertHelper(values, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .insert(helpers)
        .values(values as typeof helpers.$inferInsert)
        .returning(helperColumns())
      const row = rows[0]
      if (!row) throw new Error('Yardımcı oluşturulamadı')
      return row as HelperRecord
    },

    async listByWedding(weddingId, userId) {
      const rows = await db
        .select(helperColumns())
        .from(helpers)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(eq(helpers.weddingId, weddingId))
        .orderBy(desc(helpers.createdAt))
      return rows as HelperRecord[]
    },

    async findById(helperId, weddingId, userId) {
      const rows = await db
        .select(helperColumns())
        .from(helpers)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(and(eq(helpers.id, helperId), eq(helpers.weddingId, weddingId)))
        .limit(1)
      return (rows[0] as HelperRecord | undefined) ?? null
    },

    async updateHelper(helperId, values, weddingId, userId, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .update(helpers)
        .set(values as Partial<typeof helpers.$inferInsert>)
        .where(
          and(
            eq(helpers.id, helperId),
            eq(helpers.weddingId, weddingId),
            // defense in depth: UPDATE de üyelik kontrolü taşır
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${helpers.weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning(helperColumns())
      const row = rows[0]
      if (!row) throw new Error('Yardımcı güncellenemedi')
      return row as HelperRecord
    },

    async revokeToken(helperId, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .update(helpers)
        .set({ tokenRevokedAt: new Date() })
        .where(and(eq(helpers.id, helperId), isNull(helpers.tokenRevokedAt)))
        .returning({ id: helpers.id })
      return rows.length > 0
    },

    async deleteHelper(helperId, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .delete(helpers)
        .where(eq(helpers.id, helperId))
        .returning({ id: helpers.id })
      return rows.length > 0
    },

    async countHelpers(tx, weddingId, userId) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .select({ count: sql<string>`COUNT(*)` })
        .from(helpers)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(eq(helpers.weddingId, weddingId))
      return Number(rows[0]?.count ?? 0)
    },

    async getPlan(tx, weddingId, userId) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .select({ plan: weddings.plan })
        .from(weddings)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(eq(weddings.id, weddingId))
        .limit(1)
      return rows[0]?.plan === 'PREMIUM' ? 'PREMIUM' : 'FREE'
    },

    async assertMember(tx, weddingId, userId) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .select({ id: weddingMembers.id })
        .from(weddingMembers)
        .where(memberJoin(weddingId, userId))
        .limit(1)
      return rows.length > 0
    },

    async lockWeddingForUpdate(tx, weddingId) {
      // COUNT(*) FOR UPDATE yasak olduğu için düğün satırı kilitlenir.
      const client = (tx as Db | undefined) ?? db
      await client.execute(
        sql`SELECT id FROM ${weddings} WHERE ${weddings.id} = ${weddingId} FOR UPDATE`,
      )
    },

    async clearTaskAssignments(helperId, tx) {
      // Composite FK ON DELETE SET NULL olamaz (wedding_id NOT NULL).
      // Bu yüzden silmeden ÖNCE atamalar boşaltılır.
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .update(tasks)
        .set({ assigneeHelperId: null, assignedAt: null, updatedAt: new Date() })
        .where(eq(tasks.assigneeHelperId, helperId))
        .returning({ id: tasks.id })
      return rows.length
    },

    // --- Yardımcı tarafı (token yetkisi) ---

    async findByTokenHash(tokenHash) {
      const rows = await db
        .select({
          id: helpers.id,
          weddingId: helpers.weddingId,
          displayName: helpers.displayName,
          tokenRevokedAt: helpers.tokenRevokedAt,
          lastSeenAt: helpers.lastSeenAt,
          wedding: {
            id: weddings.id,
            coupleNames: weddings.coupleNames,
            status: weddings.status,
          },
        })
        .from(helpers)
        .innerJoin(weddings, eq(weddings.id, helpers.weddingId))
        .where(eq(helpers.accessTokenHash, tokenHash))
        .limit(1)
      return (rows[0] as HelperTokenRow | undefined) ?? null
    },

    async touchLastSeen(helperId) {
      await db
        .update(helpers)
        .set({ lastSeenAt: new Date() })
        .where(eq(helpers.id, helperId))
    },
  }
}
