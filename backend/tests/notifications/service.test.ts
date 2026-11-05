import { describe, it, expect, vi } from 'vitest'
import { notifyWeddingMembers, NOTIFICATION_COPY } from '../../src/notifications/service.js'
import type { DeviceTokenDeps, DeviceTokenRow } from '../../src/notifications/store.js'

/**
 * Bildirim servisi — orkestrasyon.
 *
 * Tüm bağımlılıklar enjekte edilir: ağ yok, DB yok. Sınanan şey
 * KARARLAR (gönderelim mi, kime, hata olursa ne olur).
 */

function tokensDeps(rows: DeviceTokenRow[]): DeviceTokenDeps {
  return {
    upsertDeviceToken: vi.fn(async () => undefined),
    deleteDeviceToken: vi.fn(async () => undefined),
    deleteAllForUser: vi.fn(async () => undefined),
    listTokensForUser: vi.fn(async () => []),
    listTokensForWeddingMembers: vi.fn(async () => rows),
  }
}

const ROW = (t: string): DeviceTokenRow => ({
  id: `i-${t}`,
  userId: `u-${t}`,
  token: t,
  platform: 'ANDROID',
})

/** İstanbul 14:00 — sessiz saat dışı. */
const DAYTIME = new Date(Date.UTC(2026, 10, 5, 11, 0))

/** İstanbul 23:00 — sessiz saat. */
const NIGHT = new Date(Date.UTC(2026, 10, 5, 20, 0))

const FAR_WEDDING = new Date('2026-12-01T18:00:00Z')

describe('notifyWeddingMembers', () => {
  it('sessiz saatte HİÇ göndermez', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a')]),
        sender,
        findWedding: async () => ({ weddingDate: FAR_WEDDING }),
        isQuietHoursOverride: async () => false,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: NIGHT },
    )
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('gündüz tüm tokenlara gönderir', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a'), ROW('b')]),
        sender,
        findWedding: async () => ({ weddingDate: FAR_WEDDING }),
        isQuietHoursOverride: async () => false,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('sender null (push kapalı) ise hiçbir sorgu yapmaz', async () => {
    const tokens = tokensDeps([ROW('a')])
    await notifyWeddingMembers(
      {
        tokens,
        sender: null,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    expect(tokens.listTokensForWeddingMembers).not.toHaveBeenCalled()
  })

  it('kullanıcı bildirimleri KAPATMIŞSA göndermez', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a')]),
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => false,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('UNREGISTERED dönen token DB den SİLİNİR', async () => {
    const tokens = tokensDeps([ROW('olu')])
    const sender = {
      send: vi.fn(async () => ({
        ok: false as const,
        unregistered: true,
        reason: 'FCM 404',
      })),
    }
    await notifyWeddingMembers(
      {
        tokens,
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    // Ölü token silinmezse her bildirimde boşa istek atılır.
    expect(tokens.deleteDeviceToken).toHaveBeenCalledWith('olu')
  })

  it('bir token hata verse DİĞERLERİNE gönderim devam eder', async () => {
    const tokens = tokensDeps([ROW('kotu'), ROW('iyi')])
    const sender = {
      send: vi.fn(async (t: string) =>
        t === 'kotu'
          ? { ok: false as const, unregistered: false, reason: 'FCM 500' }
          : { ok: true as const },
      ),
    }
    await notifyWeddingMembers(
      {
        tokens,
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('send FIRLATSA bile döngü devam eder', async () => {
    const tokens = tokensDeps([ROW('patlar'), ROW('saglam')])
    const sender = {
      send: vi.fn(async (t: string) => {
        if (t === 'patlar') throw new Error('beklenmedik')
        return { ok: true as const }
      }),
    }
    await notifyWeddingMembers(
      {
        tokens,
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('actorUserId kendine bildirim göndermez', async () => {
    const tokens = tokensDeps([])
    await notifyWeddingMembers(
      {
        tokens,
        sender: { send: vi.fn(async () => ({ ok: true as const })) },
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'TASK_MESSAGE', actorUserId: 'u1', now: DAYTIME },
    )
    expect(tokens.listTokensForWeddingMembers).toHaveBeenCalledWith('w1', 'u1')
  })

  it('düğün bulunamazsa sessizce döner', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a')]),
        sender,
        findWedding: async () => null,
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'yok', event: 'RSVP_RECEIVED', actorUserId: null, now: DAYTIME },
    )
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('data yükü type ve weddingId taşır', async () => {
    const calls: Record<string, string>[] = []
    const sender = {
      send: vi.fn(async (_t: string, _ti: string, _b: string, data: Record<string, string>) => {
        calls.push(data)
        return { ok: true as const }
      }),
    }
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a')]),
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'TASK_ASSIGNED', actorUserId: null, now: DAYTIME },
    )
    expect(calls[0]?.['type']).toBe('TASK_ASSIGNED')
    expect(calls[0]?.['weddingId']).toBe('w1')
  })
})

describe('NOTIFICATION_COPY', () => {
  it('hassas veri İÇERMEZ — rakam yok', () => {
    for (const copy of Object.values(NOTIFICATION_COPY)) {
      // Kilit ekranında görünür: davetli sayısı, tutar, tarih olmamalı.
      expect(copy.title).not.toMatch(/\d/)
      expect(copy.body).not.toMatch(/\d/)
    }
  })

  it('RSVP metni nötr', () => {
    expect(NOTIFICATION_COPY.RSVP_RECEIVED.body).toBe('Bir davetli yanıt verdi.')
  })

  it('dört olayın hepsi için metin var', () => {
    expect(Object.keys(NOTIFICATION_COPY).sort()).toEqual([
      'RSVP_RECEIVED',
      'TASK_ASSIGNED',
      'TASK_MESSAGE',
      'TASK_STATUS_CHANGED',
    ])
  })
})
