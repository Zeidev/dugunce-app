/**
 * Kişi sayısı ayarları — GERÇEK HTTP + DB, uçtan uca.
 *
 * NEDEN BU TEST:
 * Ayar üç katmandan geçiyor: `PATCH /weddings/:id` (yazma), davetli
 * üretimi (`allowed_party_size`), ve `GET /invitations/:token` (davetliye
 * gösterilen beyaz liste). Her katman kendi birim testinde doğru
 * görünebilir ama bağlantı kopuk olabilir — `allowed_party_size`
 * hatasında tam olarak bu olmuştu: alan vardı, kimse yazmıyordu.
 *
 * Bu dosya gerçek gövdeyle istek atar ve veritabanına gerçekten
 * yazıldığını, davetiye yanıtına gerçekten yansıdığını doğrular.
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
import { signAccessToken } from '../../src/auth/tokens.js'
import { drizzleWeddingDeps } from '../../src/weddings/store.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'
import { drizzleAuthDeps, drizzleMembershipDeps } from '../../src/auth/auth-store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')
const SECRET = process.env['JWT_SECRET'] as string

let pg: PGlite
let app: ReturnType<typeof createApp>
let weddingId: string
let userId: string
let token: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, { schema })
  const weddingStore = drizzleWeddingDeps(
    db as unknown as Parameters<typeof drizzleWeddingDeps>[0],
  )
  const authDeps = drizzleAuthDeps(SECRET, db as unknown as Parameters<typeof drizzleAuthDeps>[1])
  const membershipDeps = drizzleMembershipDeps(
    db as unknown as Parameters<typeof drizzleMembershipDeps>[0],
  )

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('ps@test.local','P') RETURNING id`,
  )
  userId = u.rows[0]!.id

  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('P & S','2026-09-12T19:00:00Z') RETURNING id`,
  )
  weddingId = w.rows[0]!.id

  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )

  token = signAccessToken({ userId }, SECRET)
  const guestStore = drizzleGuestDeps(db as unknown as Parameters<typeof drizzleGuestDeps>[0])
  app = createApp({ weddingStore, membershipDeps, authDeps, guestStore })
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

const patchWedding = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/api/v1/weddings/${weddingId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)

/** Yeni davetli + davetiye üret, ham token'ı döndür. */
async function makeInvitation(name: string, allowedPartySize: number): Promise<string> {
  const g = await request(app)
    .post(`/api/v1/weddings/${weddingId}/guests`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, side: 'BRIDE' })
  const guestId = g.body.guest.id as string

  const inv = await request(app)
    .post(`/api/v1/weddings/${weddingId}/guests/${guestId}/invitation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ allowedPartySize })
  return inv.body.invitation.token as string
}

describe('PATCH /weddings/:id — kisi sayisi ayarlari', () => {
  it('uc alan kaydedilir ve liste yanitinda gorunur', async () => {
    const res = await patchWedding({
      partySizeEnabled: false,
      defaultPartySize: 3,
      maxPartySize: 6,
    })
    expect(res.status).toBe(200)
    expect(res.body.wedding).toMatchObject({
      partySizeEnabled: false,
      defaultPartySize: 3,
      maxPartySize: 6,
    })

    const list = await request(app)
      .get('/api/v1/weddings')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.weddings[0]).toMatchObject({
      partySizeEnabled: false,
      defaultPartySize: 3,
      maxPartySize: 6,
    })
  })

  it('tutarsiz deger 400 doner ve DB degismez', async () => {
    await patchWedding({ defaultPartySize: 2, maxPartySize: 10 })

    const bad = await patchWedding({ defaultPartySize: 8, maxPartySize: 4 })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('PARTY_SIZE_INCONSISTENT')

    const after = await request(app)
      .get('/api/v1/weddings')
      .set('Authorization', `Bearer ${token}`)
    expect(after.body.weddings[0]).toMatchObject({ defaultPartySize: 2, maxPartySize: 10 })
  })

  it('ozellik kapaliyken davetiye yaniti dogru alanlari verir ve RSVP calisir', async () => {
    await patchWedding({
      partySizeEnabled: false,
      defaultPartySize: 2,
      maxPartySize: 10,
    })

    const rawToken = await makeInvitation('Ayşe', 8)

    const pub = await request(app).get(`/api/v1/invitations/${rawToken}`)
    expect(pub.status).toBe(200)
    expect(pub.body.invitation).toMatchObject({
      partySizeEnabled: false,
      defaultPartySize: 2,
      maxPartySize: 10,
      allowedPartySize: 8,
    })

    // Özellik kapalı: partySize GÖNDERMEDEN "Geliyorum" çalışmalı.
    const rsvp = await request(app)
      .post(`/api/v1/invitations/${rawToken}/rsvp`)
      .send({ rsvp: 'ATTENDING' })
    expect(rsvp.status).toBe(200)
    // Yanıt şekli `{ rsvp: {...} }` (routes/invitations.ts).
    expect(rsvp.body.rsvp.confirmedPartySize).toBe(1)
  })

  it('azami dusurulunce eski genis izinli davetiye de iner', async () => {
    await patchWedding({ defaultPartySize: 2, maxPartySize: 10 })
    const rawToken = await makeInvitation('Mehmet', 10)

    await patchWedding({ defaultPartySize: 2, maxPartySize: 4 })

    const pub = await request(app).get(`/api/v1/invitations/${rawToken}`)
    expect(pub.body.invitation.allowedPartySize).toBe(4)
  })

  it('ozellik acikken kişi sayisi zorunlu kalir', async () => {
    await patchWedding({ partySizeEnabled: true, defaultPartySize: 2, maxPartySize: 10 })
    const rawToken = await makeInvitation('Zeynep', 4)

    const rsvp = await request(app)
      .post(`/api/v1/invitations/${rawToken}/rsvp`)
      .send({ rsvp: 'ATTENDING' })
    expect(rsvp.status).toBe(422)
  })
})
