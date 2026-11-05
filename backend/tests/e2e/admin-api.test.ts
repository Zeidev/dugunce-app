/**
 * Admin API — GERÇEK HTTP + GERÇEK PGlite.
 *
 * Bu dosya Task 7'nin (HTTP katmanı) sözleşmesini kilitler. Tasks 1-6
 * tabloları, parola/kilit mantığını, oturum middleware'ini, Drizzle
 * deposunu ve plan değiştirme servisini kurdu ama **hiçbiri HTTP'den
 * erişilebilir değildi**. Burada eksik olan kablo doğrulanır.
 *
 * KRİTİK SENARYOLAR (atlanırsa özellik sessizce bozulur):
 *
 * 1. `POST /auth/login` oturumu KENDİSİ açar. `loginAdmin` yalnız kimliği
 *    doğrular ve `{ admin }` döner — çerez üretmez. Route `createSession`
 *    çağırmazsa giriş 200 döner, çerez gelmez, panel açılmaz. İlk test
 *    tam olarak bunu ölçer.
 * 2. `loginAdmin` → `null` tek bir hata kodu vermeli (`INVALID_CREDENTIALS`):
 *    "e-posta yok" ile "parola yanlış" ayrılırsa hesap listesi sızar.
 * 3. `setWeddingPlan` → `null` 404; audit'i SERVİS yazar, route İKİNCİ kez
 *    yazmamalı (çift denetim kaydı).
 * 4. Servisin `INVALID_PLAN` (400) hatası genel bir hataya YUTULMAMALI.
 * 5. `limit` TAM SAYI doğrulanmalı. `limit=NaN` iken `Math.min/Math.max`
 *    NaN döndürür ve 100 satır tavanı sessizce aşılır (ölçüldü: 120).
 * 6. Her yazmada CSRF double-submit: `X-CSRF-Token` başlığı `a_csrf`
 *    çereziyle VE DB'deki `csrf_hash` ile eşleşmeli.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { createApp } from '../../src/app.js'

import { drizzleAdminPanelDeps } from '../../src/admin/panel-store.js'
import { hashPassword } from '../../src/admin/service.js'
import { signAccessToken } from '../../src/auth/tokens.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

/** Testlerde kullanılan parola — 16+ karakter, harf + rakam (Task 2 kuralı). */
const PASSWORD = 'guclu-parola-123'
const ADMIN_EMAIL = 'owner@t.local'

let pg: PGlite
let panelStore: ReturnType<typeof drizzleAdminPanelDeps>

let adminId: string
let userId: string
let weddingFreeId: string
let weddingPremiumId: string
let weddingTargetId: string

/** Kaç kullanıcı ekliyoruz — sayfalama tavanı testi 100'den fazlasını ister. */
const USER_COUNT = 120

interface Session {
  cookie: string
  csrf: string
}

/** Uygulamayı taze kurar — hız sınırı sayaçları testler arasında taşmasın. */
function makeApp(): Express {
  return createApp({ adminStore: panelStore })
}

/** Set-Cookie başlığından `Cookie` isteği ve CSRF değerini çıkarır. */
function readSession(headers: Record<string, unknown>): Session {
  const raw = (headers['set-cookie'] ?? []) as unknown as string[]
  const cookie = raw.map((c) => c.split(';')[0] ?? '').filter(Boolean).join('; ')
  const csrfPart = cookie.split('; ').find((p) => p.startsWith('a_csrf='))
  const csrf = csrfPart ? decodeURIComponent(csrfPart.slice('a_csrf='.length)) : ''
  return { cookie, csrf }
}

