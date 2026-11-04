import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  submitRsvp,
  RsvpError,
  RsvpClosedError,
} from '../../src/guests/rsvp.js'

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    weddingId: 'w1',
    guestId: 'g1',
    tokenHash: sha256('tok'),
    allowedPartySize: 4,
    confirmedPartySize: null,
    rsvpSource: null,
    rsvpAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    guest: { id: 'g1', name: 'Ayşe', deletedAt: null, rsvp: 'PENDING' },
    wedding: {
      id: 'w1',
      coupleNames: 'A & B',
      rsvpDeadline: null,
    },
    ...overrides,
  }
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
    findByTokenHash: vi.fn().mockResolvedValue(makeRow()),
    updateRsvp: vi.fn().mockResolvedValue({ id: 'i1', confirmedPartySize: 2 }),
    updateGuestRsvp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('submitRsvp — temel akış', () => {
  it('ATTENDING + kişi sayısı kaydedilir', async () => {
    const d = makeDeps()
    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 2 }, d)
    expect(r).not.toBeNull()
    const written = d.updateRsvp.mock.calls[0]![0] as Record<string, unknown>
    expect(written['confirmedPartySize']).toBe(2)
  })

  it('rsvpAt yazılır', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 2 }, d)
    const written = d.updateRsvp.mock.calls[0]![0] as Record<string, unknown>
    expect(written['rsvpAt']).toBeInstanceOf(Date)
  })

  it('DECLINED → confirmedPartySize 0', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'DECLINED' }, d)
    const written = d.updateRsvp.mock.calls[0]![0] as Record<string, unknown>
    expect(written['confirmedPartySize']).toBe(0)
  })

  it('DECLINED\'de kişi sayısı yok sayılır', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'DECLINED', partySize: 5 }, d)
    const written = d.updateRsvp.mock.calls[0]![0] as Record<string, unknown>
    expect(written['confirmedPartySize']).toBe(0)
  })

  it('rsvpSource GUEST olarak yazılır', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d)
    const written = d.updateRsvp.mock.calls[0]![0] as Record<string, unknown>
    expect(written['rsvpSource']).toBe('GUEST')
  })

  it('davetli tarafındaki rsvp de güncellenir (tek transaction)', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 2 }, d)
    expect(d.updateGuestRsvp).toHaveBeenCalledWith('g1', 'ATTENDING', expect.anything())
  })

  it('transaction içinde çalışır', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d)
    expect(d.transaction).toHaveBeenCalled()
  })
})

describe('submitRsvp — idempotency (Review Focus #4)', () => {
  it('aynı yanıt iki kez → ikinci kez YAZMA yapılmaz', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ confirmedPartySize: 2, rsvpSource: 'GUEST', guest: { id: 'g1', name: 'A', deletedAt: null, rsvp: 'ATTENDING' } }),
      ),
    })
    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 2 }, d)
    expect(r).not.toBeNull()
    expect(d.updateRsvp).not.toHaveBeenCalled()
  })

  it('FARKLI yanıt öncekini günceller (fikir değişebilir)', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ confirmedPartySize: 2, guest: { id: 'g1', name: 'A', deletedAt: null, rsvp: 'ATTENDING' } }),
      ),
    })
    await submitRsvp({ rawToken: 'tok', rsvp: 'DECLINED' }, d)
    expect(d.updateRsvp).toHaveBeenCalled()
  })
})

describe('submitRsvp — doğrulama', () => {
  it('izin verilen kişi sayısı aşılırsa RsvpError', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 5 }, d),
    ).rejects.toThrow(RsvpError)
  })

  it('hata mesajı izin verilen sayıyı içerir', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 9 }, d),
    ).rejects.toThrow(/4/)
  })

  it('kişi sayısı 0 reddedilir', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 0 }, d),
    ).rejects.toThrow(RsvpError)
  })

  it('kişi sayısı negatif reddedilir', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: -1 }, d),
    ).rejects.toThrow(RsvpError)
  })

  it('ATTENDING\'de kişi sayısı zorunlu', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING' }, d),
    ).rejects.toThrow(RsvpError)
  })

  it('geçersiz rsvp değeri reddedilir', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'BELKI' as never, partySize: 1 }, d),
    ).rejects.toThrow()
  })

  it('kesirli kişi sayısı reddedilir', async () => {
    const d = makeDeps()
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1.5 }, d),
    ).rejects.toThrow(RsvpError)
  })
})

