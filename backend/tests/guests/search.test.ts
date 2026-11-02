import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'

/**
 * Davetli araması — spec §6b.7 "Ad arama".
 *
 * Sunucu tarafı: istemci tüm listeyi çekip elemez.
 * 30 davetlilik ücretsiz planda fark etmez, premium'da (sınırsız) şart.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIG = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let wid: string
let uid: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
  const db = drizzle(pg, { schema })
  store = drizzleGuestDeps(db as never)

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('s@t.local','S') RETURNING id`,
  )
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan) VALUES ('A & B','2026-09-12','PREMIUM') RETURNING id`,
  )
  wid = w.rows[0]!.id
  uid = u.rows[0]!.id
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [wid, uid])
  await pg.query(
    `INSERT INTO guests (wedding_id, name, phone) VALUES
       ($1,'Ayşe Yılmaz','+905551112233'),
       ($1,'Mehmet Demir','+905554445566'),
       ($1,'Zeynep Şahin',null)`,
    [wid],
  )
}, 60_000)

afterAll(async () => { await pg?.close() })

describe('davetli araması (sunucu tarafı)', () => {
  it('aramayoksa tümü döner', async () => {
    const r = await store.listByWedding(wid, uid, {})
    expect(r).toHaveLength(3)
  })

  it('ad ile arar', async () => {
    const r = await store.listByWedding(wid, uid, { search: 'ayşe' })
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('Ayşe Yılmaz')
  })

  it('kısmi ad yeterli', async () => {
    const r = await store.listByWedding(wid, uid, { search: 'Dem' })
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('Mehmet Demir')
  })

  it('büyük harf duyarsız', async () => {
    const lower = await store.listByWedding(wid, uid, { search: 'zeynep' })
    const upper = await store.listByWedding(wid, uid, { search: 'ZEYNEP' })
    expect(lower).toHaveLength(1)
    expect(upper).toHaveLength(1)
  })

  it('Türkçe karakterle arar', async () => {
    const r = await store.listByWedding(wid, uid, { search: 'ŞAHİN' })
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('Zeynep Şahin')
  })

  it('telefon ile arar', async () => {
    // +905554445566 → "4445" dizisi var
    const r = await store.listByWedding(wid, uid, { search: '4445' })
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('Mehmet Demir')
  })

  it('telefon ülke koduyla arar', async () => {
    const r = await store.listByWedding(wid, uid, { search: '9055511' })
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('Ayşe Yılmaz')
  })

  it('eşleşme yoksa boş', async () => {
    const r = await store.listByWedding(wid, uid, { search: 'zzzz' })
    expect(r).toHaveLength(0)
  })

  it('arama filtreyle birleşir', async () => {
    const r = await store.listByWedding(wid, uid, { search: 'e', side: 'GROOM' })
    // Yalnızca damat tarafı + "e" içeren
    expect(r.every((g) => g.side === 'GROOM')).toBe(true)
  })

  it('silinmiş davetli aramada çıkmaz', async () => {
    await pg.query(`UPDATE guests SET deleted_at = now() WHERE name = 'Zeynep Şahin'`)
    const r = await store.listByWedding(wid, uid, { search: 'Zeynep' })
    expect(r).toHaveLength(0)
  })
})
