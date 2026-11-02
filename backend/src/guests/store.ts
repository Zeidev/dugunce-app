import { eq, and, isNull, sql, desc, inArray } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { guests, guestInvitations, weddings, weddingMembers } from '../db/schema.js'
import type {
  GuestDeps,
  GuestRecord,
  ListGuestsOptions,
} from './service.js'
import type { InvitationDeps, InvitationRow } from './invitation.js'
import type { RsvpDeps } from './rsvp.js'

/**
 * Davetli deposunun Drizzle implementasyonu.
 *
 * KRİTİK: Çift tarafı tüm sorgular `wedding_id` + üyelik join'i ile
 * kapsamlı (SECURITY §1.1). Davetli tarafı (token) tek yetki kaynağıdır
 * ve orada üyelik yoktur — token'ın kendisi yetkidir.
 */

/** Üyelik kontrolü — her çift tarafı sorguya eklenir. */
function memberJoin(weddingId: string, userId: string) {
  return and(
    eq(weddingMembers.weddingId, weddingId),
    eq(weddingMembers.userId, userId),
  )
}

type Db = ReturnType<typeof getDb>

function guestColumns() {
  return {
    id: guests.id,
    weddingId: guests.weddingId,
    name: guests.name,
    phone: guests.phone,
    side: guests.side,
    inviteStatus: guests.inviteStatus,
    rsvp: guests.rsvp,
    note: guests.note,
    deletedAt: guests.deletedAt,
  }
}

/**
 * @param dbOverride — test için enjekte edilebilir Drizzle örneği (PGlite).
 */