async function login(app: Express): Promise<Session> {
  const res = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ email: ADMIN_EMAIL, password: PASSWORD })
  expect(res.status).toBe(200)
  return readSession(res.headers as Record<string, unknown>)
}

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, { schema })
  panelStore = drizzleAdminPanelDeps(
    db as unknown as Parameters<typeof drizzleAdminPanelDeps>[0],
  )

  const hash = await hashPassword(PASSWORD)
  const admin = await pg.query<{ id: string }>(
    `INSERT INTO admin_accounts (email, password_hash, display_name)
     VALUES ($1, $2, 'Ürün Sahibi') RETURNING id`,
    [ADMIN_EMAIL, hash],
  )
  adminId = admin.rows[0]!.id

  // 120 kullanıcı: `limit=NaN` tavanı delerse liste 100'den uzun döner.
  const rows = Array.from(
    { length: USER_COUNT },
    (_, i) => `('kullanici${i}@t.local', 'Kullanıcı ${i}')`,
  ).join(', ')
  await pg.query(`INSERT INTO users (email, display_name) VALUES ${rows}`)
  const firstUser = await pg.query<{ id: string }>(
    `SELECT id FROM users ORDER BY email LIMIT 1`,
  )
  userId = firstUser.rows[0]!.id

  const free = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan)
     VALUES ('Ayşe & Mehmet', '2026-09-12T19:00:00Z', 'FREE') RETURNING id`,
  )
  weddingFreeId = free.rows[0]!.id

  const premium = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan)
     VALUES ('Zeynep & Can', '2026-10-03T18:00:00Z', 'PREMIUM') RETURNING id`,
  )
  weddingPremiumId = premium.rows[0]!.id

  const target = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan)
     VALUES ('Elif & Burak', '2026-11-20T17:00:00Z', 'FREE') RETURNING id`,
  )
  weddingTargetId = target.rows[0]!.id

  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
    [weddingFreeId, userId],
  )
  await pg.query(
    `INSERT INTO guests (wedding_id, name, rsvp) VALUES ($1, 'Davetli Bir', 'ATTENDING')`,
    [weddingFreeId],
  )
}, 120_000)

afterAll(async () => {
  await pg?.close()
})

// ---------------------------------------------------------------------------
// 1. Giriş — oturumu ROUTE açar
// ---------------------------------------------------------------------------

describe('POST /admin/auth/login', () => {
  it('doğru parola oturum + CSRF çerezi verir', async () => {
    const app = makeApp()
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD })

    expect(res.status).toBe(200)

    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[]
    const session = cookies.find((c) => c.startsWith('a_session='))
    const csrf = cookies.find((c) => c.startsWith('a_csrf='))

    // Çerez ÜRETİLMEZSE panel kullanılamaz — asıl kritik nokta bu.
    expect(session).toBeDefined()
    expect(csrf).toBeDefined()
    // Oturum çerezi JS'e kapalı, CSRF çerezi JS'e AÇIK olmalı (double-submit).
    expect(session).toContain('HttpOnly')
    expect(csrf).not.toContain('HttpOnly')

    // Gövde: yalnız beyaz liste admin. Ham token GÖVDEDE ASLA.
    expect(res.body.admin.email).toBe(ADMIN_EMAIL)
    expect(res.body.admin.id).toBe(adminId)
    expect(JSON.stringify(res.body)).not.toContain('argon2')
    expect(res.body).not.toHaveProperty('token')
    expect(res.body).not.toHaveProperty('session')
  })

  it('yanlış parola 401 INVALID_CREDENTIALS', async () => {
    const res = await request(makeApp())
      .post('/api/v1/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'yanlis-parola-123' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('OLMAYAN e-posta AYNI kodu verir (hesap listesi sızmaz)', async () => {
    const res = await request(makeApp())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'yok@t.local', password: PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('askıya alınmış hesap 403 ACCOUNT_SUSPENDED', async () => {
    await pg.query(`UPDATE admin_accounts SET status = 'SUSPENDED' WHERE id = $1`, [adminId])
    try {
      const res = await request(makeApp())
        .post('/api/v1/admin/auth/login')
        .send({ email: ADMIN_EMAIL, password: PASSWORD })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED')
    } finally {
      await pg.query(`UPDATE admin_accounts SET status = 'ACTIVE' WHERE id = $1`, [adminId])
    }
  })

  it('e-posta/parola yoksa 400 (doğrulama hatası)', async () => {
    const res = await request(makeApp()).post('/api/v1/admin/auth/login').send({})
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// 2. Oturum kapısı
// ---------------------------------------------------------------------------

describe('oturum kapısı', () => {
  it('çerez YOKSA 401', async () => {
    const res = await request(makeApp()).get('/api/v1/admin/overview')
    expect(res.status).toBe(401)
  })

  it('KULLANICI bearer token ı admin oturumu AÇMAZ', async () => {
    const token = signAccessToken(
      { userId },
      process.env['JWT_SECRET'] ?? 'test-only-secret-that-is-at-least-32-chars-long',
    )
    const res = await request(makeApp())
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('uydurma çerez 401 (500 değil)', async () => {
    const res = await request(makeApp())
      .get('/api/v1/admin/overview')
      .set('Cookie', 'a_session=uydurma-token')
    expect(res.status).toBe(401)
  })

  it('giriş sonrası overview sayaçları döner', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app).get('/api/v1/admin/overview').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      users: { total: expect.any(Number), newLast7Days: expect.any(Number) },
      weddings: {
        total: expect.any(Number),
        active: expect.any(Number),
        premium: expect.any(Number),
        free: expect.any(Number),
      },
      guests: {
        total: expect.any(Number),
        attending: expect.any(Number),
        declined: expect.any(Number),
        pending: expect.any(Number),
      },
    })
    expect(res.body.users.total).toBeGreaterThanOrEqual(USER_COUNT)
    expect(res.body.weddings.total).toBe(3)
    expect(res.body.weddings.premium).toBe(1)
    expect(Array.isArray(res.body.recentAudit)).toBe(true)
    // Son 20 denetim kaydı — giriş kaydı burada görünmeli.
    expect(res.body.recentAudit.length).toBeGreaterThan(0)
    expect(res.body.recentAudit.length).toBeLessThanOrEqual(20)
  })

  it('GET /auth/me oturumdaki admini döner', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app).get('/api/v1/admin/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.admin.email).toBe(ADMIN_EMAIL)
    expect(JSON.stringify(res.body)).not.toContain('argon2')
  })

  it('POST /auth/logout çerezleri temizler ve oturumu öldürür', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)

    const out = await request(app)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
    expect(out.status).toBe(204)

    const cleared = (out.headers['set-cookie'] ?? []) as unknown as string[]
    expect(cleared.some((c) => c.startsWith('a_session=') && c.includes('Max-Age=0'))).toBe(true)

    const me = await request(app).get('/api/v1/admin/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 3. Plan değiştirme — servis + audit + CSRF
// ---------------------------------------------------------------------------

describe('PATCH /admin/weddings/:id/plan', () => {
  it('PREMIUM yapar, audit i SERVİS yazar (route ikinci kez yazmaz)', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)

    await pg.query(`DELETE FROM audit_logs WHERE action = 'WEDDING_PLAN_CHANGED'`)

    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingTargetId}/plan`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ plan: 'PREMIUM' })

    expect(res.status).toBe(200)
    expect(res.body.wedding.plan).toBe('PREMIUM')
    // `purchaseToken` / `purchasePlatform` beyaz listede YOK.
    expect(JSON.stringify(res.body)).not.toContain('purchaseToken')

    const row = await pg.query<{ plan: string; purchase_platform: string | null }>(
      `SELECT plan, purchase_platform FROM weddings WHERE id = $1`,
      [weddingTargetId],
    )
    expect(row.rows[0]!.plan).toBe('PREMIUM')
    expect(row.rows[0]!.purchase_platform).toBe('ADMIN')

    // ÇİFT KAYIT TESTİ: route kendi audit'ini yazsaydı 2 satır olurdu.
    const audit = await pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_logs WHERE action = 'WEDDING_PLAN_CHANGED'`,
    )
    expect(Number(audit.rows[0]!.c)).toBe(1)
  })

  it('CSRF başlığı YOKSA 403 ve plan değişmez', async () => {
    const app = makeApp()
    const { cookie } = await login(app)

    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingFreeId}/plan`)
      .set('Cookie', cookie)
      .send({ plan: 'PREMIUM' })

    expect(res.status).toBe(403)
    const row = await pg.query<{ plan: string }>(
      `SELECT plan FROM weddings WHERE id = $1`,
      [weddingFreeId],
    )
    expect(row.rows[0]!.plan).toBe('FREE')
  })

  it('CSRF başlığı çerezle UYUŞMAZSA 403', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingFreeId}/plan`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', 'baska-bir-deger')
      .send({ plan: 'PREMIUM' })
    expect(res.status).toBe(403)
  })

  it('geçersiz plan 400 INVALID_PLAN (genel hataya yutulmaz)', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)
    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingFreeId}/plan`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ plan: 'VIP' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PLAN')
  })

  it('olmayan düğün 404', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)
    const res = await request(app)
      .patch('/api/v1/admin/weddings/00000000-0000-0000-0000-0000000000ff/plan')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ plan: 'PREMIUM' })
    expect(res.status).toBe(404)
  })

  it('plan=FREE geri alma: purchasedAt temizlenir', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)
    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingPremiumId}/plan`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ plan: 'FREE' })
    expect(res.status).toBe(200)
    expect(res.body.wedding.plan).toBe('FREE')
    const row = await pg.query<{ purchased_at: string | null }>(
      `SELECT purchased_at FROM weddings WHERE id = $1`,
      [weddingPremiumId],
    )
    expect(row.rows[0]!.purchased_at).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Sayfalama — limit TAM SAYI olmalı
// ---------------------------------------------------------------------------

describe('GET /admin/users — sayfalama', () => {
  it('varsayılan sayfa 50 kayıt döner', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app).get('/api/v1/admin/users').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(50)
    expect(typeof res.body.nextCursor).toBe('string')
  })

  it('limit=100 tavanı aşılmaz', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/users?limit=1000')
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeLessThanOrEqual(100)
    expect(res.body.items).toHaveLength(100)
  })

  it('limit=NaN 400 (NaN tavanı sessizce delerdi)', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app).get('/api/v1/admin/users?limit=NaN').set('Cookie', cookie)
    expect(res.status).toBe(400)
  })

  it('limit=2.5 400 (Postgres hatası değil, doğrulama hatası)', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app).get('/api/v1/admin/users?limit=2.5').set('Cookie', cookie)
    expect(res.status).toBe(400)
  })

  it('limit=0 400', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app).get('/api/v1/admin/users?limit=0').set('Cookie', cookie)
    expect(res.status).toBe(400)
  })

  it('cursor ile ikinci sayfa gelir, kayıt tekrar etmez', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const first = await request(app)
      .get('/api/v1/admin/users?limit=10')
      .set('Cookie', cookie)
    expect(first.status).toBe(200)
    const cursor = String(first.body.nextCursor)
    const second = await request(app)
      .get(`/api/v1/admin/users?limit=10&cursor=${cursor}`)
      .set('Cookie', cookie)
    expect(second.status).toBe(200)
    const firstIds = (first.body.items as { id: string }[]).map((i) => i.id)
    const secondIds = (second.body.items as { id: string }[]).map((i) => i.id)
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false)
  })

  it('q araması e-posta üzerinde çalışır', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/users?q=kullanici7%40t.local')
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThan(0)
    for (const item of res.body.items as { email: string }[]) {
      expect(item.email).toContain('kullanici7@t.local')
    }
  })

  it('kullanıcı detayı düğünleriyle döner', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get(`/api/v1/admin/users/${userId}`)
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(userId)
    expect(res.body.user.weddingCount).toBe(1)
    expect(res.body.weddings).toHaveLength(1)
    expect(res.body.weddings[0].id).toBe(weddingFreeId)
  })

  it('olmayan kullanıcı 404', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/users/00000000-0000-0000-0000-0000000000ff')
      .set('Cookie', cookie)
    expect(res.status).toBe(404)
  })

  it('PATCH kullanıcı durumu SUSPENDED yapar ve audit yazar', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)
    const res = await request(app)
      .patch(`/api/v1/admin/users/${userId}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'SUSPENDED' })
    expect(res.status).toBe(200)
    expect(res.body.user.status).toBe('SUSPENDED')

    const audit = await pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_logs
       WHERE action = 'USER_SUSPENDED' AND target_id = $1`,
      [userId],
    )
    expect(Number(audit.rows[0]!.c)).toBe(1)

    await pg.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [userId])
  })

  it('PATCH kullanıcı — CSRF yoksa 403', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .patch(`/api/v1/admin/users/${userId}`)
      .set('Cookie', cookie)
      .send({ status: 'SUSPENDED' })
    expect(res.status).toBe(403)
  })

  it('PATCH kullanıcı — geçersiz durum 400', async () => {
    const app = makeApp()
    const { cookie, csrf } = await login(app)
    const res = await request(app)
      .patch(`/api/v1/admin/users/${userId}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'SİLİNDİ' })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// 5. Düğünler ve denetim listesi
