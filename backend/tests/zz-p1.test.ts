import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../src/db/schema.js'
import { drizzleGuestDeps } from '../src/guests/store.js'
import { createGuest, createGuestsBulk } from '../src/guests/service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const M = join(__dirname, '../src/db/migrations')
let pg: PGlite; let store: any; let userB: string, weddingA: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(M).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(M, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) await pg.exec(st)
  }
  store = drizzleGuestDeps(drizzle(pg, { schema }) as any)
  const a = await pg.query<{id:string}>(`INSERT INTO users (email, display_name) VALUES ('m1@t.l','A') RETURNING id`)
  const b = await pg.query<{id:string}>(`INSERT INTO users (email, display_name) VALUES ('m2@t.l','B') RETURNING id`)
  userB = b.rows[0]!.id
  const w = await pg.query<{id:string}>(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & A','2026-09-12T19:00:00Z') RETURNING id`)
  weddingA = w.rows[0]!.id
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [weddingA, a.rows[0]!.id])
}, 60000)
afterAll(async () => { await pg?.close() })

describe('PROBE membership', () => {
  it('non-member createGuest', async () => {
    try {
      await createGuest({ weddingId: weddingA, userId: userB, input: { name: 'X' } }, store)
      console.log('>>> RESULT: ALLOWED (no membership check)')
    } catch (e) { console.log('>>> RESULT: REJECTED', (e as Error).message) }
  })
  it('non-member bulk', async () => {
    try {
      await createGuestsBulk({ weddingId: weddingA, userId: userB, inputs: [{name:'Y'},{name:'Z'}] }, store)
      console.log('>>> BULK: ALLOWED')
    } catch (e) { console.log('>>> BULK: REJECTED', (e as Error).message) }
  })
  it('row count', async () => {
    const r = await pg.query(`SELECT name FROM guests WHERE wedding_id=$1`, [weddingA])
    console.log('>>> ROWS:', JSON.stringify(r.rows))
  })
})
