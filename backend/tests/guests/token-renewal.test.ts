import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { createGuest } from '../../src/guests/service.js'
import { createInvitation } from '../../src/guests/invitation.js'
import { submitRsvp } from '../../src/guests/rsvp.js'
import { resolveInvitation } from '../../src/guests/invitation.js'

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let weddingId: string
let userId: string

beforeAll(async () => {
  pg = new PGlite()
  const M = 'src/db/migrations'
  for (const f of readdirSync(M).filter(x=>x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(M,f),'utf8')
    for (const st of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await pg.exec(st)
  }
  const db = drizzle(pg, { schema })
  store = drizzleGuestDeps(db as never)
  const u = await pg.query<{id:string}>(`INSERT INTO users (email, display_name) VALUES ('c@t.local','C') RETURNING id`)
  userId = u.rows[0]!.id
  const w = await pg.query<{id:string}>(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('C','2026-09-12') RETURNING id`)
  weddingId = w.rows[0]!.id
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [weddingId, userId])
}, 60000)
afterAll(async () => { await pg?.close() })

describe('RSVP tutarlılığı — çok davetiye durumu', () => {
  it('aynı davetlinin İKİ davetiyesi varsa ikisi de mi güncelleniyor?', async () => {
    const g = await createGuest({ weddingId, userId, input: { name: 'İki Token' } }, store)
    const inv1 = await createInvitation({ weddingId, userId, guestId: g.id, allowedPartySize: 3 }, store)
    const inv2 = await createInvitation({ weddingId, userId, guestId: g.id, allowedPartySize: 3 }, store)

    // İlk token ile RSVP
    await submitRsvp({ rawToken: inv1!.token, rsvp: 'ATTENDING', partySize: 2 }, store)

    // Yeni token üretmek eskisini İPTAL eder (SECURITY §10.4 #3).
    // Aksi halde davetli hangi linki açtığına göre farklı RSVP durumu görür.
    const rows = await pg.query<{ id: string; revoked_at: string | null }>(
      `SELECT id, revoked_at::text FROM guest_invitations WHERE guest_id=$1 ORDER BY created_at`,
      [g.id],
    )
    expect(rows.rows).toHaveLength(2)

    // Eskisi revoke, yenisi aktif
    expect(rows.rows[0]!.revoked_at).not.toBeNull()
    expect(rows.rows[1]!.revoked_at).toBeNull()

    // Eski token artık çözülemez
    const oldResolved = await resolveInvitation(inv1!.token, store)
    expect(oldResolved).toBeNull()

    // Yeni token çözülür ve güncel RSVP durumunu taşır
    const newResolved = await resolveInvitation(inv2!.token, store)
    expect(newResolved).not.toBeNull()
  })

  it('yeni token üretilince RSVP durumu KAYBOLMAZ (davetli kaydında durur)', async () => {
    const g = await createGuest({ weddingId, userId, input: { name: 'RSVP Korunan' } }, store)
    const inv1 = await createInvitation({ weddingId, userId, guestId: g.id, allowedPartySize: 3 }, store)
    await submitRsvp({ rawToken: inv1!.token, rsvp: 'ATTENDING', partySize: 2 }, store)

    // Yeni token üret (eskisi iptal olur)
    const inv2 = await createInvitation({ weddingId, userId, guestId: g.id, allowedPartySize: 3 }, store)

    // Davetli kaydındaki rsvp korunur — çift listesinde doğru görünür
    const guestRow = await pg.query<{ rsvp: string }>(
      `SELECT rsvp FROM guests WHERE id=$1`,
      [g.id],
    )
    expect(guestRow.rows[0]!.rsvp).toBe('ATTENDING')

    // Yeni token'dan RSVP durumu okunabilir (guest.rsvp üzerinden)
    const resolved = await resolveInvitation(inv2!.token, store)
    expect(resolved!.guest.rsvp).toBe('ATTENDING')
  })
})
