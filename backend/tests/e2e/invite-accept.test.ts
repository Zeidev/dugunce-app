/**
 * POST /invites/accept — GERÇEK HTTP, gerçek token, gerçek DB.
 *
 * NEDEN BU TEST:
 * Kullanıcı bildirdi: "Ortak ekleme alanında oluşturulan kodu karşı taraf
 * 'davet kodum var' ile girildiğinde 'oturum sonlandırıldı lütfen giriş
 * yapın' uyarısı geliyor."
 *
 * Servis katmanı testleri (`tests/auth/invite.test.ts`) vardı ama
 * ROUTE seviyesinde yalnız "token yoksa 401" deneniyordu. Aradaki bağ
 * — geçerli token + geçerli kod → üyelik — hiç uçtan uca sınanmamıştı.
 * Bu dosya o boşluğu kapatır.
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
  const weddingStore = drizzleWeddingDeps(db as never)
  const authDeps = drizzleAuthDeps(SECRET, db as never)
  const membershipDeps = drizzleMembershipDeps(db as never)
  const guestStore = (await import('../../src/guests/store.js')).drizzleGuestDeps(db as never)

  const o = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('owner@t.local','O') RETURNING id`,
  )
  ownerId = o.rows[0]!.id
  const j = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('joiner@t.local','J') RETURNING id`,
  )
  joinerId = j.rows[0]!.id

  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & B','2026-09-12T19:00:00Z') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, ownerId],
  )

  ownerToken = signAccessToken({ userId: ownerId }, SECRET)
  joinerToken = signAccessToken({ userId: joinerId }, SECRET)
  const inviteStore = (await import('../../src/auth/invite-store.js')).drizzleInviteDeps(db as never)
  app = createApp({ weddingStore, membershipDeps, authDeps, guestStore, inviteStore })
}, 120_000)

afterAll(async () => {
  await pg?.close()
})

describe('POST /invites/accept — uctan uca', () => {
  it('gecerli kod ile katilma BASARILI olur (401 DEGIL)', { timeout: 60_000 }, async () => {
    // 1. Sahibi kod üretir
    const created = await request(app)
      .post(`/api/v1/weddings/${weddingId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'CO_OWNER' })
    expect(created.status).toBe(201)
    // Yanıt şekli: { code, expiresAt, expiresInMinutes }
    const code = created.body.code as string
    expect(code).toHaveLength(7)

    // 2. Diğer kullanıcı kodu kabul eder — GEÇERLİ token ile.
    //    Bildirilen hata: burada 401 alınıyordu.
    const accepted = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ code })
    expect(accepted.status).toBe(200)
    expect(accepted.body.ok).toBe(true)
    expect(accepted.body.weddingId).toBe(weddingId)
    expect(accepted.body.role).toBe('CO_OWNER')

    // 3. Üyelik gerçekten yazıldı mı?
    const member = await pg.query<{ role: string }>(
      `SELECT role FROM wedding_members WHERE wedding_id=$1 AND user_id=$2`,
      [weddingId, joinerId],
    )
    expect(member.rows[0]?.role).toBe('CO_OWNER')
  })

  it('ayni kod ikinci kez kullanilamaz', { timeout: 60_000 }, async () => {
    const created = await request(app)
      .post(`/api/v1/weddings/${weddingId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'CO_OWNER' })
    const code = created.body.code as string

    const third = await pg.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ('third@t.local','T') RETURNING id`,
    )
    const thirdToken = signAccessToken({ userId: third.rows[0]!.id }, SECRET)

    await request(app).post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${thirdToken}`).send({ code })

    const fourth = await pg.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ('fourth@t.local','F') RETURNING id`,
    )
    const fourthToken = signAccessToken({ userId: fourth.rows[0]!.id }, SECRET)

    const again = await request(app).post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${fourthToken}`).send({ code })
    expect(again.status).toBeGreaterThanOrEqual(400)
    expect(again.status).not.toBe(401)
  })

  it('gecersiz kod 401 DEGIL, anlamli hata doner', async () => {
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ code: 'ZZZZZZZ' })
    // Oturum geçerli — 401 dönmek istemciyi yanlışlıkla çıkışa atar.
    expect(res.status).not.toBe(401)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('kod eksikse 400 doner, 401 degil', async () => {
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({})
    expect(res.status).toBe(400)
  })
})
