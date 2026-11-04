import { describe, it, expect, vi } from 'vitest'
import { createInvitation, DEFAULT_PARTY_SIZE } from '../../src/guests/invitation.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: any) => fn({})),
    findGuestForInvitation: vi.fn().mockResolvedValue({
      id: 'g1', weddingId: 'w1', name: 'Ayşe', deletedAt: null,
    }),
    insertInvitation: vi.fn().mockResolvedValue({ id: 'i1' }),
    findByTokenHash: vi.fn().mockResolvedValue(null),
    revokeByGuestId: vi.fn().mockResolvedValue(1),
    markInviteSent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('kisi sayisi (party size)', () => {
  it('varsayilan 2 — davetli "+"ya basabilsin', async () => {
    const d = makeDeps()
    await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)

    const call = d.insertInvitation.mock.calls[0][0] as Record<string, unknown>
    console.log('VARSAYILAN:', call['allowedPartySize'])
    expect(call['allowedPartySize']).toBe(2)
    expect(DEFAULT_PARTY_SIZE).toBe(2)
  })

  it('acikca verilen deger kullanilir', async () => {
    const d = makeDeps()
    await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1', allowedPartySize: 5 }, d)

    const call = d.insertInvitation.mock.calls[0][0] as Record<string, unknown>
    expect(call['allowedPartySize']).toBe(5)
  })

  it('1 verilirse kabul edilir (cift bilincli olarak kapatabilir)', async () => {
    const d = makeDeps()
    await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1', allowedPartySize: 1 }, d)
    const call = d.insertInvitation.mock.calls[0][0] as Record<string, unknown>
    expect(call['allowedPartySize']).toBe(1)
  })
})

describe('davetiye uretiminde dugun varsayilani', () => {
  it('acikca verilmezse dugunun defaultPartySize i kullanilir', async () => {
    const d = makeDeps({
      findGuestForInvitation: vi.fn().mockResolvedValue({
        id: 'g1', weddingId: 'w1', name: 'Ayşe', deletedAt: null,
        defaultPartySize: 5, maxPartySize: 8,
      }),
    })
    await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)

    const call = d.insertInvitation.mock.calls[0][0] as Record<string, unknown>
    // Sabit 2 değil, düğünün ayarı.
    expect(call['allowedPartySize']).toBe(5)
  })

  it('dugunun azamisi varsayilani sinirlar', async () => {
    const d = makeDeps({
      findGuestForInvitation: vi.fn().mockResolvedValue({
        id: 'g1', weddingId: 'w1', name: 'Ayşe', deletedAt: null,
        defaultPartySize: 9, maxPartySize: 4,
      }),
    })
    await createInvitation({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)

    const call = d.insertInvitation.mock.calls[0][0] as Record<string, unknown>
    expect(call['allowedPartySize']).toBe(4)
  })

  it('acikca verilen deger dugun ayarini ezer', async () => {
    const d = makeDeps({
      findGuestForInvitation: vi.fn().mockResolvedValue({
        id: 'g1', weddingId: 'w1', name: 'Ayşe', deletedAt: null,
        defaultPartySize: 5, maxPartySize: 8,
      }),
    })
    await createInvitation(
      { weddingId: 'w1', userId: 'u1', guestId: 'g1', allowedPartySize: 2 },
      d,
    )

    const call = d.insertInvitation.mock.calls[0][0] as Record<string, unknown>
    expect(call['allowedPartySize']).toBe(2)
  })
})
