import { describe, it, expect } from 'vitest'
import { toPublicInvitation, PUBLIC_FIELDS } from '../../src/guests/public-view.js'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    weddingId: 'w1',
    guestId: 'g1',
    tokenHash: 'secret-hash',
    allowedPartySize: 3,
    confirmedPartySize: 2,
    rsvpSource: 'GUEST',
    rsvpAt: new Date('2026-10-01T10:00:00Z'),
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    guest: {
      id: 'g1',
      name: 'Ayşe Yılmaz',
      phone: '+905321234567',
      deletedAt: null,
      rsvp: 'ATTENDING',
    },
    wedding: {
      id: 'w1',
      coupleNames: 'Elif & Mert',
      weddingDate: new Date('2026-09-12T19:00:00Z'),
      timezone: 'Europe/Istanbul',
      venueName: 'Kır Düğün Salonu',
      venueAddress: 'İzmir',
      mapUrl: 'https://maps.example/x',
      program: [{ time: '19:00', title: 'Karşılama' }],
      giftNote: 'Hediye yerine bağış',
      rsvpDeadline: new Date('2026-09-01T00:00:00Z'),
    },
    ...overrides,
  }
}

describe('toPublicInvitation — beyaz liste', () => {
  it('çift isimleri, tarih, mekân döner', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v.coupleNames).toBe('Elif & Mert')
    expect(v.venueName).toBe('Kır Düğün Salonu')
  })

  it('davetli adı döner (kişiselleştirme)', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v.guestName).toBe('Ayşe Yılmaz')
  })

  it('allowedPartySize ve confirmedPartySize AYRI alanlar', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v.allowedPartySize).toBe(3)
    expect(v.confirmedPartySize).toBe(2)
  })

  it('program döner', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v.program).toEqual([{ time: '19:00', title: 'Karşılama' }])
  })

  it('program boşsa null', () => {
    const row = makeRow()
    row.wedding.program = null as never
    expect(toPublicInvitation(row as never)!.program).toBeNull()
  })

  it('davetiye geçersizse null', () => {
    expect(toPublicInvitation(null)).toBeNull()
  })

  it('revoke ise null', () => {
    expect(toPublicInvitation(makeRow({ revokedAt: new Date() }) as never)).toBeNull()
  })

  it('süresi geçmişse null', () => {
    expect(
      toPublicInvitation(makeRow({ expiresAt: new Date(Date.now() - 1000) }) as never),
    ).toBeNull()
  })

  it('silinmiş davetli ise null', () => {
    const row = makeRow()
    row.guest.deletedAt = new Date() as never
    expect(toPublicInvitation(row as never)).toBeNull()
  })
})

describe('sızdırmazlık — hassas alanlar DÖNMEZ', () => {
  it('davetlinin TELEFONU dönmez', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(JSON.stringify(v)).not.toContain('+905321234567')
  })

  it('wedding_id dönmez', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v).not.toHaveProperty('weddingId')
    expect(JSON.stringify(v)).not.toContain('"w1"')
  })

  it('token_hash dönmez', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(JSON.stringify(v)).not.toContain('secret-hash')
  })

  it('guest_id dönmez', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v).not.toHaveProperty('guestId')
  })

  it('rsvp_source dönmez (iç denetim bilgisi)', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v).not.toHaveProperty('rsvpSource')
  })

  it('yalnızca beyaz listedeki alanlar döner', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(Object.keys(v).sort()).toEqual([...PUBLIC_FIELDS].sort())
  })
})

describe('RSVP kapanışı', () => {
  it('deadline geçmişse isOpen false', () => {
    const row = makeRow()
    row.wedding.rsvpDeadline = new Date(Date.now() - 1000) as never
    expect(toPublicInvitation(row as never)!.isOpen).toBe(false)
  })

  it('fixture sabit deadline geçmişte (2026-09-01) → isOpen false', () => {
    // Bu test fixture'ın kendisini belgeler: sabit tarih geçmişte.
    expect(toPublicInvitation(makeRow() as never)!.isOpen).toBe(false)
  })

  it('deadline gelecekteyse isOpen true', () => {
    // Fixture'daki 2026-09-01 sabit tarihi geçmişte kalıyor; bu test için
    // göreli gelecek tarih kullanılmalı.
    const row = makeRow()
    row.wedding.rsvpDeadline = new Date(Date.now() + 86_400_000) as never
    expect(toPublicInvitation(row as never)!.isOpen).toBe(true)
  })

  it('deadline yoksa isOpen true', () => {
    const row = makeRow()
    row.wedding.rsvpDeadline = null as never
    expect(toPublicInvitation(row as never)!.isOpen).toBe(true)
  })
})
