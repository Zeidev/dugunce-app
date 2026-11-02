import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { logger } from '../../src/lib/logger.js'

describe('I3: davetiye token\'ı log\'a sızmamalı', () => {
  it('GET /invitations/<token> hata verse de token log\'a yazılmaz', async () => {
    const token = 'COK-GIZLI-TOKEN-DEGERI-1234567890'
    const captured: unknown[] = []
    const spy = vi.spyOn(logger, 'debug').mockImplementation((...args: unknown[]) => {
      captured.push(JSON.stringify(args))
    })
    const spy2 = vi.spyOn(logger, 'error').mockImplementation((...args: unknown[]) => {
      captured.push(JSON.stringify(args))
    })

    const app = createApp({
      guestStore: {
        findByTokenHash: async () => null,
        transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
      } as never,
    })

    await request(app).get(`/api/v1/invitations/${token}`)

    const all = captured.join(' ')
    expect(all).not.toContain(token)

    spy.mockRestore()
    spy2.mockRestore()
  })
})
