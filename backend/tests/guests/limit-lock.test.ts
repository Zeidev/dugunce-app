/**
 * Kilit GERÇEKTEN alınıyor mu — gerçek store üzerinden.
 *
 * `limit-race.test.ts` kendi SQL'ini yazıp onu test ediyordu; production
 * koddaki `lockWeddingForUpdate` gövdesi silinse hiçbir test kırılmıyordu
 * (review bulgusu I1). Bu dosya gerçek `drizzleGuestDeps()` fonksiyonunu
 * çağırır ve Drizzle'ın logger'ı üzerinden üretilen SQL'i denetler.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '../../src/db/schema.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import {
  createGuest,
  createGuestsBulk,
  GuestLimitError,
  FREE_GUEST_LIMIT,
} from '../../src/guests/service.js'

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let userId: string
let weddingId: string

/** Drizzle'ın ürettiği SQL'i toplayan logger. */
interface SeenQuery {
  q: string
  params: unknown[]
}
let seen: SeenQuery[] = []

beforeAll(async () => {
  pg = new PGlite()
  const M = 'src/db/migrations'
  for (const f of readdirSync(M).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(M, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, {
    schema,
    logger: {
      logQuery(q: string, params: unknown[]) {
        seen.push({ q, params })
      },
    },
  })
  store = drizzleGuestDeps(db as never)

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('lock@t.local','L') RETURNING id`,
  )
  userId = u.rows[0]!.id
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('L','2026-09-12') RETURNING id`,
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

function reset() {
  seen = []
}

describe('lockWeddingForUpdate — gerçek store (Review Focus #1)', () => {
  it('kilit SQL\'i gerçekten üretir (FOR UPDATE)', async () => {
    reset()
    await store.transaction(async (tx) => {
      await store.lockWeddingForUpdate(tx, weddingId)
    })

    const sawForUpdate = seen.some((s) => /FOR\s+UPDATE/i.test(s.q))
    expect(sawForUpdate).toBe(true)
  })

  it('kilit doğru düğünü hedefler', async () => {
    reset()
    await store.transaction(async (tx) => {
      await store.lockWeddingForUpdate(tx, weddingId)
    })

    const lockQuery = seen.find((s) => /FOR\s+UPDATE/i.test(s.q))
    expect(lockQuery).toBeDefined()
    expect(lockQuery!.params).toContain(weddingId)
  })

  it('createGuest kilidi sayımdan ÖNCE alır (TOCTOU)', async () => {
    reset()
    await createGuest({ weddingId, userId, input: { name: 'Kilit Sırası' } }, store)

    const lockIdx = seen.findIndex((s) => /FOR\s+UPDATE/i.test(s.q))
    const countIdx = seen.findIndex((s) => /COUNT\(\*\)/i.test(s.q))

    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(countIdx).toBeGreaterThanOrEqual(0)
    expect(lockIdx).toBeLessThan(countIdx)
  })

  it('limit doluyken gerçek store reddeder ve HİÇBİRİ yazılmaz', async () => {
    // Mevcut sayıyı tamamla
    const cur = await pg.query<{ c: string }>(
      `SELECT COUNT(*)::text c FROM guests WHERE wedding_id=$1 AND deleted_at IS NULL`,
      [weddingId],
    )
    const have = Number(cur.rows[0]!.c)
    for (let i = have; i < FREE_GUEST_LIMIT; i++) {
      await createGuest({ weddingId, userId, input: { name: `Dolu ${i}` } }, store)
    }

    await expect(
      createGuest({ weddingId, userId, input: { name: 'Fazla' } }, store),
    ).rejects.toThrow(GuestLimitError)

    await expect(
      createGuestsBulk(
        { weddingId, userId, inputs: [{ name: 'B1' }, { name: 'B2' }] },
        store,
      ),
    ).rejects.toThrow(GuestLimitError)

    const after = await pg.query<{ c: string }>(
      `SELECT COUNT(*)::text c FROM guests WHERE wedding_id=$1 AND deleted_at IS NULL`,
      [weddingId],
    )
    expect(Number(after.rows[0]!.c)).toBe(FREE_GUEST_LIMIT)
  }, 90_000)
})