export function drizzleGuestDeps(
  dbOverride?: Db,
): GuestDeps & InvitationDeps & RsvpDeps {
  const db = dbOverride ?? getDb()

  return {
    // --- Transaction ---
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    // --- Yazma ---
    async insertGuest(values, tx) {
      // KRİTİK: transaction içinde dış `db` kullanılırsa PGlite (tek
      // bağlantı) yeni bir transaction açmaya çalışır ve kendi kendini
      // kilitler. Bu yüzden tx zorunlu olarak kullanılır.
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .insert(guests)
        .values(values as typeof guests.$inferInsert)
        .returning(guestColumns())
      const row = rows[0]
      if (!row) throw new Error('Davetli oluşturulamadı')
      return row as GuestRecord
    },

    async insertGuests(rows, tx) {
      if (rows.length === 0) return []
      const client = (tx as Db | undefined) ?? db
      const inserted = await client
        .insert(guests)
        .values(rows as (typeof guests.$inferInsert)[])
        .returning(guestColumns())
      return inserted as GuestRecord[]
    },

    /**
     * NOT: `values` yalnızca DEĞİŞECEK kolonları taşır; hangi satırın
     * güncelleneceği `weddingId` + üyelik kontrolü ile belirlenir. Çağıran
     * servis `findById` ile satırın varlığını zaten doğruladı, ama UPDATE
     * de kendi WHERE'ini taşır (defense in depth) — servis bir gün
     * değişirse yabancı yazma yine engellenir.
     *
     * `guestId` bu yüzden ayrı parametre: `values` içinde olsaydı
     * `.set()`'e de giderdi.
     */
    async updateGuest(guestId, values, weddingId, userId) {
      const rows = await db
        .update(guests)
        .set({ ...values, updatedAt: new Date() } as Partial<typeof guests.$inferInsert>)
        .where(
          and(
            eq(guests.weddingId, weddingId),
            eq(guests.id, guestId),
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${guests.weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning(guestColumns())
      const row = rows[0]
      if (!row) throw new Error('Davetli güncellenemedi')
      return row as GuestRecord
    },

    async softDelete(guestId, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .update(guests)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(guests.id, guestId), isNull(guests.deletedAt)))
        .returning({ id: guests.id })
      return rows.length > 0
    },

    async revokeInvitations(guestId, tx) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .update(guestInvitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(guestInvitations.guestId, guestId),
            isNull(guestInvitations.revokedAt),
          ),
        )
        .returning({ id: guestInvitations.id })
      return rows.length
    },

    // --- Okuma ---
    async listByWedding(weddingId, userId, opts: ListGuestsOptions) {
      const conditions = [eq(guests.weddingId, weddingId)]
      if (!opts.includeDeleted) conditions.push(isNull(guests.deletedAt))
      if (opts.side) conditions.push(eq(guests.side, opts.side))
      if (opts.rsvp) conditions.push(eq(guests.rsvp, opts.rsvp))

      const rows = await db
        .select(guestColumns())
        .from(guests)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(and(...conditions))
        .orderBy(desc(guests.createdAt))

      return rows as GuestRecord[]
    },

    async findById(guestId, weddingId, userId) {
      const rows = await db
        .select(guestColumns())
        .from(guests)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(
          and(
            eq(guests.id, guestId),
            eq(guests.weddingId, weddingId),
            isNull(guests.deletedAt),
          ),
        )
        .limit(1)
      return (rows[0] as GuestRecord | undefined) ?? null
    },

    // --- Limit ---
    async lockWeddingForUpdate(tx, weddingId) {
      // COUNT(*) FOR UPDATE PostgreSQL'de YASAK olduğu için düğün satırı
      // kilitlenir. Aynı düğüne eşzamanlı davetli yazmalarını serileştirir.
      //
      // KRİTİK: transaction client'ı kullanılmalı. Dış `db` kullanılırsa
      // PGlite (tek bağlantı) kendi kilidini bekler ve sonsuza asılır.
      const client = (tx as Db | undefined) ?? db
      await client.execute(
        sql`SELECT id FROM ${weddings} WHERE ${weddings.id} = ${weddingId} FOR UPDATE`,
      )
    },

    async countActiveGuests(tx, weddingId, userId) {
      const client = (tx as Db | undefined) ?? db
      const rows = await client
        .select({ count: sql<string>`COUNT(*)` })
        .from(guests)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(and(eq(guests.weddingId, weddingId), isNull(guests.deletedAt)))
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
      const plan = rows[0]?.plan
      return plan === 'PREMIUM' ? 'PREMIUM' : 'FREE'
    },

    // --- Davetiye (çift tarafı) ---
    async findGuestForInvitation(guestId, weddingId, userId) {
      const rows = await db
        .select({
          id: guests.id,
          weddingId: guests.weddingId,
          name: guests.name,
          deletedAt: guests.deletedAt,
        })
        .from(guests)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(and(eq(guests.id, guestId), eq(guests.weddingId, weddingId)))
        .limit(1)
      return rows[0] ?? null
    },

    async insertInvitation(values) {
      const rows = await db
        .insert(guestInvitations)
        .values(values as typeof guestInvitations.$inferInsert)
        .returning({ id: guestInvitations.id })
      const row = rows[0]
      if (!row) throw new Error('Davetiye oluşturulamadı')
      return row
    },

    // --- Davetli tarafı (token yetkisi) ---
    async findByTokenHash(tokenHash) {
      const rows = await db
        .select({
          id: guestInvitations.id,
          weddingId: guestInvitations.weddingId,
          guestId: guestInvitations.guestId,
          tokenHash: guestInvitations.tokenHash,
          allowedPartySize: guestInvitations.allowedPartySize,
          confirmedPartySize: guestInvitations.confirmedPartySize,
          rsvpSource: guestInvitations.rsvpSource,
          rsvpAt: guestInvitations.rsvpAt,
          expiresAt: guestInvitations.expiresAt,
          revokedAt: guestInvitations.revokedAt,
          guest: {
            id: guests.id,
            name: guests.name,
            deletedAt: guests.deletedAt,
            rsvp: guests.rsvp,
          },
          wedding: {
            id: weddings.id,
            coupleNames: weddings.coupleNames,
            weddingDate: weddings.weddingDate,
            timezone: weddings.timezone,
            venueName: weddings.venueName,
            venueAddress: weddings.venueAddress,
            mapUrl: weddings.mapUrl,
            program: weddings.program,
            giftNote: weddings.giftNote,
            rsvpDeadline: weddings.rsvpDeadline,
          },
        })
        .from(guestInvitations)
        .innerJoin(guests, eq(guests.id, guestInvitations.guestId))
        .innerJoin(weddings, eq(weddings.id, guestInvitations.weddingId))
        .where(eq(guestInvitations.tokenHash, tokenHash))
        .limit(1)

      return (rows[0] as InvitationRow | undefined) ?? null
    },

    async revokeByGuestId(guestId) {
      const rows = await db
        .update(guestInvitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(guestInvitations.guestId, guestId),
            isNull(guestInvitations.revokedAt),
          ),
        )
        .returning({ id: guestInvitations.id })
      return rows.length
    },

    // --- RSVP ---
    async updateRsvp(values, tx) {
      const invitationId = String(values['invitationId'])
      const client = db
      const rows = await client
        .update(guestInvitations)
        .set({
          confirmedPartySize: values['confirmedPartySize'] as number | null,
          rsvpSource: values['rsvpSource'] as string,
          rsvpAt: values['rsvpAt'] as Date,
        })
        .where(eq(guestInvitations.id, invitationId))
        .returning({
          id: guestInvitations.id,
          confirmedPartySize: guestInvitations.confirmedPartySize,
        })
      const row = rows[0]
      if (!row) throw new Error('RSVP güncellenemedi')
      return row
    },

    async updateGuestRsvp(guestId, rsvp, tx) {
      const client = (tx as Db | undefined) ?? db
      await client
        .update(guests)
        .set({ rsvp, updatedAt: new Date() })
        .where(eq(guests.id, guestId))
    },
  }
}

/** Kullanılmayan import uyarısını önle. */
void inArray
