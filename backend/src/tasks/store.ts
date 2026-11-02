import { eq, and, isNull, sql, desc } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { tasks, helpers, weddings, weddingMembers } from '../db/schema.js'
import type { TaskDeps, TaskRecord, HelperSummary } from './service.js'

/**
 * Görev deposu — Drizzle.
 *
 * Her çift tarafı sorgu `wedding_members` join'i taşır (SECURITY §1.1).
 * `tx` alan her metot onu kullanır (Aşama 4 dersi).
 */

type Db = ReturnType<typeof getDb>

function memberJoin(weddingId: string, userId: string) {
  return and(
    eq(weddingMembers.weddingId, weddingId),
    eq(weddingMembers.userId, userId),
  )
}

function taskColumns() {
  return {
    id: tasks.id,
    weddingId: tasks.weddingId,
    title: tasks.title,
    description: tasks.description,
    assigneeHelperId: tasks.assigneeHelperId,
    status: tasks.status,
    priority: tasks.priority,
    dueDate: tasks.dueDate,
    assignedAt: tasks.assignedAt,
    deletedAt: tasks.deletedAt,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
  }
}

export function drizzleTaskDeps(dbOverride?: Db): TaskDeps {
  const db = dbOverride ?? getDb()

  return {
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    async insertTask(values, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .insert(tasks)
        .values(values as typeof tasks.$inferInsert)
        .returning(taskColumns())
      const row = rows[0]
      if (!row) throw new Error('Görev oluşturulamadı')
      return row as TaskRecord
    },

    async listByWedding(weddingId, userId, opts) {
      const conditions = [eq(tasks.weddingId, weddingId)]
      if (!opts.includeDeleted) conditions.push(isNull(tasks.deletedAt))
      if (opts.status) conditions.push(eq(tasks.status, opts.status))
      if (opts.assigneeHelperId) {
        conditions.push(eq(tasks.assigneeHelperId, opts.assigneeHelperId))
      }

      const rows = await db
        .select(taskColumns())
        .from(tasks)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
      return rows as TaskRecord[]
    },

    async findById(taskId, weddingId, userId) {
      const rows = await db
        .select(taskColumns())
        .from(tasks)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.weddingId, weddingId),
            isNull(tasks.deletedAt),
          ),
        )
        .limit(1)
      return (rows[0] as TaskRecord | undefined) ?? null
    },

    async updateTask(taskId, values, weddingId, userId, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .update(tasks)
        .set(values as Partial<typeof tasks.$inferInsert>)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.weddingId, weddingId),
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${tasks.weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning(taskColumns())
      const row = rows[0]
      if (!row) throw new Error('Görev güncellenemedi')
      return row as TaskRecord
    },

    async softDelete(taskId) {
      const rows = await db
        .update(tasks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
        .returning({ id: tasks.id })
      return rows.length > 0
    },

    async countTasks(tx, weddingId, userId) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .select({ count: sql<string>`COUNT(*)` })
        .from(tasks)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(and(eq(tasks.weddingId, weddingId), isNull(tasks.deletedAt)))
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
      const client = (tx as Db | undefined) ?? db
      await client.execute(
        sql`SELECT id FROM ${weddings} WHERE ${weddings.id} = ${weddingId} FOR UPDATE`,
      )
    },

    /**
     * Yardımcının görevlerini listeler.
     *
     * Ayrı metot: `listByWedding` ÜYELİK join'i yapar (çift tarafı).
     * Yardımcının `userId`'si olmadığı için o sorgu boş döner.
     * Burada kapsam `assignee_helper_id` ile sağlanır.
     */
    async listForHelper(weddingId, helperId) {
      const rows = await db
        .select(taskColumns())
        .from(tasks)
        .where(
          and(
            eq(tasks.weddingId, weddingId),
            eq(tasks.assigneeHelperId, helperId),   // ← ZORUNLU
            isNull(tasks.deletedAt),
          ),
        )
        .orderBy(desc(tasks.createdAt))
      return rows as TaskRecord[]
    },

    /**
     * Yardımcının KENDİ görevinin durumunu günceller.
     *
     * Ayrı metot çünkü `updateTask` üyelik kontrolü yapar (çift tarafı).
     * Burada kontrol `assignee_helper_id` üzerinden: yalnızca atanmış
     * yardımcı güncelleyebilir (SECURITY §10.3, Review Focus #2).
     *
     * Yalnızca `status` yazılabilir — başlık/açıklama çift kararı.
     */
    async updateTaskStatusAsHelper(taskId, status, helperId, weddingId) {
      const rows = await db
        .update(tasks)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.weddingId, weddingId),
            eq(tasks.assigneeHelperId, helperId),   // ← ZORUNLU
            isNull(tasks.deletedAt),
          ),
        )
        .returning(taskColumns())
      const row = rows[0]
      // null → görev yok VEYA bu yardımcıya atanmamış (404)
      return (row as TaskRecord | undefined) ?? null
    },

    async findHelper(helperId, weddingId): Promise<HelperSummary | null> {
      const rows = await db
        .select({ id: helpers.id, tokenRevokedAt: helpers.tokenRevokedAt })
        .from(helpers)
        .where(and(eq(helpers.id, helperId), eq(helpers.weddingId, weddingId)))
        .limit(1)
      return rows[0] ?? null
    },
  }
}
