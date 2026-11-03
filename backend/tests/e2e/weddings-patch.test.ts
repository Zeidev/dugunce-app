/**
 * PATCH /weddings/:id — davetiye görünümü (şablon + font) GERÇEK HTTP + DB.
 *
 * NEDEN BU TEST:
 * Kullanıcı mobilde "Davetiye görünümü" ekranında seçenek değiştirip
 * "Kaydet"e bastığında hata alıyordu. Bu akış hiçbir uçtan uca testle
 * kapsanmıyordu — route seviyesinde yalnızca "token yoksa 401" vardı,
 * şema testleri ise servis katmanında kalıyordu. Aradaki bağ (gerçek
 * gövde → gerçek route → gerçek DB) kopuktu.
 *
 * Bu dosya o boşluğu kapatır: mobilin gönderdiği TAM gövdeyle istek atar
 * ve veritabanına gerçekten yazıldığını doğrular.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
  // Auth ve üyelik aramaları da PGlite'a bakmalı — aksi halde
  // `requireAuth` gerçek DB'de kullanıcıyı arar ve 500 döner.
  const authDeps = drizzleAuthDeps(SECRET, db as unknown as Parameters<typeof drizzleAuthDeps>[1])
  const membershipDeps = drizzleMembershipDeps(
    db as unknown as Parameters<typeof drizzleMembershipDeps>[0],
  )

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('tp@test.local','T') RETURNING id`,
  )
  userId = u.rows[0]!.id

  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('T & P','2026-09-12T19:00:00Z') RETURNING id`,
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

/** Veritabanındaki gerçek şablon/font. */
async function stored(): Promise<{ template: string; font_key: string }> {
  const r = await pg.query<{ template: string; font_key: string }>(
    `SELECT template, font_key FROM weddings WHERE id = $1`,
    [weddingId],
  )
  return r.rows[0]!
}

const patch = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/api/v1/weddings/${weddingId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)

describe('PATCH /weddings/:id — davetiye görünümü', () => {
  it('mobilin gönderdiği gövde şablonu ve fontu KAYDEDER', async () => {
    // `WeddingPatchRequest(template=..., fontKey=...)` ile BİREBİR aynı:
    // `explicitNulls = false` olduğu için null alanlar gövdeye hiç girmez.
    const res = await patch({ template: 'GECE', fontKey: 'BODONI' })
    expect(res.status).toBe(200)
    expect(res.body.wedding.template).toBe('GECE')
    expect(res.body.wedding.fontKey).toBe('BODONI')

    // Gerçekten yazıldı mı? (yanıt yalan söyleyebilir)
    expect(await stored()).toEqual({ template: 'GECE', font_key: 'BODONI' })
  })

  it('her geçerli şablon kaydedilebilir', async () => {
    const templates = [
      'ZARIF', 'BOTANIK', 'ROMANTIK', 'MINIMAL', 'GECE', 'ZEYTIN',
      'EDITORYAL', 'MONOGRAM', 'LUKS', 'FOTOGRAFLI', 'TIPOGRAFI',
    ]
    for (const template of templates) {
      const res = await patch({ template })
      expect(res.status, `${template} reddedildi`).toBe(200)
      expect((await stored()).template).toBe(template)
    }
  })

  it('her geçerli font kaydedilebilir', async () => {
    const fonts = [
      'PARISIENNE', 'GREAT_VIBES', 'DANCING_SCRIPT', 'ALLURA', 'SACRAMENTO',
      'PLAYFAIR', 'CORMORANT', 'DM_SERIF', 'BODONI', 'JOSEFIN',
    ]
    for (const fontKey of fonts) {
      const res = await patch({ fontKey })
      expect(res.status, `${fontKey} reddedildi`).toBe(200)
      expect((await stored()).font_key).toBe(fontKey)
    }
  })

  it('geçersiz şablon 400 + alan bilgisi döner', async () => {
    const res = await patch({ template: 'YOK' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.fields.some((f: { path: string }) => f.path === 'template')).toBe(
      true,
    )
  })

  it('geçersiz font 400 döner', async () => {
    const res = await patch({ fontKey: 'YOK' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('boş gövde 400 EMPTY_PATCH döner (500 DEĞİL)', async () => {
    const res = await patch({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('EMPTY_PATCH')
  })

  it('null alanlar yok sayılır, diğer alanlar kaydedilir', async () => {
    const res = await patch({ template: 'MINIMAL', fontKey: null, coupleNames: null })
    expect(res.status).toBe(200)
    expect((await stored()).template).toBe('MINIMAL')
  })

  it('üye olmayan kullanıcı 404 alır', async () => {
    const other = await pg.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ('other@test.local','O') RETURNING id`,
    )
    const otherToken = signAccessToken({ userId: other.rows[0]!.id }, SECRET)
    const res = await request(app)
      .patch(`/api/v1/weddings/${weddingId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ template: 'GECE' })
    expect(res.status).toBe(404)
  })

  it('davetiye genel görünümü şablonu YANSITIR', async () => {
    // Şablon kaydetmek, DAVETLİNİN gördüğü sayfayı değiştirmeli.
    // Bu, kullanıcının şikayetinin özü: "kaydettim ama davetiye değişmedi".
    await patch({ template: 'LUKS', fontKey: 'BODONI' })

    const g = await pg.query<{ id: string }>(
      `INSERT INTO guests (wedding_id, name) VALUES ($1,'Şablon Konuğu') RETURNING id`,
      [weddingId],
    )
    const rawToken = 'sablon-test-token'
    await pg.query(
      `INSERT INTO guest_invitations
         (wedding_id, guest_id, token_hash, allowed_party_size, expires_at)
       VALUES ($1,$2,$3,2, now() + interval '30 days')`,
      [weddingId, g.rows[0]!.id, createHash('sha256').update(rawToken).digest('hex')],
    )

    // Genel uç — oturum GEREKTİRMEZ; davetli sayfası bunu kullanır.
    const res = await request(app).get(`/api/v1/invitations/${rawToken}`)
    expect(res.status).toBe(200)
    expect(res.body.invitation.template).toBe('LUKS')
    expect(res.body.invitation.fontKey).toBe('BODONI')
  })
})
