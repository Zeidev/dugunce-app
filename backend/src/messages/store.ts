import { eq, and, isNull, sql, desc, lt, gt } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { messages, tasks } from '../db/schema.js'
import type { MessageDeps, MessageRecord, TaskForMessages } from './service.js'

/**
 * Mesaj deposu — Drizzle.
 *
 * KRİTİK: `since` filtresi (yardımcının `assigned_at` sınırı) SQL'de
 * uygulanır, bellekte değil. Bellekte filtrelemek, sınırı olmayan
 * satırların DB'den çekilmesi demek — hem yavaş hem gereksiz veri
 * transferi.
 */

type Db = ReturnType<typeof getDb>

function messageColumns() {
  return {
    id: messages.id,
    weddingId: messages.weddingId,
    taskId: messages.taskId,
    senderKind: messages.senderKind,
    senderUserId: messages.senderUserId,
    senderHelperId: messages.senderHelperId,
    body: messages.body,
    createdAt: messages.createdAt,
  }
}

export function drizzleMessageDeps(dbOverride?: Db): MessageDeps {
  const db = dbOverride ?? getDb()

  return {
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    async insertMessage(values, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .insert(messages)
        .values(values as typeof messages.$inferInsert)
        .returning(messageColumns())
      const row = rows[0]
      if (!row) throw new Error('Mesaj oluşturulamadı')
      return row as MessageRecord
    },

    async findByIdempotencyKey(taskId, key) {
      const rows = await db
        .select(messageColumns())
        .from(messages)
        .where(
          and(
            eq(messages.taskId, taskId),
            eq(messages.idempotencyKey, key),
          ),
        )
        .limit(1)
      return (rows[0] as MessageRecord | undefined) ?? null
    },

    async listByTask(weddingId, taskId, opts) {
      const conditions = [
        eq(messages.weddingId, weddingId),
        eq(messages.taskId, taskId),
      ]

      // YENİDEN ATAMA SINIRI (SECURITY §10.3 #4b):
      // Yardımcı yalnızca assigned_at sonrasını görür.
      if (opts.since) {
        conditions.push(gt(messages.createdAt, opts.since))
      }

      // Sayfalama: `before` id'sinden ÖNCEKİLER (yeniden eskiye)
      if (opts.before) {
        const anchor = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(and(eq(messages.id, opts.before), eq(messages.taskId, taskId)))
          .limit(1)
        const anchorTime = anchor[0]?.createdAt
        if (anchorTime) {
          conditions.push(lt(messages.createdAt, anchorTime))
        }
      }

      const rows = await db
        .select(messageColumns())
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(opts.limit)

      return rows as MessageRecord[]
    },

    async findTask(taskId, weddingId): Promise<TaskForMessages | null> {
      const rows = await db
        .select({
          id: tasks.id,
          weddingId: tasks.weddingId,
          assigneeHelperId: tasks.assigneeHelperId,
          assignedAt: tasks.assignedAt,
          deletedAt: tasks.deletedAt,
        })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.weddingId, weddingId)))
        .limit(1)
      return rows[0] ?? null
    },
  }
}

/** Kullanılmayan import uyarısını önle. */
void isNull
void sql