// ---------------------------------------------------------------------------

describe('GET /admin/weddings', () => {
  it('plan filtresi çalışır', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/weddings?plan=PREMIUM')
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    for (const w of res.body.items as { plan: string }[]) {
      expect(w.plan).toBe('PREMIUM')
    }
  })

  it('geçersiz plan filtresi 400', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/weddings?plan=VIP')
      .set('Cookie', cookie)
    expect(res.status).toBe(400)
  })

  it('düğün detayı döner, olmayan düğün 404', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const ok = await request(app)
      .get(`/api/v1/admin/weddings/${weddingFreeId}`)
      .set('Cookie', cookie)
    expect(ok.status).toBe(200)
    expect(ok.body.wedding.guestCount).toBe(1)

    const missing = await request(app)
      .get('/api/v1/admin/weddings/00000000-0000-0000-0000-0000000000ff')
      .set('Cookie', cookie)
    expect(missing.status).toBe(404)
  })
})

describe('GET /admin/audit-logs', () => {
  it('kayıtları ve nextCursor alanını döner', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?limit=5')
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items.length).toBeGreaterThan(0)
    expect(res.body).toHaveProperty('nextCursor')
  })

  it('action filtresi uygular', async () => {
    const app = makeApp()
    const { cookie } = await login(app)
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?action=ADMIN_LOGIN')
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    for (const item of res.body.items as { action: string }[]) {
      expect(item.action).toBe('ADMIN_LOGIN')
    }
  })
})

