import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { signAccessToken } from '../../src/auth/tokens.js'
import { errorHandler } from '../../src/middleware/error-handler.js'
import { createRequireAuth } from '../../src/middleware/require-auth.js'
import { createRequireWeddingMember } from '../../src/middleware/require-member.js'

const SECRET = 'a'.repeat(40)
const token = (userId: string) => signAccessToken({ userId }, SECRET)

/** Test uygulaması — middleware'leri enjekte ederek. */
function makeApp(deps: {
  findUserById: (id: string) => Promise<{ id: string; status: string } | null>
  findMembership: (
    weddingId: string,
    userId: string,
  ) => Promise<{ weddingId: string; userId: string; role: string } | null>
}) {
  const app = express()
  app.use(express.json())

  const requireAuth = createRequireAuth({ secret: SECRET, findUserById: deps.findUserById })
  const requireMember = createRequireWeddingMember({ findMembership: deps.findMembership })

  app.get('/protected', requireAuth, (req, res) => {
    res.json({ userId: (req as express.Request & { auth?: { userId: string } }).auth?.userId })
  })

  app.get('/weddings/:weddingId', requireAuth, requireMember(), (req, res) => {
    res.json({ ok: true, membership: (req as express.Request & { membership?: unknown }).membership })
  })

  app.post('/weddings/:weddingId/owner-only', requireAuth, requireMember(['OWNER']), (_req, res) => {
    res.json({ ok: true })
  })

  app.use(errorHandler)
  return app
}

const activeUser = (id: string) => async () => ({ id, status: 'ACTIVE' })

describe('requireAuth', () => {
  it('token yoksa 401 UNAUTHORIZED', async () => {
    const app = makeApp({ findUserById: activeUser('u1'), findMembership: async () => null })
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('geçersiz token 401', async () => {
    const app = makeApp({ findUserById: activeUser('u1'), findMembership: async () => null })
    const res = await request(app).get('/protected').set('Authorization', 'Bearer bozuk.token.xyz')
    expect(res.status).toBe(401)
  })

  it('Bearer olmayan scheme 401', async () => {
    const app = makeApp({ findUserById: activeUser('u1'), findMembership: async () => null })
    const res = await request(app).get('/protected').set('Authorization', 'Basic abc')
    expect(res.status).toBe(401)
  })

  it('geçerli token ile geçer ve userId taşır', async () => {
    const app = makeApp({ findUserById: activeUser('u1'), findMembership: async () => null })
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token('u1')}`)
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe('u1')
  })

  it('süresi dolmuş token 401', async () => {
    const app = makeApp({ findUserById: activeUser('u1'), findMembership: async () => null })
    const expired = signAccessToken({ userId: 'u1' }, SECRET, -1)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`)
    expect(res.status).toBe(401)
  })

  it('DB\'de olmayan kullanıcı 401', async () => {
    const app = makeApp({ findUserById: async () => null, findMembership: async () => null })
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token('silinmis')}`)
    expect(res.status).toBe(401)
  })

  it('askıya alınmış kullanıcı 401', async () => {
    const app = makeApp({
      findUserById: async (id) => ({ id, status: 'SUSPENDED' }),
      findMembership: async () => null,
    })
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token('u1')}`)
    expect(res.status).toBe(401)
  })
})

describe('requireWeddingMember', () => {
  it('üye olunan düğün geçer, membership taşınır', async () => {
    const app = makeApp({
      findUserById: activeUser('u1'),
      findMembership: async (weddingId, userId) => ({ weddingId, userId, role: 'OWNER' }),
    })
    const res = await request(app)
      .get('/weddings/w1')
      .set('Authorization', `Bearer ${token('u1')}`)
    expect(res.status).toBe(200)
    expect(res.body.membership).toEqual({ weddingId: 'w1', userId: 'u1', role: 'OWNER' })
  })

  it('REVIEW FOCUS #1 — üye olunmayan düğün 404 döner (403 DEĞİL)', async () => {
    // 403 "kaynak var ama yetkin yok" der → varlık bilgisi sızdırır
    const app = makeApp({
      findUserById: activeUser('u1'),
      findMembership: async () => null, // u1, w2'ye üye değil
    })
    const res = await request(app)
      .get('/weddings/w2')
      .set('Authorization', `Bearer ${token('u1')}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('başka kullanıcının düğünü de 404 (IDOR)', async () => {
    const app = makeApp({
      findUserById: activeUser('saldirgan'),
      findMembership: async (_wid, userId) => (userId === 'kurban' ? { weddingId: 'w1', userId, role: 'OWNER' } : null),
    })
    const res = await request(app)
      .get('/weddings/w1')
      .set('Authorization', `Bearer ${token('saldirgan')}`)
    expect(res.status).toBe(404)
  })

  it('rol kısıtı: OWNER-only endpoint\'te CO_OWNER 403 alır', async () => {
    const app = makeApp({
      findUserById: activeUser('u1'),
      findMembership: async (weddingId, userId) => ({ weddingId, userId, role: 'CO_OWNER' }),
    })
    const res = await request(app)
      .post('/weddings/w1/owner-only')
      .set('Authorization', `Bearer ${token('u1')}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('rol kısıtı: OWNER geçer', async () => {
    const app = makeApp({
      findUserById: activeUser('u1'),
      findMembership: async (weddingId, userId) => ({ weddingId, userId, role: 'OWNER' }),
    })
    const res = await request(app)
      .post('/weddings/w1/owner-only')
      .set('Authorization', `Bearer ${token('u1')}`)
    expect(res.status).toBe(200)
  })

  it('token yoksa üyelik kontrolüne hiç gelmez (401)', async () => {
    const findMembership = vi.fn()
    const app = makeApp({ findUserById: activeUser('u1'), findMembership })
    const res = await request(app).get('/weddings/w1')
    expect(res.status).toBe(401)
    expect(findMembership).not.toHaveBeenCalled()
  })

  it('üyelik kontrolü doğru parametrelerle çağrılır', async () => {
    const findMembership = vi.fn().mockResolvedValue({ weddingId: 'w9', userId: 'u9', role: 'OWNER' })
    const app = makeApp({ findUserById: activeUser('u9'), findMembership })
    await request(app).get('/weddings/w9').set('Authorization', `Bearer ${token('u9')}`)
    expect(findMembership).toHaveBeenCalledWith('w9', 'u9')
  })
})
