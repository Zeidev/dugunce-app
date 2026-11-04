/**
 * Davet kodu akışı — GİRİŞSİZ denemede 401, girişten sonra başarı.
 *
 * BİLDİRİLEN HATA: "Davet kodu ile giriş yapılamıyor." Kullanıcı giriş
 * ekranında kodu giriyor, 401 alıyor ve "Oturumunuz sona erdi" çıkıyor.
 *
 * Bu test sunucu tarafındaki gerçeği kilitler: uç GİRİŞ İSTER. İstemci
 * bunu bilmeli ve kodu saklayıp önce giriş yaptırmalı.
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
import { drizzleAuthDeps, drizzleMembershipDeps } from '../../src/auth/auth-store.js'
import { drizzleInviteDeps } from '../../src/auth/invite-store.js'
import { drizzleGuestDeps } from '../../src/guests/store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')
const SECRET = process.env['JWT_SECRET'] as string

let pg: PGlite
let app: ReturnType<typeof createApp>
let ownerId: string
let joinerId: string
let weddingId: string
let ownerToken: string
let joinerToken: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
  const db = drizzle(pg, { schema })
  const o = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('o@t.local','O') RETURNING id`,
  )
  ownerId = o.rows[0]!.id
  const j = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('j@t.local','J') RETURNING id`,
  )
  joinerId = j.rows[0]!.id
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & B','2026-09-12') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, ownerId],
  )
  ownerToken = signAccessToken({ userId: ownerId }, SECRET)
  joinerToken = signAccessToken({ userId: joinerId }, SECRET)

  app = createApp({
    weddingStore: drizzleWeddingDeps(db as never),
    membershipDeps: drizzleMembershipDeps(db as never),
    authDeps: drizzleAuthDeps(SECRET, db as never),
    guestStore: drizzleGuestDeps(db as never),
    inviteStore: drizzleInviteDeps(db as never),
  })
}, 120_000)

afterAll(async () => { await pg?.close() })

describe('davet kodu — giris zorunlu', () => {
  it('GIRISSIZ davet kodu 401 doner (istemci bunu bilmeli)', async () => {
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .send({ code: 'ABC2345' })
    expect(res.status).toBe(401)
  })

  it('giris yapilinca ayni kod basariyla uygulanir', { timeout: 60_000 }, async () => {
    const created = await request(app)
      .post(`/api/v1/weddings/${weddingId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'CO_OWNER' })
    expect(created.status).toBe(201)
    const code = created.body.code as string

    // Girişsiz deneme → 401
    const anon = await request(app).post('/api/v1/invites/accept').send({ code })
    expect(anon.status).toBe(401)

    // Girişli deneme → başarı (kod hâlâ geçerli, 401 onu tüketmedi)
    const authed = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ code })
    expect(authed.status).toBe(200)
    expect(authed.body.ok).toBe(true)
    expect(authed.body.weddingId).toBe(weddingId)
  })
})
