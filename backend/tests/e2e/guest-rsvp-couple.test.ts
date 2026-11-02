import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

const weddingId = '00000000-0000-0000-0000-000000000001'

const noopStore = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  findByTokenHash: async () => null,
  findById: async () => null,
  updateGuest: async () => { throw new Error('çağrılmamalı') },
  listActiveInvitationsForGuest: async () => [],
  setInvitationRsvp: async () => undefined,
  assertMember: async () => true,
  countActiveGuests: async () => 0,
  lockWeddingForUpdate: async () => undefined,
  getPlan: async () => 'FREE' as const,
  insertGuest: async () => { throw new Error('çağrılmamalı') },
  insertGuests: async () => [],
  listByWedding: async () => [],
  softDelete: async () => false,
  revokeInvitations: async () => 0,
  findGuestForInvitation: async () => null,
  insertInvitation: async () => ({ id: 'i1' }),
  revokeByGuestId: async () => 0,
  updateRsvp: async () => ({ id: 'i1', confirmedPartySize: 1 }),
  updateGuestRsvp: async () => undefined,
} as never

describe('PATCH /guests/:guestId/rsvp — çiftin yanıt girmesi', () => {
  it('token yoksa 401', async () => {
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .patch(`/api/v1/weddings/${weddingId}/guests/g1/rsvp`)
      .send({ rsvp: 'ATTENDING', partySize: 2 })
    expect(res.status).toBe(401)
  })

  it('route PATCH /:guestId tarafından GÖLGELENMİYOR', async () => {
    // /:guestId tek segment eşler; /rsvp ikinci segment olduğu için
    // 401 dönmesi route'un eşleştiğini ama auth'un önce çalıştığını gösterir.
    // Gölgelenseydi de 401 dönerdi; bu yüzden ayrıca 404 kontrolü yapıyoruz.
    const app = createApp({ guestStore: noopStore })
    const res = await request(app)
      .patch(`/api/v1/weddings/${weddingId}/guests/g1/rsvp`)
      .send({ rsvp: 'ATTENDING', partySize: 2 })
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
