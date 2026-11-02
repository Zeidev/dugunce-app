/**
 * GET YAN ETKİ YARATMAZ (Review Focus #3) — GERÇEK HTTP + GERÇEK DB.
 *
 * Neden ayrı ve bu kadar ısrarcı bir test:
 * WhatsApp bir link gönderdiğinde önizleme botu linki `GET` ile çeker.
 * Eğer `GET` RSVP yazsaydı, davetli hiçbir şeye tıklamadan "geliyorum"
 * olarak işaretlenirdi. Bu sessiz, fark edilmesi zor ve geri alınması
 * zor bir veri bozulmasıdır.
 *
 * Bu yüzden GET'in DB'de HİÇBİR şey değiştirmediği satır satır doğrulanır.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { createApp } from '../../src/app.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { createGuest } from '../../src/guests/service.js'
import { createInvitation } from '../../src/guests/invitation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let store: ReturnType<typeof drizzleGuestDeps>
let app: ReturnType<typeof createApp>
let token: string
let guestId: string
let weddingId: string
let userId: string

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

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('se@test.local','S') RETURNING id`,
  )
  userId = u.rows[0]!.id
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('S & S','2026-09-12T19:00:00Z') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )

  const g = await createGuest(
    { weddingId, userId, input: { name: 'Yan Etki Testi' } },
    store,
  )
  guestId = g.id

  const inv = await createInvitation(
    { weddingId, userId, guestId, allowedPartySize: 3 },
    store,
  )
  token = inv!.token

  app = createApp({ guestStore: store })
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

interface Snapshot {
  rsvp: string
  invite_status: string
  confirmed_party_size: number | null
  rsvp_source: string | null
  rsvp_at: string | null
  revoked_at: string | null
}

/** Davetli + davetiye satırının TAM durumu. */
async function snapshot(): Promise<Snapshot> {
  const r = await pg.query<Snapshot>(
    `SELECT g.rsvp, g.invite_status, i.confirmed_party_size,
            i.rsvp_source, i.rsvp_at::text, i.revoked_at::text
       FROM guests g
       JOIN guest_invitations i ON i.guest_id = g.id
      WHERE g.id = $1
      ORDER BY i.created_at DESC
      LIMIT 1`,
    [guestId],
  )
  return r.rows[0]!
}

describe('GET /invitations/:token yan etki yaratmaz (Review Focus #3)', () => {
  it('GET RSVP durumunu DEĞİŞTİRMEZ', async () => {
    const before = await snapshot()

    const res = await request(app).get(`/api/v1/invitations/${token}`)
    expect(res.status).toBe(200)

    const after = await snapshot()
    expect(after).toEqual(before)
  })

  it('GET rsvp_at yazmaz (null kalır)', async () => {
    const res = await request(app).get(`/api/v1/invitations/${token}`)
    expect(res.status).toBe(200)

    const snap = await snapshot()
    expect(snap.rsvp_at).toBeNull()
    expect(snap.rsvp_source).toBeNull()
    expect(snap.confirmed_party_size).toBeNull()
  })

  it('GET invite_status\'u SENT yapmaz', async () => {
    const before = await snapshot()
    expect(before.invite_status).toBe('NOT_SENT')

    await request(app).get(`/api/v1/invitations/${token}`)

    const after = await snapshot()
    expect(after.invite_status).toBe('NOT_SENT')
  })

  it('aynı GET 10 kez → durum AYNI kalır', async () => {
    const before = await snapshot()

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get(`/api/v1/invitations/${token}`)
      expect(res.status).toBe(200)
    }

    const after = await snapshot()
    expect(after).toEqual(before)
  })

  it('GET davetli adını döner ama yazmaz', async () => {
    const res = await request(app).get(`/api/v1/invitations/${token}`)
    expect(res.body.invitation.guestName).toBe('Yan Etki Testi')
    expect(res.body.invitation.rsvp).toBe('PENDING')
  })

  it('GET yanıtı Cache-Control: no-store taşır', async () => {
    const res = await request(app).get(`/api/v1/invitations/${token}`)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('POST ise RSVP\'yi DEĞİŞTİRİR (kontrol grubu)', async () => {
    // Bu test, GET testlerinin anlamlı olduğunu kanıtlar: aynı uç nokta
    // POST ile gerçekten yazıyor. GET testleri bu yüzden "hiçbir şey
    // değişmiyor" diyebiliyor.
    const before = await snapshot()
    expect(before.rsvp).toBe('PENDING')

    const res = await request(app)
      .post(`/api/v1/invitations/${token}/rsvp`)
      .send({ rsvp: 'ATTENDING', partySize: 2 })
    expect(res.status).toBe(200)

    const after = await snapshot()
    expect(after.rsvp).toBe('ATTENDING')
    expect(after.confirmed_party_size).toBe(2)
    expect(after.rsvp_source).toBe('GUEST')
    expect(after.rsvp_at).not.toBeNull()
  })

  it('POST sonrası GET hâlâ yazmıyor', async () => {
    const before = await snapshot()
    expect(before.rsvp).toBe('ATTENDING')

    await request(app).get(`/api/v1/invitations/${token}`)

    const after = await snapshot()
    expect(after).toEqual(before)
  })
})
