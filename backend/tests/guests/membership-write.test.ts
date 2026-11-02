import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { createGuest, createGuestsBulk } from '../../src/guests/service.js'

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let userA: string
let userB: string
let weddingA: string

beforeAll(async () => {
  pg = new PGlite()
  const M = 'src/db/migrations'
  for (const f of readdirSync(M).filter(x=>x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(M,f),'utf8')
    for (const st of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await pg.exec(st)
  }
  store = drizzleGuestDeps(drizzle(pg, { schema }) as never)
  const a = await pg.query<{id:string}>(`INSERT INTO users (email, display_name) VALUES ('a@c1.local','A') RETURNING id`)
  const b = await pg.query<{id:string}>(`INSERT INTO users (email, display_name) VALUES ('b@c1.local','B') RETURNING id`)
  userA = a.rows[0]!.id
  userB = b.rows[0]!.id
  const w = await pg.query<{id:string}>(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('A','2026-09-12') RETURNING id`)
  weddingA = w.rows[0]!.id
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [weddingA, userA])
}, 60000)
afterAll(async () => { await pg?.close() })

describe('C1: servis katmanı üyelik kontrolü', () => {
  it('ÜYE OLMAYAN createGuest yapamamalı', async () => {
    await expect(
      createGuest({ weddingId: weddingA, userId: userB, input: { name: 'Sızma' } }, store),
    ).rejects.toThrow()
  })

  it('ÜYE OLMAYAN createGuestsBulk yapamamalı', async () => {
    await expect(
      createGuestsBulk({ weddingId: weddingA, userId: userB, inputs: [{ name: 'X' }] }, store),
    ).rejects.toThrow()
  })

  it('hiçbir satır yazılmamış olmalı', async () => {
    const r = await pg.query<{c:string}>(`SELECT COUNT(*)::text c FROM guests WHERE wedding_id=$1`, [weddingA])
    expect(Number(r.rows[0]!.c)).toBe(0)
  })
})
