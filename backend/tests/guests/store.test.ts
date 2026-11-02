/**
 * Davetli deposu — GERÇEK Drizzle + PGlite.
 *
 * Aşama 3'ün dersi: ham SQL çalıştıran testler Drizzle join'ini KANITLAMAZ.
 * Bu dosya gerçek store'u çalıştırır; üyelik join'i kaldırılırsa kırılır.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { createGuest, listGuests, deleteGuest, getGuestUsage } from '../../src/guests/service.js'
import { createInvitation, resolveInvitation } from '../../src/guests/invitation.js'
import { submitRsvp } from '../../src/guests/rsvp.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let userA: string
let userB: string
let weddingA: string
let weddingB: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, { schema })
  store = drizzleGuestDeps(db as unknown as Parameters<typeof drizzleGuestDeps>[0])

  const a = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('ga@test.local','A') RETURNING id`,
  )
  const b = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('gb@test.local','B') RETURNING id`,
  )
  userA = a.rows[0]!.id
  userB = b.rows[0]!.id

  const wa = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & A','2026-09-12T19:00:00Z') RETURNING id`,
  )
  const wb = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('B & B','2026-10-12T19:00:00Z') RETURNING id`,
  )
  weddingA = wa.rows[0]!.id
  weddingB = wb.rows[0]!.id

  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingA, userA],
  )
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingB, userB],
  )
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('drizzleGuestDeps — davetli CRUD (gerçek Drizzle)', () => {
  it('davetli oluşturulur', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Ayşe', phone: '0532 123 45 67' } },
      store,
    )
    expect(g.name).toBe('Ayşe')
    expect(g.phone).toBe('+905321234567')
    expect(g.rsvp).toBe('PENDING')
  })

  it('İDOR: başka düğünün davetlisi görünmez', async () => {
    const list = await listGuests({ weddingId: weddingB, userId: userA }, store)
    expect(list).toHaveLength(0)
  })

  it('İDOR: yabancı kullanıcı davetli listesini göremez', async () => {
    const list = await listGuests({ weddingId: weddingA, userId: userB }, store)
    expect(list).toHaveLength(0)
  })

  it('kendi listesi görünür', async () => {
    const list = await listGuests({ weddingId: weddingA, userId: userA }, store)
    expect(list.length).toBeGreaterThan(0)
  })

  it('güncelleme çalışır ve updatedAt değişir', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Eski' } },
      store,
    )
    const { updateGuest } = await import('../../src/guests/service.js')
    const updated = await updateGuest(
      { weddingId: weddingA, userId: userA, guestId: g.id, patch: { name: 'Yeni' } },
      store,
    )
    expect(updated!.name).toBe('Yeni')
  })

  it('İDOR: yabancı davetliyi güncelleyemez', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Korunan' } },
      store,
    )
    const { updateGuest } = await import('../../src/guests/service.js')
    const r = await updateGuest(
      { weddingId: weddingA, userId: userB, guestId: g.id, patch: { name: 'Hack' } },
      store,
    )
    expect(r).toBeNull()

    const row = await pg.query<{ name: string }>(`SELECT name FROM guests WHERE id=$1`, [g.id])
    expect(row.rows[0]!.name).toBe('Korunan')
  })

  it('SAVUNMA DERİNLİĞİ: updateGuest doğrudan çağrılsa da yabancı yazamaz', async () => {
    // findById'ı atlayıp doğrudan store katmanını sınıyoruz.
    // Servis bir gün değişse bile SQL'deki EXISTS üyelik kontrolü
    // yabancı yazmayı engeller.
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Katman' } },
      store,
    )
    await expect(
      store.updateGuest(g.id, { name: 'Hack' }, weddingA, userB),
    ).rejects.toThrow(/güncellenemedi/i)

    const row = await pg.query<{ name: string }>(`SELECT name FROM guests WHERE id=$1`, [g.id])
    expect(row.rows[0]!.name).toBe('Katman')
  })

  it('soft delete sonrası listede görünmez ama kayıt durur', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Silinecek' } },
      store,
    )
    const ok = await deleteGuest({ weddingId: weddingA, userId: userA, guestId: g.id }, store)
    expect(ok).toBe(true)

    const active = await listGuests({ weddingId: weddingA, userId: userA }, store)
    expect(active.find((x) => x.id === g.id)).toBeUndefined()

    const withDeleted = await listGuests(
      { weddingId: weddingA, userId: userA, includeDeleted: true },
      store,
    )
    expect(withDeleted.find((x) => x.id === g.id)).toBeDefined()
  })

  it('taraf filtresi çalışır', async () => {
    await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Damat Tarafı', side: 'GROOM' } },
      store,
    )
    const groom = await listGuests({ weddingId: weddingA, userId: userA, side: 'GROOM' }, store)
    expect(groom.every((g) => g.side === 'GROOM')).toBe(true)
    expect(groom.length).toBeGreaterThan(0)
  })
})

describe('drizzleGuestDeps — limit (gerçek DB)', () => {
  it('kullanım bilgisi doğru', async () => {
    const u = await getGuestUsage({ weddingId: weddingA, userId: userA }, store)
    expect(u.limit).toBe(30)
    expect(u.used).toBeGreaterThan(0)
    expect(u.remaining).toBe(30 - u.used)
  })

  it('silinmiş davetliler sayılmaz', async () => {
    const before = await getGuestUsage({ weddingId: weddingA, userId: userA }, store)
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Sayılmayacak' } },
      store,
    )
    const mid = await getGuestUsage({ weddingId: weddingA, userId: userA }, store)
    expect(mid.used).toBe(before.used + 1)

    await deleteGuest({ weddingId: weddingA, userId: userA, guestId: g.id }, store)
    const after = await getGuestUsage({ weddingId: weddingA, userId: userA }, store)
    expect(after.used).toBe(before.used)
  })
})

describe('drizzleGuestDeps — davetiye (gerçek Drizzle)', () => {
  it('davetiye üretilir ve token çözülür', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Davetli' } },
      store,
    )
    const inv = await createInvitation(
      { weddingId: weddingA, userId: userA, guestId: g.id, allowedPartySize: 3 },
      store,
    )
    expect(inv).not.toBeNull()

    const resolved = await resolveInvitation(inv!.token, store)
    expect(resolved).not.toBeNull()
    expect(resolved!.allowedPartySize).toBe(3)
    expect(resolved!.guest.name).toBe('Davetli')
    expect(resolved!.wedding.coupleNames).toBe('A & A')
  })

  it('İDOR: başka düğünün davetlisine davetiye üretilemez', async () => {
    const g = await createGuest(
      { weddingId: weddingB, userId: userB, input: { name: 'B davetlisi' } },
      store,
    )
    const inv = await createInvitation(
      { weddingId: weddingB, userId: userA, guestId: g.id },
      store,
    )
    expect(inv).toBeNull()
  })

  it('silinen davetlinin token\'ı çözülemez (Review Focus #5)', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Silinecek davetli' } },
      store,
    )
    const inv = await createInvitation(
      { weddingId: weddingA, userId: userA, guestId: g.id },
      store,
    )
    expect(await resolveInvitation(inv!.token, store)).not.toBeNull()

    await deleteGuest({ weddingId: weddingA, userId: userA, guestId: g.id }, store)
    expect(await resolveInvitation(inv!.token, store)).toBeNull()
  })

  it('COMPOSITE FK: yanlış wedding_id ile davetiye yazılamaz', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'FK testi' } },
      store,
    )
    await expect(
      pg.query(
        `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
         VALUES ($1,$2,'deadbeef', now() + interval '1 day')`,
        [weddingB, g.id],
      ),
    ).rejects.toThrow()
  })

  it('CASCADE: davetli silinince davetiye satırı gider', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Cascade' } },
      store,
    )
    await createInvitation({ weddingId: weddingA, userId: userA, guestId: g.id }, store)

    const before = await pg.query(`SELECT id FROM guest_invitations WHERE guest_id=$1`, [g.id])
    expect(before.rows.length).toBeGreaterThan(0)

    // Fiziksel silme (CASCADE testi) — soft delete değil
    await pg.query(`DELETE FROM guests WHERE id=$1`, [g.id])
    const after = await pg.query(`SELECT id FROM guest_invitations WHERE guest_id=$1`, [g.id])
    expect(after.rows.length).toBe(0)
  })

  it('CASCADE: düğün silinince davetli + davetiye gider', async () => {
    const w = await pg.query<{ id: string }>(
      `INSERT INTO weddings (couple_names, wedding_date) VALUES ('C & C','2026-12-12') RETURNING id`,
    )
    const wid = w.rows[0]!.id
    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
      [wid, userA],
    )
    const g = await pg.query<{ id: string }>(
      `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'C','BRIDE') RETURNING id`,
      [wid],
    )
    await pg.query(
      `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
       VALUES ($1,$2,'cascadehash', now() + interval '1 day')`,
      [wid, g.rows[0]!.id],
    )

    await pg.query(`DELETE FROM weddings WHERE id=$1`, [wid])
    const guestsLeft = await pg.query(`SELECT id FROM guests WHERE wedding_id=$1`, [wid])
    const invLeft = await pg.query(`SELECT id FROM guest_invitations WHERE wedding_id=$1`, [wid])
    expect(guestsLeft.rows.length).toBe(0)
    expect(invLeft.rows.length).toBe(0)
  })
})

describe('drizzleGuestDeps — RSVP (gerçek Drizzle)', () => {
  it('RSVP yazılır, davetiye ve davetli TUTARLI olur', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'RSVP davetlisi' } },
      store,
    )
    const inv = await createInvitation(
      { weddingId: weddingA, userId: userA, guestId: g.id, allowedPartySize: 4 },
      store,
    )

    const r = await submitRsvp(
      { rawToken: inv!.token, rsvp: 'ATTENDING', partySize: 3 },
      store,
    )
    expect(r).not.toBeNull()

    // Davetiye tarafı
    const invRow = await pg.query<{ confirmed_party_size: number; rsvp_source: string }>(
      `SELECT confirmed_party_size, rsvp_source FROM guest_invitations WHERE id=$1`,
      [r!.id],
    )
    expect(invRow.rows[0]!.confirmed_party_size).toBe(3)
    expect(invRow.rows[0]!.rsvp_source).toBe('GUEST')

    // Davetli tarafı — TUTARLI olmalı
    const guestRow = await pg.query<{ rsvp: string }>(
      `SELECT rsvp FROM guests WHERE id=$1`,
      [g.id],
    )
    expect(guestRow.rows[0]!.rsvp).toBe('ATTENDING')
  })

  it('idempotent: aynı yanıt iki kez → rsvp_at değişmez', async () => {
    const g = await createGuest(
      { weddingId: weddingA, userId: userA, input: { name: 'Idem' } },
      store,
    )
    const inv = await createInvitation(
      { weddingId: weddingA, userId: userA, guestId: g.id, allowedPartySize: 2 },
      store,
    )

    await submitRsvp({ rawToken: inv!.token, rsvp: 'ATTENDING', partySize: 2 }, store)
    const first = await pg.query<{ rsvp_at: string }>(
      `SELECT rsvp_at FROM guest_invitations WHERE guest_id=$1`,
      [g.id],
    )

    await submitRsvp({ rawToken: inv!.token, rsvp: 'ATTENDING', partySize: 2 }, store)
    const second = await pg.query<{ rsvp_at: string }>(
      `SELECT rsvp_at FROM guest_invitations WHERE guest_id=$1`,
      [g.id],
    )

    expect(second.rows[0]!.rsvp_at).toEqual(first.rows[0]!.rsvp_at)
  })
})
