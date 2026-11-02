/**
 * Yardımcı uygulaması — GERÇEK HTTP + GERÇEK DB.
 *
 * SECURITY §1.2 #4: veri istekleri artık URL'deki uzun ömürlü token ile
 * değil, kısa ömürlü oturum çerezi ile yapılır. Token yalnızca
 * `POST /api/v1/helper/session` gövdesinde bir kez gönderilir.
 *
 * Review Focus #2: yardımcı BAŞKA yardımcının görevine erişememeli —
 * `task_id` tahmin edilse bile.
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
import { drizzleHelperDeps } from '../../src/helpers/store.js'
import { drizzleTaskDeps } from '../../src/tasks/store.js'
import { drizzleMessageDeps } from '../../src/messages/store.js'
import { drizzleSessionDeps } from '../../src/helpers/session-store.js'
import { createHelper, revokeHelper } from '../../src/helpers/service.js'
import { createTask, assignTask } from '../../src/tasks/service.js'
import { sendMessage } from '../../src/messages/service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIG = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let app: ReturnType<typeof createApp>
let helperStore: ReturnType<typeof drizzleHelperDeps>
let taskStore: ReturnType<typeof drizzleTaskDeps>
let msgStore: ReturnType<typeof drizzleMessageDeps>
let sessionStore: ReturnType<typeof drizzleSessionDeps>

let weddingId: string
let userId: string
let tokenA: string
let tokenB: string
let helperA: string
let helperB: string
let taskA: string
let taskB: string

interface Login {
  cookie: string
  csrf: string
}

/** Token → oturum. Çerezleri tek başlıkta birleştirir (supertest `.set`). */
async function login(token: string): Promise<Login> {
  const res = await request(app).post('/api/v1/helper/session').send({ token })
  expect(res.status).toBe(201)
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined
  const cookie = (raw ?? []).map((c) => c.split(';')[0]).join('; ')
  return { cookie, csrf: res.body.csrfToken as string }
}

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, { schema })
  const d = db as unknown as Parameters<typeof drizzleHelperDeps>[0]
  helperStore = drizzleHelperDeps(d)
  taskStore = drizzleTaskDeps(d)
  msgStore = drizzleMessageDeps(d)
  sessionStore = drizzleSessionDeps(d)

  app = createApp({
    helperStore,
    taskStore,
    messageStore: msgStore,
    sessionStore,
    helperRateLimit: false,
  })

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('ha@t.local','H') RETURNING id`,
  )
  userId = u.rows[0]!.id
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan) VALUES ('Elif & Mert','2026-09-12','PREMIUM') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )

  const ha = await createHelper(
    { weddingId, userId, input: { displayName: 'Ayşe' } },
    helperStore,
  )
  const hb = await createHelper(
    { weddingId, userId, input: { displayName: 'Fatma' } },
    helperStore,
  )
  tokenA = ha!.token
  tokenB = hb!.token
  helperA = ha!.helper.id
  helperB = hb!.helper.id

  const ta = await createTask({ weddingId, userId, input: { title: 'Ayşe görevi' } }, taskStore)
  const tb = await createTask({ weddingId, userId, input: { title: 'Fatma görevi' } }, taskStore)
  taskA = ta.id
  taskB = tb.id

  await assignTask({ weddingId, userId, taskId: taskA, helperId: helperA }, taskStore)
  await assignTask({ weddingId, userId, taskId: taskB, helperId: helperB }, taskStore)
}, 90_000)

afterAll(async () => {
  await pg?.close()
})

describe('POST /helper/session — token → kısa ömürlü oturum', () => {
  it('geçerli token oturum açar, HttpOnly çerez verir', async () => {
    const res = await request(app).post('/api/v1/helper/session').send({ token: tokenA })
    expect(res.status).toBe(201)
    expect(res.body.helperName).toBe('Ayşe')
    expect(res.body.coupleNames).toBe('Elif & Mert')
    expect(res.body.csrfToken).toHaveLength(43)

    const cookies = res.headers['set-cookie'] as unknown as string[]
    const session = cookies.find((c) => c.startsWith('h_session='))!
    expect(session).toContain('HttpOnly')
    expect(session).toContain('SameSite=')
    expect(session).toContain('Path=/api/v1/helper')
  })

  it('gövdede token yok → 400', async () => {
    const res = await request(app).post('/api/v1/helper/session').send({})
    expect(res.status).toBe(400)
  })

  it('bilinmeyen token → 404', async () => {
    const res = await request(app)
      .post('/api/v1/helper/session')
      .send({ token: 'gecersiz-token' })
    expect(res.status).toBe(404)
  })

  it('süresi dolmuş davet linki → 404 (SECURITY §1.2 #3)', async () => {
    const h = await createHelper(
      { weddingId, userId, input: { displayName: 'Süresi dolmuş' } },
      helperStore,
    )
    await pg.query(`UPDATE helpers SET expires_at = now() - interval '1 day' WHERE id=$1`, [
      h!.helper.id,
    ])
    const res = await request(app).post('/api/v1/helper/session').send({ token: h!.token })
    expect(res.status).toBe(404)
  })
})

describe('veri uçları — oturum zorunlu', () => {
  it('oturum yoksa 401', async () => {
    const res = await request(app).get('/api/v1/helper/tasks')
    expect(res.status).toBe(401)
  })

  it('URL\'de token taşıyan eski yol KAPALI', async () => {
    const res = await request(app).get(`/api/v1/helper/${tokenA}/tasks`)
    expect(res.status).toBe(404)
  })

  it('oturumla yalnızca KENDİ görevlerini döner', async () => {
    const s = await login(tokenA)
    const res = await request(app).get('/api/v1/helper/tasks').set('Cookie', s.cookie)
    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(1)
    expect(res.body.tasks[0].title).toBe('Ayşe görevi')
    expect(res.body.helperName).toBe('Ayşe')
    expect(res.body.coupleNames).toBe('Elif & Mert')
  })

  it('güvenlik başlıkları taşır', async () => {
    const s = await login(tokenA)
    const res = await request(app).get('/api/v1/helper/tasks').set('Cookie', s.cookie)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow')
  })

  it('revoke edilen yardımcının oturumu ANINDA ölür', async () => {
    const h = await createHelper(
      { weddingId, userId, input: { displayName: 'Revoke testi' } },
      helperStore,
    )
    const s = await login(h!.token)
    const before = await request(app).get('/api/v1/helper/tasks').set('Cookie', s.cookie)
    expect(before.status).toBe(200)

    await revokeHelper({ weddingId, userId, helperId: h!.helper.id }, helperStore)

    const after = await request(app).get('/api/v1/helper/tasks').set('Cookie', s.cookie)
    expect(after.status).toBe(401)
  })
})

describe('PATCH /helper/tasks/:taskId', () => {
  it('kendi görevinin durumunu değiştirir', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ status: 'DOING' })
    expect(res.status).toBe(200)
    expect(res.body.task.status).toBe('DOING')
  })

  it('CSRF başlığı yoksa 403', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .send({ status: 'DONE' })
    expect(res.status).toBe(403)

    const row = await pg.query<{ status: string }>(`SELECT status FROM tasks WHERE id=$1`, [taskA])
    expect(row.rows[0]!.status).toBe('DOING')
  })

  it('yanlış CSRF değeri 403', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', 'yanlis')
      .send({ status: 'DONE' })
    expect(res.status).toBe(403)
  })

  it('BAŞKASININ görevini değiştiremez → 404', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskB}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ status: 'DONE' })
    expect(res.status).toBe(404)

    const row = await pg.query<{ status: string }>(`SELECT status FROM tasks WHERE id=$1`, [taskB])
    expect(row.rows[0]!.status).toBe('TODO')
  })

  it('başlık DEĞİŞTİREMEZ → 400', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ title: 'Hack' })
    expect(res.status).toBe(400)
  })

  it('açıklama DEĞİŞTİREMEZ → 400', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ description: 'Hack' })
    expect(res.status).toBe(400)
  })

  it('status ile birlikte başka alan da reddedilir', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ status: 'DONE', title: 'Hack' })
    expect(res.status).toBe(400)
  })

  it('geçersiz status reddedilir', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .patch(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ status: 'BELKI' })
    expect(res.status).toBe(400)
  })

  it('DELETE yok (yardımcı görev silemez)', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .delete(`/api/v1/helper/tasks/${taskA}`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
    expect(res.status).toBe(404) // route yok
  })
})

describe('mesajlaşma — yardımcı tarafı', () => {
  it('mesaj gönderir, sender_kind HELPER olur', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .post(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ body: 'Görevi aldım' })
    expect(res.status).toBe(201)
    expect(res.body.message.senderKind).toBe('HELPER')
  })

  it('mesajları listeler', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .get(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
    expect(res.status).toBe(200)
    expect(res.body.messages.length).toBeGreaterThan(0)
  })

  it('mesaj yanıtı wedding_id / task_id / sender_id SIZDIRMAZ', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .get(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
    const text = JSON.stringify(res.body)

    expect(text).not.toContain(weddingId)
    expect(text).not.toContain(taskA)
    expect(text).not.toContain(userId)
    expect(text).not.toContain(helperA)

    const m = res.body.messages[0]
    expect(Object.keys(m).sort()).toEqual(['body', 'createdAt', 'id', 'senderKind'])
  })

  it('gönderilen mesaj yanıtı da sızdırmaz', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .post(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ body: 'sızıntı testi' })
    const text = JSON.stringify(res.body)
    expect(text).not.toContain(weddingId)
    expect(text).not.toContain(taskA)
    expect(Object.keys(res.body.message).sort()).toEqual([
      'body', 'createdAt', 'id', 'senderKind',
    ])
  })

  it('başkasının görevinin mesajlarını GÖREMEZ', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .get(`/api/v1/helper/tasks/${taskB}/messages`)
      .set('Cookie', s.cookie)
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([])
  })

  it('başkasının görevine mesaj GÖNDEREMEZ → 404', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .post(`/api/v1/helper/tasks/${taskB}/messages`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ body: 'Sızma denemesi' })
    expect(res.status).toBe(404)
  })

  it('4001 karakter → 422', async () => {
    const s = await login(tokenA)
    const res = await request(app)
      .post(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ body: 'a'.repeat(4001) })
    expect(res.status).toBe(422)
  })

  it('idempotency: aynı key iki kez → tek mesaj', async () => {
    const s = await login(tokenA)
    const payload = { body: 'tekrar', idempotencyKey: 'e2e-key-1' }
    const r1 = await request(app)
      .post(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send(payload)
    const r2 = await request(app)
      .post(`/api/v1/helper/tasks/${taskA}/messages`)
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send(payload)
    expect(r1.body.message.id).toBe(r2.body.message.id)
  })
})

describe('oturum kapatma', () => {
  it('DELETE /session çerezleri temizler ve oturumu öldürür', async () => {
    const s = await login(tokenA)
    const del = await request(app)
      .delete('/api/v1/helper/session')
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
    expect(del.status).toBe(204)

    const after = await request(app).get('/api/v1/helper/tasks').set('Cookie', s.cookie)
    expect(after.status).toBe(401)
  })

  it('CSRF olmadan kapatma 403', async () => {
    const s = await login(tokenA)
    const del = await request(app).delete('/api/v1/helper/session').set('Cookie', s.cookie)
    expect(del.status).toBe(403)
  })
})

describe('CORS — yardımcı uçları', () => {
  it('izinli origin kabul edilir ve credentials açık', async () => {
    const res = await request(app)
      .get('/api/v1/helper/tasks')
      .set('Origin', 'https://dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('izinsiz origin başlık almaz', async () => {
    const res = await request(app)
      .get('/api/v1/helper/tasks')
      .set('Origin', 'https://kotu.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
