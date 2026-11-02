/**
 * Program alanı sanitizasyonu.
 *
 * `wedding.program` JSONB ve çift tarafından yazılıyor. Davetliye
 * gönderilirken alan alan kopyalanmalı: `...entry` yayılırsa çiftin
 * eklediği iç notlar (ör. "amcasıyla kavga") davetliye gider.
 */

import { describe, it, expect } from 'vitest'
import { toPublicInvitation } from '../../src/guests/public-view.js'

function row(program: unknown) {
  return {
    id: 'i1', weddingId: 'w1', guestId: 'g1', tokenHash: 'h',
    allowedPartySize: 2, confirmedPartySize: null, rsvpSource: null, rsvpAt: null,
    expiresAt: new Date(Date.now() + 86400000), revokedAt: null,
    guest: { id: 'g1', name: 'A', deletedAt: null, rsvp: 'PENDING' },
    wedding: {
      id: 'w1', coupleNames: 'A & B', weddingDate: new Date('2026-09-12'),
      timezone: 'Europe/Istanbul', venueName: null, venueAddress: null,
      mapUrl: null, program, giftNote: null, rsvpDeadline: null,
    },
  }
}

describe('program sanitizasyonu', () => {
  it('fazladan alanlar (ör. iç not) sızmaz', () => {
    const v = toPublicInvitation(row([
      { time: '19:00', title: 'Karşılama', note: 'iç not', secret: 'gizli', internalId: 'x' },
    ]) as never)!
    expect(v.program![0]).toEqual({ time: '19:00', title: 'Karşılama', note: 'iç not' })
    expect(JSON.stringify(v)).not.toContain('gizli')
  })

  it('sayı tipi time kabul edilmez', () => {
    expect(toPublicInvitation(row([{ time: 1900, title: 'X' }]) as never)!.program).toBeNull()
  })

  it('boş dizi null döner', () => {
    expect(toPublicInvitation(row([]) as never)!.program).toBeNull()
  })

  it('string program null döner', () => {
    expect(toPublicInvitation(row('kotu') as never)!.program).toBeNull()
  })

  it('null elemanlar atlanır', () => {
    const v = toPublicInvitation(row([null, { time: '19:00', title: 'X' }]) as never)!
    expect(v.program).toHaveLength(1)
  })
})
