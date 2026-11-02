import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

/**
 * Auth testleri DB'ye bağlanmasın diye boş depo enjekte edilir.
 * Hiçbir sorgu çalışmaz çünkü 401/404 auth katmanında döner.
 */
const noopStore = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  insertGuest: async () => { throw new Error('çağrılmamalı') },
  insertGuests: async () => { throw new Error('çağrılmamalı') },
  listByWedding: async () => [],
  findById: async () => null,
  updateGuest: async () => { throw new Error('çağrılmamalı') },
  softDelete: async () => false,
  revokeInvitations: async () => 0,
  countActiveGuests: async () => 0,
  lockWeddingForUpdate: async () => undefined,
  getPlan: async () => 'FREE' as const,
  findGuestForInvitation: async () => null,
  insertInvitation: async () => { throw new Error('çağrılmamalı') },
  findByTokenHash: async () => null,
  revokeByGuestId: async () => 0,
  updateRsvp: async () => { throw new Error('çağrılmamalı') },
  updateGuestRsvp: async () => undefined,
} as unknown as NonNullable<Parameters<typeof createApp>[0]['guestStore']>

const app = () => createApp({ guestStore: noopStore })

/**
 * Davetli route'ları — auth katmanı.
 *
 * DB gerektirmeyen kontroller: token yok → 401.
 * Gerçek CRUD akışı store testinde (PGlite) doğrulanır.
 */
describe('davetli route bağlama', () => {
  const weddingId = '00000000-0000-0000-0000-000000000001'

  it('GET /guests — token yoksa 401', async () => {
    const res = await request(app()).get(`/api/v1/weddings/${weddingId}/guests`)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('POST /guests — token yoksa 401', async () => {
    const res = await request(app())
      .post(`/api/v1/weddings/${weddingId}/guests`)
      .send({ name: 'Ayşe' })
    expect(res.status).toBe(401)
  })

  it('POST /guests/bulk — token yoksa 401', async () => {
    const res = await request(app())
      .post(`/api/v1/weddings/${weddingId}/guests/bulk`)
      .send({ guests: [{ name: 'A' }] })
    expect(res.status).toBe(401)
  })

  it('PATCH /guests/:id — token yoksa 401', async () => {
    const res = await request(app())
      .patch(`/api/v1/weddings/${weddingId}/guests/g1`)
      .send({ name: 'X' })
    expect(res.status).toBe(401)
  })

  it('DELETE /guests/:id — token yoksa 401', async () => {
    const res = await request(app()).delete(`/api/v1/weddings/${weddingId}/guests/g1`)
    expect(res.status).toBe(401)
  })

  it('POST /guests/:id/invitation — token yoksa 401', async () => {
    const res = await request(app()).post(
      `/api/v1/weddings/${weddingId}/guests/g1/invitation`,
    )
    expect(res.status).toBe(401)
  })

  it('GET /guests/limit — token yoksa 401', async () => {
    const res = await request(app()).get(`/api/v1/weddings/${weddingId}/guests/limit`)
    expect(res.status).toBe(401)
  })
})

describe('davetli tarafı — auth GEREKMEZ', () => {
  const fakeToken = 'a'.repeat(43)

  it('GET /invitations/:token — token yoksa 404 (401 değil)', async () => {
    const res = await request(app()).get(`/api/v1/invitations/${fakeToken}`)
    // Kimlik doğrulaması yok; bilinmeyen davetiye 404
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('POST /invitations/:token/rsvp — bilinmeyen token 404', async () => {
    const res = await request(app())
      .post(`/api/v1/invitations/${fakeToken}/rsvp`)
      .send({ rsvp: 'ATTENDING', partySize: 1 })
    expect(res.status).toBe(404)
  })

  it('davetli yanıtı no-store taşır', async () => {
    const res = await request(app()).get(`/api/v1/invitations/${fakeToken}`)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('davetli yanıtı noindex taşır', async () => {
    const res = await request(app()).get(`/api/v1/invitations/${fakeToken}`)
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow')
  })

  it('davetli yanıtı no-referrer taşır', async () => {
    const res = await request(app()).get(`/api/v1/invitations/${fakeToken}`)
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })
})
