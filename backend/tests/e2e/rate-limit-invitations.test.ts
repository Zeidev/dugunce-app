import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

const fakeToken = 'a'.repeat(43)
const noopStore = {
  findByTokenHash: async () => null,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
} as never

describe('I2: kimlik doğrulamasız uçlarda rate limit', () => {
  it('GET /invitations/:token 30 istekten sonra 429', async () => {
    const app = createApp({ guestStore: noopStore })
    let last = 0
    for (let i = 0; i < 35; i++) {
      const res = await request(app).get(`/api/v1/invitations/${fakeToken}`)
      last = res.status
    }
    expect(last).toBe(429)
  })

  it('POST /invitations/:token/rsvp 10 istekten sonra 429', async () => {
    const app = createApp({ guestStore: noopStore })
    let last = 0
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post(`/api/v1/invitations/${fakeToken}/rsvp`)
        .send({ rsvp: 'DECLINED' })
      last = res.status
    }
    expect(last).toBe(429)
  })
})