describe('submitRsvp — token kapıları', () => {
  it('bilinmeyen token null (404)', async () => {
    const d = makeDeps({ findByTokenHash: vi.fn().mockResolvedValue(null) })
    expect(await submitRsvp({ rawToken: 'yok', rsvp: 'ATTENDING', partySize: 1 }, d)).toBeNull()
  })

  it('revoke token null', async () => {
    const d = makeDeps({ findByTokenHash: vi.fn().mockResolvedValue(makeRow({ revokedAt: new Date() })) })
    expect(await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d)).toBeNull()
  })

  it('silinmiş davetli null', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ guest: { id: 'g1', name: 'A', deletedAt: new Date(), rsvp: 'PENDING' } }),
      ),
    })
    expect(await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d)).toBeNull()
  })

  it('sorgu hash ile yapılır', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d)
    expect(d.findByTokenHash).toHaveBeenCalledWith(sha256('tok'))
  })
})

describe('submitRsvp — kapanış', () => {
  it('deadline geçmişse davetli için RsvpClosedError', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ wedding: { id: 'w1', coupleNames: 'A & B', rsvpDeadline: new Date(Date.now() - 1000) } }),
      ),
    })
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d),
    ).rejects.toThrow(RsvpClosedError)
  })

  it('deadline geçmişse ÇİFT yine yazabilir', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ wedding: { id: 'w1', coupleNames: 'A & B', rsvpDeadline: new Date(Date.now() - 1000) } }),
      ),
    })
    const r = await submitRsvp(
      { rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1, source: 'COUPLE' },
      d,
    )
    expect(r).not.toBeNull()
    expect(d.updateRsvp).toHaveBeenCalled()
  })

  it('çift yazdığında rsvpSource COUPLE olur', async () => {
    const d = makeDeps()
    await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 2, source: 'COUPLE' }, d)
    const written = d.updateRsvp.mock.calls[0]![0] as Record<string, unknown>
    expect(written['rsvpSource']).toBe('COUPLE')
  })

  it('deadline yoksa davetli yazabilir', async () => {
    const d = makeDeps()
    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 1 }, d)
    expect(r).not.toBeNull()
  })
})

describe('kisi sayisi ozelligi kapali', () => {
  it('partySize gonderilmese de ATTENDING kabul edilir', async () => {
    const d = makeDeps()
    const row = makeRow()
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING' }, d)
    expect(r!.confirmedPartySize).toBe(1)
  })

  it('gonderilen partySize yok sayilir, 1 yazilir', async () => {
    const d = makeDeps()
    const row = makeRow()
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 4 }, d)
    expect(r!.confirmedPartySize).toBe(1)
  })

  it('ozellik acikken partySize zorunlu kalir', async () => {
    const d = makeDeps()
    const row = makeRow()
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = true
    d.findByTokenHash.mockResolvedValue(row)

    await expect(submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING' }, d)).rejects.toThrow(
      'Katılım için kişi sayısı gerekli',
    )
  })

  it('onceden bildirilmis sayi korunur, 1 e ezilmez', async () => {
    // Davetli 3 kişi bildirmişti; çift özelliği kapattı. Davetli tekrar
    // "Geliyorum"a basınca 3 → 1'e düşmemeli; geçmiş veri silinmez.
    const d = makeDeps()
    const row = makeRow({ confirmedPartySize: 3 })
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING' }, d)
    expect(r!.confirmedPartySize).toBe(3)
  })

  it('DECLINED her iki durumda da 0 yazar', async () => {
    const d = makeDeps()
    const row = makeRow()
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'DECLINED' }, d)
    expect(r!.confirmedPartySize).toBe(0)
  })
})

describe('dugun azamisi RSVP yazma yolunda da gecerli', () => {
  it('davetlinin izni genis olsa da dugunun azamisi uygulanir', async () => {
    const d = makeDeps()
    const row = makeRow({ allowedPartySize: 10 })
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = true
    ;(row.wedding as Record<string, unknown>)['maxPartySize'] = 4
    d.findByTokenHash.mockResolvedValue(row)

    // Davetli sayfası "en fazla 4" gösteriyor; 10 gönderen bir istek
    // (eski sekme, kıvrımlı istemci) kabul edilmemeli.
    await expect(
      submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 10 }, d),
    ).rejects.toThrow('En fazla 4 kişi bildirebilirsiniz')
  })

  it('dugun azamisi icinde kalan deger kabul edilir', async () => {
    const d = makeDeps()
    const row = makeRow({ allowedPartySize: 10 })
    ;(row.wedding as Record<string, unknown>)['partySizeEnabled'] = true
    ;(row.wedding as Record<string, unknown>)['maxPartySize'] = 4
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 4 }, d)
    expect(r!.confirmedPartySize).toBe(4)
  })
})
