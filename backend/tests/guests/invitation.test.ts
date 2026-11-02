import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createInvitation,
  resolveInvitation,
  revokeInvitation,
  INVITATION_TTL_DAYS,
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  PartySizeError,
} from '../../src/guests/invitation.js'

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    findGuestForInvitation: vi.fn().mockResolvedValue({
      id: 'g1',
      weddingId: 'w1',
      name: 'Ayşe',
      deletedAt: null,
    }),
    insertInvitation: vi.fn().mockResolvedValue({ id: 'i1' }),
    findByTokenHash: vi.fn().mockResolvedValue(null),
    revokeByGuestId: vi.fn().mockResolvedValue(1),
    ...overrides,
  }
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    weddingId: 'w1',
    guestId: 'g1',
    tokenHash: 'hash',
    allowedPartySize: 2,
    confirmedPartySize: null,
    rsvpSource: null,
    rsvpAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    guest: { id: 'g1', name: 'Ayşe', deletedAt: null, rsvp: 'PENDING' },
    wedding: { id: 'w1', coupleNames: 'A & B' },
    ...overrides,
  }
}

describe('sabitler', () => {
  it('TTL 90 gün', () => {
    expect(INVITATION_TTL_DAYS).toBe(90)
  })

  it('parti boyutu 1-10', () => {
    expect(MIN_PARTY_SIZE).toBe(1)
    expect(MAX_PARTY_SIZE).toBe(10)
  })
})

describe('createInvitation (Review Focus #2)', () => {
  it('256-bit token üretir (43 karakter base64url)', async () => {
    const d = makeDeps()
    const r = await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    expect(r.token).toHaveLength(43)
  })

  it('ham token ile saklanan hash FARKLI', async () => {
    const d = makeDeps()
    const r = await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    expect(r.token).not.toBe(r.storedHash)
    expect(r.storedHash).toHaveLength(64)
  })

  it('DB\'ye yalnızca hash yazılır', async () => {
    const d = makeDeps()
    const r = await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    const written = d.insertInvitation.mock.calls[0]![0] as Record<string, unknown>
    expect(written['tokenHash']).toBe(sha256(r.token))
    expect(written).not.toHaveProperty('token')
  })

  it('iki davetiye token\'ı asla aynı olmaz', async () => {
    const d = makeDeps()
    const a = await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    const b = await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    expect(a.token).not.toBe(b.token)
  })

  it('TTL 90 gün sonrası', async () => {
    const d = makeDeps()
    const r = await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    const days = Math.round((r.expiresAt.getTime() - Date.now()) / 86_400_000)
    expect(days).toBe(90)
  })

  it('allowed_party_size varsayılan 1', async () => {
    const d = makeDeps()
    await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    const written = d.insertInvitation.mock.calls[0]![0] as Record<string, unknown>
    expect(written['allowedPartySize']).toBe(1)
  })

  it('allowed_party_size 10 kabul edilir', async () => {
    const d = makeDeps()
    await createInvitation(
      { weddingId: 'w1', userId: 'u1', guestId: 'g1', allowedPartySize: 10 },
      d,
    )
    const written = d.insertInvitation.mock.calls[0]![0] as Record<string, unknown>
    expect(written['allowedPartySize']).toBe(10)
  })

  it('allowed_party_size 11 reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1', allowedPartySize: 11 }, d),
    ).rejects.toThrow(PartySizeError)
  })

  it('allowed_party_size 0 reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1', allowedPartySize: 0 }, d),
    ).rejects.toThrow(PartySizeError)
  })

  it('silinmiş davetliye davetiye üretilemez', async () => {
    const d = makeDeps({
      findGuestForInvitation: vi.fn().mockResolvedValue({
        id: 'g1',
        weddingId: 'w1',
        deletedAt: new Date(),
      }),
    })
    await expect(
      createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d),
    ).rejects.toThrow(/silinmiş/i)
    expect(d.insertInvitation).not.toHaveBeenCalled()
  })

  it('üye olunmayan düğüne davetiye üretilemez (IDOR)', async () => {
    const d = makeDeps({ findGuestForInvitation: vi.fn().mockResolvedValue(null) })
    const r = await createInvitation(
      { weddingId: 'w1', userId: 'yabanci', guestId: 'g1' },
      d,
    )
    expect(r).toBeNull()
    expect(d.insertInvitation).not.toHaveBeenCalled()
  })
})

describe('resolveInvitation', () => {
  it('geçerli token satırı döner', async () => {
    const d = makeDeps({ findByTokenHash: vi.fn().mockResolvedValue(makeRow()) })
    const r = await resolveInvitation('raw-token', d)
    expect(r).not.toBeNull()
    expect(r!.id).toBe('i1')
  })

  it('sorgu HASH ile yapılır, ham token ile değil', async () => {
    const d = makeDeps({ findByTokenHash: vi.fn().mockResolvedValue(makeRow()) })
    await resolveInvitation('raw-token', d)
    expect(d.findByTokenHash).toHaveBeenCalledWith(sha256('raw-token'))
  })

  it('bilinmeyen token null', async () => {
    const d = makeDeps({ findByTokenHash: vi.fn().mockResolvedValue(null) })
    expect(await resolveInvitation('yok', d)).toBeNull()
  })

  it('süresi geçmiş token null', async () => {
    const d = makeDeps({
      findByTokenHash: vi
        .fn()
        .mockResolvedValue(makeRow({ expiresAt: new Date(Date.now() - 1000) })),
    })
    expect(await resolveInvitation('x', d)).toBeNull()
  })

  it('revoke edilmiş token null', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(makeRow({ revokedAt: new Date() })),
    })
    expect(await resolveInvitation('x', d)).toBeNull()
  })

  it('SİLİNMİŞ davetlinin token\'ı null (Review Focus #5)', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ guest: { id: 'g1', name: 'Ayşe', deletedAt: new Date(), rsvp: 'PENDING' } }),
      ),
    })
    expect(await resolveInvitation('x', d)).toBeNull()
  })

  it('boş token null', async () => {
    const d = makeDeps()
    expect(await resolveInvitation('', d)).toBeNull()
    expect(d.findByTokenHash).not.toHaveBeenCalled()
  })
})

describe('revokeInvitation', () => {
  it('davetliye ait tüm aktif token\'ları iptal eder', async () => {
    const d = makeDeps()
    const n = await revokeInvitation({ guestId: 'g1' }, d)
    expect(n).toBe(1)
    expect(d.revokeByGuestId).toHaveBeenCalledWith('g1')
  })
})
