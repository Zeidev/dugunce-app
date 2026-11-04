import { describe, it, expect, vi } from 'vitest'
import { updateWedding, weddingInputSchema } from '../../src/weddings/service.js'
import { toPublicInvitation } from '../../src/guests/public-view.js'

/**
 * Davetiye karşılama metni — premium özellik.
 *
 * KULLANICI İSTEĞİ:
 * "Gönderilen davetiye içindeki yazılarda kişinin ismi yazmayacak,
 * sabit bir genel mesaj yazacak, premium ile davetiye içeriğini yani
 * yazısını düzenleme özelliği eklenecek."
 *
 * KARAR: isim kaldırıldı; ücretsizde sabit mesaj, premium'da çiftin
 * kendi metni. Bu testler üç şeyi kilitler:
 *  1. Varsayılan metin (hiç ayar yoksa)
 *  2. Premium'da özel metin
 *  3. Premium OLMAYAN çift özel metin yazsa bile GENEL metin görünür
 *     (yani premium kapısı sunucuda, istemcide değil)
 */
describe('davetiye karsilama metni', () => {
  it('varsayilan genel mesaj — isim YOK', () => {
    expect(DEFAULT_GREETING).toBe('Sizi düğünümüzde görmek isteriz.')
    // İsim yer tutucusu içermemeli.
    expect(DEFAULT_GREETING).not.toMatch(/\{|\}|\$\{/)
  })

  it('premium olmayan dugunde ozel metin yok sayilir', () => {
    const row = makeRow({ plan: 'FREE', invitationMessage: 'Kendi metnim' })
    const v = toPublicInvitation(row as never)!
    expect(v.invitationMessage).toBe(DEFAULT_GREETING)
  })

  it('premium dugunde ozel metin doner', () => {
    const row = makeRow({ plan: 'PREMIUM', invitationMessage: 'Hoş geldiniz!' })
    const v = toPublicInvitation(row as never)!
    expect(v.invitationMessage).toBe('Hoş geldiniz!')
  })

  it('premium ama metin bos ise varsayilana duser', () => {
    const row = makeRow({ plan: 'PREMIUM', invitationMessage: '   ' })
    const v = toPublicInvitation(row as never)!
    expect(v.invitationMessage).toBe(DEFAULT_GREETING)
  })

  it('metin 300 karakterle sinirli', () => {
    const long = 'a'.repeat(301)
    expect(() =>
      weddingInputSchema.parse({
        coupleNames: 'A & B',
        weddingDate: '2026-09-12',
        invitationMessage: long,
      }),
    ).toThrow()
  })

  it('300 karakter kabul edilir', () => {
    const ok = 'a'.repeat(300)
    const r = weddingInputSchema.parse({
      coupleNames: 'A & B',
      weddingDate: '2026-09-12',
      invitationMessage: ok,
    })
    expect(r.invitationMessage).toHaveLength(300)
  })

  it('bos metin undefined a donusur (varsayilan kullanilir)', () => {
    const r = weddingInputSchema.parse({
      coupleNames: 'A & B',
      weddingDate: '2026-09-12',
      invitationMessage: '',
    })
    expect(r.invitationMessage).toBeUndefined()
  })
})

// --- yardımcılar ---

import { DEFAULT_GREETING } from '../../src/guests/greeting.js'

function makeRow(weddingOverrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    weddingId: 'w1',
    guestId: 'g1',
    tokenHash: 'h',
    allowedPartySize: 2,
    confirmedPartySize: null,
    rsvpSource: null,
    rsvpAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    guest: { id: 'g1', name: 'Ayşe', deletedAt: null, rsvp: 'PENDING' },
    wedding: {
      id: 'w1',
      coupleNames: 'A & B',
      weddingDate: new Date('2026-09-12T19:00:00Z'),
      timezone: 'Europe/Istanbul',
      venueName: null,
      venueAddress: null,
      mapUrl: null,
      program: null,
      giftNote: null,
      rsvpDeadline: null,
      template: 'ZARIF',
      fontKey: '',
      partySizeEnabled: true,
      defaultPartySize: 2,
      maxPartySize: 10,
      plan: 'FREE',
      invitationMessage: null,
      ...weddingOverrides,
    },
  }
}
