import { and, eq, lt, gt, isNull } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { helperSessions, helpers, weddings } from '../db/schema.js'
import type { SessionContext, SessionDeps, SessionRecord } from './session.js'

/**
 * Yardımcı oturumu deposu — Drizzle.
 *
 * `findByHash` tek sorguda yardımcı + düğün durumunu da getirir; böylece
 * revoke edilmiş yardımcı veya silinmiş düğün oturumu ANINDA ölür
 * (SECURITY §1.2 #6).
 */

type Db = ReturnType<typeof getDb>

function sessionColumns() {
  return {
    id: helperSessions.id,
    helperId: helperSessions.helperId,
    weddingId: helperSessions.weddingId,
    sessionHash: helperSessions.sessionHash,
    csrfHash: helperSessions.csrfHash,
    createdAt: helperSessions.createdAt,
    lastUsedAt: helperSessions.lastUsedAt,
    expiresAt: helperSessions.expiresAt,
  }
}

export function drizzleSessionDeps(dbOverride?: Db): SessionDeps {
  const db = dbOverride ?? getDb()

  return {
    async insertSession(values) {
      const rows = await db
        .insert(helperSessions)
        .values(values as typeof helperSessions.$inferInsert)
        .returning(sessionColumns())
      const row = rows[0]
      if (!row) throw new Error('Oturum oluşturulamadı')
      return row as SessionRecord
    },

    async findByHash(hash): Promise<SessionContext | null> {
      const rows = await db
        .select({
          sessionId: helperSessions.id,
          helperId: helperSessions.helperId,
          weddingId: helperSessions.weddingId,
          displayName: helpers.displayName,
          coupleNames: weddings.coupleNames,
          csrfHash: helperSessions.csrfHash,
          createdAt: helperSessions.createdAt,
          expiresAt: helperSessions.expiresAt,
        })
        .from(helperSessions)
        .innerJoin(helpers, eq(helpers.id, helperSessions.helperId))
        .innerJoin(weddings, eq(weddings.id, helperSessions.weddingId))
        .where(
          and(
            eq(helperSessions.sessionHash, hash),
            // Süresi geçmiş oturum SQL'de elenir
            gt(helperSessions.expiresAt, new Date()),
            // Revoke edilmiş veya süresi dolmuş davet linki olan yardımcı
            isNull(helpers.tokenRevokedAt),
            gt(helpers.expiresAt, new Date()),
            // Silinmiş/arşivlenmiş düğün
            eq(weddings.status, 'ACTIVE'),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },

    async touch(sessionId, expiresAt, lastUsedAt) {
      await db
        .update(helperSessions)
        .set({ expiresAt, lastUsedAt })
        .where(eq(helperSessions.id, sessionId))
    },

    async deleteByHash(hash) {
      const rows = await db
        .delete(helperSessions)
        .where(eq(helperSessions.sessionHash, hash))
        .returning({ id: helperSessions.id })
      return rows.length > 0
    },

    async deleteExpiredBefore(now) {
      const rows = await db
        .delete(helperSessions)
        .where(lt(helperSessions.expiresAt, now))
        .returning({ id: helperSessions.id })
      return rows.length
    },
  }
}