// ---------------------------------------------------------------------------
// 6. CORS — SPA farklı origin'de
// ---------------------------------------------------------------------------

describe('CORS', () => {
  it('izinli origin yansıtılır, credentials true', async () => {
    const res = await request(makeApp())
      .get('/api/v1/admin/overview')
      .set('Origin', 'https://dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('www ve localhost da izinli', async () => {
    for (const origin of ['https://www.dugunce.com.tr', 'http://localhost:5173']) {
      const res = await request(makeApp())
        .get('/api/v1/admin/overview')
        .set('Origin', origin)
      expect(res.headers['access-control-allow-origin']).toBe(origin)
    }
  })

  it('yabancı origin YANSITILMAZ', async () => {
    const res = await request(makeApp())
      .get('/api/v1/admin/overview')
      .set('Origin', 'https://kotu-site.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('wildcard KULLANILMAZ', async () => {
    const res = await request(makeApp())
      .get('/api/v1/admin/overview')
      .set('Origin', 'https://dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).not.toBe('*')
  })

  it('preflight X-CSRF-Token başlığına izin verir', async () => {
    const res = await request(makeApp())
      .options('/api/v1/admin/weddings/00000000-0000-0000-0000-0000000000ff/plan')
      .set('Origin', 'https://dugunce.com.tr')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
    expect([200, 204]).toContain(res.status)
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'x-csrf-token',
    )
    expect(String(res.headers['access-control-allow-methods'])).toContain('PATCH')
  })

  it('Vary: Origin taşır (cache zehirlenmesi önlemi)', async () => {
    const res = await request(makeApp())
      .get('/api/v1/admin/overview')
      .set('Origin', 'https://dugunce.com.tr')
    expect(String(res.headers['vary'] ?? '')).toContain('Origin')
  })
})

// ---------------------------------------------------------------------------
// 7. Hız sınırı
// ---------------------------------------------------------------------------

describe('login hız sınırı', () => {
  it('10 denemeden sonra 429', async () => {
    const app = makeApp()
    let last = 0
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'x@t.local', password: 'yanlis-parola-123' })
      last = res.status
    }
    expect(last).toBe(401)

    const blocked = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'x@t.local', password: 'yanlis-parola-123' })
    expect(blocked.status).toBe(429)
  }, 60_000)
})
