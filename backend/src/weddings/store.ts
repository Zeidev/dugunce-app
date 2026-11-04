import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { weddings, weddingMembers } from '../db/schema.js'
import type { WeddingDeps, WeddingRecord } from './service.js'

/** Testlerin PGlite bağlantısı enjekte edebilmesi için. */
type Db = ReturnType<typeof getDb>

/**
 * Düğün deposunun Drizzle implementasyonu.
 *
 * KRİTİK: `findById` her zaman `userId` ile birlikte filtreler —
 * başka kullanıcının düğünü asla dönmez (SECURITY §1.1).
 *
 * `dbOverride` diğer depolar (`drizzleGuestDeps`, `drizzleTaskDeps`) ile
 * aynı desen: testler PGlite bağlantısı enjekte edebilsin diye.
 */
export function drizzleWeddingDeps(dbOverride?: Db): WeddingDeps {
  const db = dbOverride ?? getDb()

  return {
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    async insertWedding(values) {
      const rows = await db
        .insert(weddings)
        .values(values as typeof weddings.$inferInsert)
        .returning()
      const row = rows[0]
      if (!row) throw new Error('Düğün oluşturulamadı')
      return row as unknown as WeddingRecord
    },

    async insertMember(values) {
      await db.insert(weddingMembers).values(values)
    },

    async listByUser(userId) {
      const rows = await db
        .select({
          id: weddings.id,
          coupleNames: weddings.coupleNames,
          weddingDate: weddings.weddingDate,
          timezone: weddings.timezone,
          venueName: weddings.venueName,
          venueAddress: weddings.venueAddress,
          mapUrl: weddings.mapUrl,
          giftNote: weddings.giftNote,
          rsvpDeadline: weddings.rsvpDeadline,
          program: weddings.program,
          plan: weddings.plan,
          status: weddings.status,
          template: weddings.template,
          fontKey: weddings.fontKey,
          createdAt: weddings.createdAt,
          role: weddingMembers.role,
        })
        .from(weddingMembers)
        .innerJoin(weddings, eq(weddings.id, weddingMembers.weddingId))
        .where(
          and(
            eq(weddingMembers.userId, userId),
            eq(weddings.status, 'ACTIVE'),
          ),
        )
        .orderBy(desc(weddings.createdAt))
      return rows as unknown as WeddingRecord[]
    },

    async findById(weddingId, userId) {
      const rows = await db
        .select({
          id: weddings.id,
          coupleNames: weddings.coupleNames,
          weddingDate: weddings.weddingDate,
          timezone: weddings.timezone,
          venueName: weddings.venueName,
          venueAddress: weddings.venueAddress,
          venueLat: weddings.venueLat,
          venueLng: weddings.venueLng,
          mapUrl: weddings.mapUrl,
          giftNote: weddings.giftNote,
          rsvpDeadline: weddings.rsvpDeadline,
          program: weddings.program,
          plan: weddings.plan,
          status: weddings.status,
          template: weddings.template,
          fontKey: weddings.fontKey,
          createdAt: weddings.createdAt,
          updatedAt: weddings.updatedAt,
          role: weddingMembers.role,
        })
        .from(weddings)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, weddings.id),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(eq(weddings.id, weddingId))
        .limit(1)

      return (rows[0] as unknown as WeddingRecord) ?? null
    },

    async updateWedding(weddingId, patch) {
      const rows = await db
        .update(weddings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(weddings.id, weddingId))
        .returning()
      return (rows[0] as unknown as WeddingRecord) ?? null
    },
  }
}
