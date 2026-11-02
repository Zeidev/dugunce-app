/**
 * Davetli migration kısıtları — PGlite üzerinde.
 *
 * `scripts/verify-migrations.mjs` gerçek PostgreSQL ister (CI'da service
 * container). Bu dosya aynı kısıtları PGlite ile doğrular, böylece
 * `npm test` tek başına da kapsar.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let userId: string
let weddingId: string
let otherWeddingId: string
let guestId: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('mig@test.local','M') RETURNING id`,
  )
  userId = u.rows[0]!.id

  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('M & M','2026-09-12') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )

  const w2 = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('N & N','2026-10-12') RETURNING id`,
  )
  otherWeddingId = w2.rows[0]!.id

  const g = await pg.query<{ id: string }>(
    `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'Ayşe','BRIDE') RETURNING id`,
    [weddingId],
  )
  guestId = g.rows[0]!.id
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('davetli migration kısıtları', () => {
  it('guests tablosu var', async () => {
    const r = await pg.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name='guests'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('guest_invitations tablosu var', async () => {
    const r = await pg.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name='guest_invitations'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('COMPOSITE FK kısıtı var', async () => {
    const r = await pg.query(
      `SELECT conname FROM pg_constraint WHERE conname='guest_invitations_guest_fk'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('guests (id, wedding_id) UNIQUE var', async () => {
    const r = await pg.query(
      `SELECT conname FROM pg_constraint WHERE conname='guests_id_wedding_unique'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('token_hash UNIQUE var', async () => {
    const r = await pg.query(
      `SELECT conname FROM pg_constraint
        WHERE conname='guest_invitations_token_hash_unique'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('ham token kolonu YOK', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='guest_invitations'`,
    )
    const names = r.rows.map((x) => x.column_name)
    expect(names).not.toContain('token')
    expect(names).toContain('token_hash')
  })

  it('COMPOSITE FK yanlış wedding_id reddeder', async () => {
    await expect(
      pg.query(
        `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
         VALUES ($1,$2,'wrong-wedding', now() + interval '1 day')`,
        [otherWeddingId, guestId],
      ),
    ).rejects.toThrow()
  })

  it('doğru wedding_id kabul edilir', async () => {
    await pg.query(
      `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
       VALUES ($1,$2,'correct-wedding', now() + interval '1 day')`,
      [weddingId, guestId],
    )
    const r = await pg.query(
      `SELECT id FROM guest_invitations WHERE token_hash='correct-wedding'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('CASCADE: davetli silinince davetiye gider', async () => {
    await pg.query(`DELETE FROM guests WHERE id=$1`, [guestId])
    const r = await pg.query(
      `SELECT id FROM guest_invitations WHERE guest_id=$1`,
      [guestId],
    )
    expect(r.rows).toHaveLength(0)
  })

  it('rsvp default PENDING', async () => {
    const g = await pg.query<{ rsvp: string }>(
      `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'Yeni','BRIDE') RETURNING rsvp`,
      [weddingId],
    )
    expect(g.rows[0]!.rsvp).toBe('PENDING')
  })

  it('allowed_party_size default 1', async () => {
    const g = await pg.query<{ id: string }>(
      `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'X','BRIDE') RETURNING id`,
      [weddingId],
    )
    const inv = await pg.query<{ allowed_party_size: number }>(
      `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
       VALUES ($1,$2,'default-party', now() + interval '1 day')
       RETURNING allowed_party_size`,
      [weddingId, g.rows[0]!.id],
    )
    expect(inv.rows[0]!.allowed_party_size).toBe(1)
  })

  it('silinmiş davetli soft delete ile işaretlenir', async () => {
    const g = await pg.query<{ id: string }>(
      `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'Silinecek','BRIDE') RETURNING id`,
      [weddingId],
    )
    await pg.query(`UPDATE guests SET deleted_at=now() WHERE id=$1`, [g.rows[0]!.id])
    const r = await pg.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM guests WHERE id=$1`,
      [g.rows[0]!.id],
    )
    expect(r.rows[0]!.deleted_at).not.toBeNull()
  })
})
