/**
 * PATCH /weddings/:id — TÜM şablon × font çiftleri, gerçek HTTP + DB.
 *
 * NEDEN BU TEST:
 * Kullanıcı mobilde "Davetiye görünümü" ekranında seçenek değiştirip
 * "Kaydet"e bastığında "beklenmeyen bir hata oluştu" görüyor. Tek tek
 * çift denemek yerine 11 şablonun ve 10 fontun TAMAMINI, ayrıca
 * aralarındaki tüm kombinasyonları dener.
 *
 * Ayrıca YANIT GÖVDESİNİN ŞEKLİNİ doğrular: mobil `{ wedding: {...} }`
 * bekliyor ve içinde `template`/`fontKey` olmalı. Alan adı değişirse
 * istemci parse edemez ve "beklenmeyen hata" gösterir.
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
import { TEMPLATES, FONTS } from '../../src/weddings/templates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIG = join(__dirname, '../../src/db/migrations')
const SECRET = process.env['JWT_SECRET'] as string

let pg: PGlite
let app: ReturnType<typeof createApp>
let weddingId: string
let token: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, { schema })
  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('combo@test.local','C') RETURNING id`,
  )
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan) VALUES ('C & C','2026-09-12T19:00:00Z','PREMIUM') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, u.rows[0]!.id],
  )
  token = signAccessToken({ userId: u.rows[0]!.id }, SECRET)

  app = createApp({
    weddingStore: drizzleWeddingDeps(db as unknown as Parameters<typeof drizzleWeddingDeps>[0]),
    authDeps: drizzleAuthDeps(SECRET, db as unknown as Parameters<typeof drizzleAuthDeps>[1]),
    membershipDeps: drizzleMembershipDeps(
      db as unknown as Parameters<typeof drizzleMembershipDeps>[0],
    ),
  })
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

const patch = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/api/v1/weddings/${weddingId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)

describe('PATCH /weddings/:id — tüm şablon × font çiftleri', () => {
  it('11 şablonun HEPSİ × 10 fontun HEPSİ kaydedilebilir (110 çift)', async () => {
    const failures: string[] = []

    for (const template of TEMPLATES) {
      for (const fontKey of FONTS) {
        const res = await patch({ template, fontKey })
        if (res.status !== 200) {
          failures.push(`${template}/${fontKey} → ${res.status} ${JSON.stringify(res.body)}`)
          continue
        }
        // Yanıt gerçekten yazılanı yansıtıyor mu?
        if (res.body?.wedding?.template !== template || res.body?.wedding?.fontKey !== fontKey) {
          failures.push(
            `${template}/${fontKey} → yanıt uyuşmuyor: ` +
              `template=${res.body?.wedding?.template} fontKey=${res.body?.wedding?.fontKey}`,
          )
        }
      }
    }

    expect(failures, `${failures.length} çift başarısız:\n${failures.join('\n')}`).toEqual([])
  })

  it('yanıt gövdesi mobilin beklediği şekilde', async () => {
    const res = await patch({ template: 'LUKS', fontKey: 'BODONI' })
    expect(res.status).toBe(200)

    // Mobil `WeddingResponse` = { wedding: WeddingDto }
    expect(res.body).toHaveProperty('wedding')
    const w = res.body.wedding

    // Mobilin okuduğu alanlar mevcut olmalı
    for (const key of ['id', 'coupleNames', 'template', 'fontKey']) {
      expect(w, `yanıtta "${key}" yok`).toHaveProperty(key)
    }
    // tip kontrolü — mobil String bekliyor
    expect(typeof w.template).toBe('string')
    expect(typeof w.fontKey).toBe('string')
  })

  it('template ve fontKey BAĞIMSIZ kaydedilir', async () => {
    // Yalnız şablon
    const r1 = await patch({ template: 'MINIMAL' })
    expect(r1.status).toBe(200)
    expect(r1.body.wedding.template).toBe('MINIMAL')

    // Yalnız font — şablon korunmalı
    const r2 = await patch({ fontKey: 'ALLURA' })
    expect(r2.status).toBe(200)
    expect(r2.body.wedding.fontKey).toBe('ALLURA')
    expect(r2.body.wedding.template).toBe('MINIMAL')
  })

  it('boş fontKey, template ile birlikte gönderilince kabul edilir', async () => {
    // Mobil `WeddingDto.fontKey` varsayılanı `""`. İstemci bunu template
    // ile birlikte geri gönderebiliyor; 400 OLMAMALI.
    const res = await patch({ template: 'ROMANTIK', fontKey: '' })
    expect(res.status).toBe(200)
    expect(res.body.wedding.template).toBe('ROMANTIK')
  })

  it('YALNIZ boş fontKey gönderilirse 400 EMPTY_PATCH (değişecek alan yok)', async () => {
    // Boş fontKey "önerileni kullan" demek → alan atılır → güncellenecek
    // bir şey kalmaz. 500 DEĞİL, anlamlı 400 dönmeli.
    const res = await patch({ fontKey: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('EMPTY_PATCH')
  })

  it('geçersiz değer 400 + alan detayı döner (mobil mesajı gösterebilsin)', async () => {
    const res = await patch({ template: 'YOKSUL' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    // Mobil bu yapıyı parse edebilmeli
    expect(Array.isArray(res.body.error.details.fields)).toBe(true)
    expect(res.body.error.details.fields[0]).toHaveProperty('path')
    expect(res.body.error.details.fields[0]).toHaveProperty('message')
  })
})
