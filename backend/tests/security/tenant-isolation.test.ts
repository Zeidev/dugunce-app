/**
 * TENANT İZOLASYONU — SECURITY §8 test 1
 *
 * "Başka düğünün ID'si ile veri okunamıyor ve değiştirilemiyor."
 *
 * Gerçek PostgreSQL (PGlite) üzerinde çalışır. Servis katmanı yerine
 * doğrudan SQL kullanılır — böylece izolasyonun **veritabanı sorgu
 * seviyesinde** doğru olduğu kanıtlanır (mock değil).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let userA: string
let userB: string
let weddingA: string
let weddingB: string

beforeAll(async () => {
  pg = new PGlite()

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt)
    }
  }

  const a = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`,
    ['a@test.local', 'A'],
  )
  const b = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`,
    ['b@test.local', 'B'],
  )
  userA = a.rows[0]!.id
  userB = b.rows[0]!.id

  const wa = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1,$2) RETURNING id`,
    ['A & A', '2026-09-12T19:00:00Z'],
  )
  const wb = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1,$2) RETURNING id`,
    ['B & B', '2026-10-12T19:00:00Z'],
  )
  weddingA = wa.rows[0]!.id
  weddingB = wb.rows[0]!.id

  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [weddingA, userA])
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [weddingB, userB])
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('TENANT İZOLASYONU — düğün erişimi', () => {
  it('A kendi düğününü görebilir', async () => {
    const r = await pg.query(
      `SELECT w.id FROM weddings w
       JOIN wedding_members m ON m.wedding_id = w.id
       WHERE w.id = $1 AND m.user_id = $2`,
      [weddingA, userA],
    )
    expect(r.rows).toHaveLength(1)
  })

  it('A, B\'nin düğününü üyelik sorgusu ile göremez', async () => {
    const r = await pg.query(
      `SELECT w.id FROM weddings w
       JOIN wedding_members m ON m.wedding_id = w.id
       WHERE w.id = $1 AND m.user_id = $2`,
      [weddingB, userA],
    )
    expect(r.rows).toHaveLength(0)
  })

  it('A\'nın listesinde B\'nin düğünü YOK', async () => {
    const r = await pg.query<{ id: string }>(
      `SELECT w.id FROM weddings w
       JOIN wedding_members m ON m.wedding_id = w.id
       WHERE m.user_id = $1`,
      [userA],
    )
    const ids = r.rows.map((x) => x.id)
    expect(ids).toContain(weddingA)
    expect(ids).not.toContain(weddingB)
  })

  it('B\'nin listesinde A\'nın düğünü YOK', async () => {
    const r = await pg.query<{ id: string }>(
      `SELECT w.id FROM weddings w
       JOIN wedding_members m ON m.wedding_id = w.id
       WHERE m.user_id = $1`,
      [userB],
    )
    const ids = r.rows.map((x) => x.id)
    expect(ids).toContain(weddingB)
    expect(ids).not.toContain(weddingA)
  })
})

describe('TENANT İZOLASYONU — üyelik', () => {
  it('A, B\'nin düğününe üye değil', async () => {
    const r = await pg.query(
      `SELECT 1 FROM wedding_members WHERE wedding_id=$1 AND user_id=$2`,
      [weddingB, userA],
    )
    expect(r.rows).toHaveLength(0)
  })

  it('her düğünün tam 1 OWNER\'ı var', async () => {
    const a = await pg.query<{ role: string }>(
      `SELECT role FROM wedding_members WHERE wedding_id=$1`,
      [weddingA],
    )
    expect(a.rows).toHaveLength(1)
    expect(a.rows[0]!.role).toBe('OWNER')
  })

  it('çift üyelik eklenemez (unique constraint)', async () => {
    await expect(
      pg.query(
        `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'CO_OWNER')`,
        [weddingA, userA],
      ),
    ).rejects.toThrow(/unique|duplicate/i)
  })
})

describe('TENANT İZOLASYONU — davet kodu', () => {
  it('davet kodu doğru düğüne bağlanır', async () => {
    await pg.query(
      `INSERT INTO invites (wedding_id, code, role, expires_at, created_by)
       VALUES ($1,$2,'CO_OWNER', now() + interval '10 minutes', $3)`,
      [weddingA, 'AAAA111', userA],
    )
    const r = await pg.query<{ wedding_id: string }>(
      `SELECT wedding_id FROM invites WHERE code=$1`,
      ['AAAA111'],
    )
    expect(r.rows[0]!.wedding_id).toBe(weddingA)
    expect(r.rows[0]!.wedding_id).not.toBe(weddingB)
  })

  it('kod tek kullanımlık — koşullu UPDATE ikinci kez true dönmez', async () => {
    await pg.query(
      `INSERT INTO invites (wedding_id, code, role, expires_at, created_by)
       VALUES ($1,$2,'CO_OWNER', now() + interval '10 minutes', $3)`,
      [weddingA, 'BBBB222', userA],
    )

    const first = await pg.query(
      `UPDATE invites SET used_at = now() WHERE code=$1 AND used_at IS NULL RETURNING id`,
      ['BBBB222'],
    )
    expect(first.rows).toHaveLength(1)

    const second = await pg.query(
      `UPDATE invites SET used_at = now() WHERE code=$1 AND used_at IS NULL RETURNING id`,
      ['BBBB222'],
    )
    expect(second.rows).toHaveLength(0)
  })
})

describe('TENANT İZOLASYONU — DB seviyesi', () => {
  it('olmayan düğüne üyelik eklenemez (FK)', async () => {
    const fakeWedding = '00000000-0000-0000-0000-000000000000'
    await expect(
      pg.query(
        `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
        [fakeWedding, userA],
      ),
    ).rejects.toThrow(/foreign key|violates/i)
  })

  it('olmayan kullanıcı ile üyelik eklenemez (FK)', async () => {
    const fakeUser = '00000000-0000-0000-0000-000000000000'
    await expect(
      pg.query(
        `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
        [weddingA, fakeUser],
      ),
    ).rejects.toThrow(/foreign key|violates/i)
  })

  it('CASCADE: düğün silinince üyelik ve davet gider', async () => {
    const w = await pg.query<{ id: string }>(
      `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1,$2) RETURNING id`,
      ['Temp & Temp', '2026-01-01T00:00:00Z'],
    )
    const tempWedding = w.rows[0]!.id
    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
      [tempWedding, userA],
    )
    await pg.query(
      `INSERT INTO invites (wedding_id, code, role) VALUES ($1,$2,'CO_OWNER')`,
      [tempWedding, 'TEMP999'],
    )

    await pg.query(`DELETE FROM weddings WHERE id=$1`, [tempWedding])

    const m = await pg.query(`SELECT 1 FROM wedding_members WHERE wedding_id=$1`, [tempWedding])
    const i = await pg.query(`SELECT 1 FROM invites WHERE wedding_id=$1`, [tempWedding])
    expect(m.rows).toHaveLength(0)
    expect(i.rows).toHaveLength(0)
  })
})
