/**
 * Çiftin davetli adına RSVP girmesi (SECURITY §10.2 karar #4 ve #5).
 *
 * Gerçek store üzerinden: liste ile davetiye TUTARLI olmalı ve
 * `rsvp_source` COUPLE yazılmalı.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { createGuest, setGuestRsvp } from '../../src/guests/service.js'
import { createInvitation } from '../../src/guests/invitation.js'

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let userId: string
let weddingId: string

beforeAll(async () => {
  pg = new PGlite()
  const M = 'src/db/migrations'
  for (const f of readdirSync(M).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(M, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
  store = drizzleGuestDeps(drizzle(pg, { schema }) as never)

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('cr@t.local','C') RETURNING id`,
  )
  userId = u.rows[0]!.id
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, rsvp_deadline)
     VALUES ('C','2026-09-12', now() - interval '10 days') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('setGuestRsvp — çift tarafı', () => {
  it('ATTENDING + kişi sayısı yazılır, rsvp_source COUPLE olur', async () => {
    const g = await createGuest({ weddingId, userId, input: { name: 'Telefonla' } }, store)
    await createInvitation(
      { weddingId, userId, guestId: g.id, allowedPartySize: 4 },
      store,
    )

    const updated = await setGuestRsvp(
      { weddingId, userId, guestId: g.id, rsvp: 'ATTENDING', partySize: 3 },
      store,
    )
    expect(updated!.rsvp).toBe('ATTENDING')

    const inv = await pg.query<{ confirmed_party_size: number; rsvp_source: string }>(
      `SELECT confirmed_party_size, rsvp_source FROM guest_invitations WHERE guest_id=$1`,
      [g.id],
    )
    expect(inv.rows[0]!.confirmed_party_size).toBe(3)
    expect(inv.rows[0]!.rsvp_source).toBe('COUPLE')
  })

  it('DEADLINE GEÇMİŞ olsa bile çift yazabilir (karar #5)', async () => {
    // wedding.rsvp_deadline geçmişte (10 gün önce)
    const g = await createGuest({ weddingId, userId, input: { name: 'Geç Yanıt' } }, store)
    await createInvitation({ weddingId, userId, guestId: g.id, allowedPartySize: 2 }, store)

    const updated = await setGuestRsvp(
      { weddingId, userId, guestId: g.id, rsvp: 'ATTENDING', partySize: 2 },
      store,
    )
    expect(updated!.rsvp).toBe('ATTENDING')
  })

  it('DECLINED → confirmed 0', async () => {
    const g = await createGuest({ weddingId, userId, input: { name: 'Gelemiyor' } }, store)
    await createInvitation({ weddingId, userId, guestId: g.id }, store)

    await setGuestRsvp({ weddingId, userId, guestId: g.id, rsvp: 'DECLINED' }, store)

    const inv = await pg.query<{ confirmed_party_size: number }>(
      `SELECT confirmed_party_size FROM guest_invitations WHERE guest_id=$1`,
      [g.id],
    )
    expect(inv.rows[0]!.confirmed_party_size).toBe(0)
  })

  it('izin verilen kişi sayısı aşılamaz', async () => {
    const g = await createGuest({ weddingId, userId, input: { name: 'Aşan' } }, store)
    await createInvitation({ weddingId, userId, guestId: g.id, allowedPartySize: 2 }, store)

    await expect(
      setGuestRsvp(
        { weddingId, userId, guestId: g.id, rsvp: 'ATTENDING', partySize: 5 },
        store,
      ),
    ).rejects.toThrow(/2/)
  })

  it('üye olmayan davetliyi değiştiremez (IDOR)', async () => {
    const g = await createGuest({ weddingId, userId, input: { name: 'Korunan' } }, store)
    const other = await pg.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ('other@t.local','O') RETURNING id`,
    )

    const r = await setGuestRsvp(
      { weddingId, userId: other.rows[0]!.id, guestId: g.id, rsvp: 'ATTENDING', partySize: 1 },
      store,
    )
    expect(r).toBeNull()
  })
})
