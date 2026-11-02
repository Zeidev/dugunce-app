import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { listGuests, MAX_GUEST_PAGE } from '../../src/guests/service.js'

/**
 * Davetli sayfalaması — spec §6b.7: "sayfalama (cursor)".
 *
 * Keyset pagination: offset DEĞİL, çünkü offset'te araya kayıt girince
 * sayfa kayar (kullanıcı aynı kişiyi iki kez görür veya birini atlar).
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
    `INSERT INTO users (email, display_name) VALUES ('p@t.local','P') RETURNING id`,
  )
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan) VALUES ('A & B','2026-09-12','PREMIUM') RETURNING id`,
  )
  wid = w.rows[0]!.id
  uid = u.rows[0]!.id
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [wid, uid])

  // 25 davetli, createdAt sıralı
  for (let i = 0; i < 25; i++) {
    await pg.query(
      `INSERT INTO guests (wedding_id, name, created_at)
       VALUES ($1, $2, now() - ($3 || ' seconds')::interval)`,
      [wid, `Davetli ${String(i).padStart(2, '0')}`, 100 - i],
    )
  }
}, 90_000)

afterAll(async () => { await pg?.close() })

describe('davetli sayfalaması (keyset)', () => {
  it('varsayılan sayfa 50', async () => {
    const r = await listGuests({ weddingId: wid, userId: uid }, store)
    expect(r.length).toBe(25) // 25 < 50
  })

  it('limit sayfa boyutunu belirler', async () => {
    const r = await listGuests({ weddingId: wid, userId: uid, limit: 10 }, store)
    expect(r).toHaveLength(10)
  })

  it('limit azami 200 ile kelepçelenir', async () => {
    const r = await listGuests({ weddingId: wid, userId: uid, limit: 9999 }, store)
    // 25 kayıt var, 200 sınırı aşılmıyor
    expect(r.length).toBeLessThanOrEqual(MAX_GUEST_PAGE)
  })

  it('geçersiz limit reddedilir', async () => {
    await expect(
      listGuests({ weddingId: wid, userId: uid, limit: 0 }, store),
    ).rejects.toThrow(/en az 1/)
  })

  it('cursor ile sonraki sayfa', async () => {
    const first = await listGuests({ weddingId: wid, userId: uid, limit: 10 }, store)
    expect(first).toHaveLength(10)

    const last = first[first.length - 1]!
    const cursor = last.id

    const second = await listGuests(
      { weddingId: wid, userId: uid, limit: 10, cursor },
      store,
    )
    expect(second).toHaveLength(10)

    // Sayfalar arasında tekrar YOK
    const firstIds = new Set(first.map((g) => g.id))
    expect(second.every((g) => !firstIds.has(g.id))).toBe(true)
  })

  it('tüm sayfalar birleşince tam liste', async () => {
    const all: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const r = await listGuests(
        { weddingId: wid, userId: uid, limit: 10, ...(cursor ? { cursor } : {}) },
        store,
      )
      all.push(...r.map((g) => g.id))
      if (r.length < 10) break
      cursor = r[r.length - 1]!.id
    }
    expect(all).toHaveLength(25)
    expect(new Set(all).size).toBe(25) // tekrar yok
  })

  it('bilinmeyen cursor yok sayılır (ilk sayfa döner)', async () => {
    const r = await listGuests(
      { weddingId: wid, userId: uid, limit: 5, cursor: 'bozuk|cursor' },
      store,
    )
    expect(r).toHaveLength(5)
  })

  it('sayfalama aramayla birleşir', async () => {
    const r = await listGuests(
      { weddingId: wid, userId: uid, limit: 3, search: 'Davetli 1' },
      store,
    )
    // "Davetli 10".."Davetli 19" → 10 kayıt, 3'lük sayfa
    expect(r).toHaveLength(3)
    expect(r.every((g) => g.name.includes('Davetli 1'))).toBe(true)
  })
})
