import { eq, and } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { users, weddingMembers } from '../db/schema.js'
import type { RequireAuthDeps } from '../middleware/require-auth.js'
import type { MembershipLookup } from '../middleware/require-member.js'

/** Testlerin PGlite bağlantısı enjekte edebilmesi için. */
type Db = ReturnType<typeof getDb>

/**
 * Auth middleware'lerinin Drizzle implementasyonu.
 *
 * Middleware'ler saf mantık olarak yazıldı (test edilebilirlik); bu dosya
 * onları gerçek DB'ye bağlar.
 */

export function drizzleAuthDeps(secret: string, dbOverride?: Db): RequireAuthDeps {
  const db = dbOverride ?? getDb()

  return {
    secret,
    async findUserById(id: string) {
      const rows = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)
      return rows[0] ?? null
    },
  }
}

export function drizzleMembershipDeps(dbOverride?: Db): MembershipLookup {
  const db = dbOverride ?? getDb()

  return {
    async findMembership(weddingId: string, userId: string) {
      const rows = await db
        .select({
          weddingId: weddingMembers.weddingId,
          userId: weddingMembers.userId,
          role: weddingMembers.role,
        })
        .from(weddingMembers)
        .where(
          and(
            eq(weddingMembers.weddingId, weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
  }
}
