import { describe, it, expect, vi } from 'vitest'
import {
  validateGuestInput,
  normalizePhone,
  createGuest,
  listGuests,
  updateGuest,
  deleteGuest,
} from '../../src/guests/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    insertGuest: vi.fn().mockResolvedValue({ id: 'g1', name: 'Ayşe', rsvp: 'PENDING' }),
    insertGuests: vi.fn().mockResolvedValue([]),
    listByWedding: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 'g1', name: 'Ayşe' }),
    updateGuest: vi.fn().mockResolvedValue({ id: 'g1' }),
    softDelete: vi.fn().mockResolvedValue(true),
    revokeInvitations: vi.fn().mockResolvedValue(0),
    countActiveGuests: vi.fn().mockResolvedValue(0),
    getPlan: vi.fn().mockResolvedValue('FREE'),
    ...overrides,
  }
}

describe('normalizePhone', () => {
  it('Türk numarasını E.164 yapar', () => {
    expect(normalizePhone('0532 123 45 67')).toBe('+905321234567')
  })

  it('boşluk ve tireyi temizler', () => {
    expect(normalizePhone('0532-123-45-67')).toBe('+905321234567')
  })

  it('zaten E.164 ise dokunmaz', () => {
    expect(normalizePhone('+905321234567')).toBe('+905321234567')
  })

  it('905... ile başlayanı + ile normalize eder', () => {
    expect(normalizePhone('905321234567')).toBe('+905321234567')
  })

  it('parantezleri temizler', () => {
    expect(normalizePhone('(0532) 123 45 67')).toBe('+905321234567')
  })

  it('boş string null döner', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })

  it('null/undefined null döner', () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('geçersiz numara hata fırlatır', () => {
    expect(() => normalizePhone('123')).toThrow(/telefon/i)
  })

  it('harf içeren numara reddedilir', () => {
    expect(() => normalizePhone('0532abc4567')).toThrow(/telefon/i)
  })
})

describe('validateGuestInput', () => {
  it('isim zorunlu', () => {
    // NOT: /isim/i Türkçe 'İ' (U+0130) ile eşleşmez — toLowerCase onu
    // 'i' + U+0307 üretir. Bu yüzden 'zorunlu' ile eşleşiyoruz.
    expect(() => validateGuestInput({ name: '' })).toThrow(/zorunlu/i)
  })

  it('isim 100 karakteri aşamaz', () => {
    expect(() => validateGuestInput({ name: 'a'.repeat(101) })).toThrow(/100/)
  })

  it('isim boşlukları kırpılır', () => {
    expect(validateGuestInput({ name: '  Ayşe  ' }).name).toBe('Ayşe')
  })

  it('Türkçe karakterler korunur', () => {
    expect(validateGuestInput({ name: 'Şükrü Çağrı' }).name).toBe('Şükrü Çağrı')
  })

  it('telefon normalize edilir', () => {
    expect(validateGuestInput({ name: 'A', phone: '0532 123 45 67' }).phone).toBe('+905321234567')
  })

  it('telefon opsiyonel — boş davetli kabul edilir', () => {
    expect(validateGuestInput({ name: 'A' }).phone).toBeUndefined()
  })

  it('side varsayılan BRIDE', () => {
    expect(validateGuestInput({ name: 'A' }).side).toBe('BRIDE')
  })

  it('side GROOM kabul edilir', () => {
    expect(validateGuestInput({ name: 'A', side: 'GROOM' }).side).toBe('GROOM')
  })

  it('side SHARED reddedilir — davetli bir tarafa aittir', () => {
    expect(() => validateGuestInput({ name: 'A', side: 'SHARED' })).toThrow()
  })

  it('not 500 karakteri aşamaz', () => {
    expect(() => validateGuestInput({ name: 'A', note: 'x'.repeat(501) })).toThrow(/500/)
  })

  it('rsvp alanı girdi olarak KABUL EDİLMEZ (ayrı yol)', () => {
    const out = validateGuestInput({ name: 'A', rsvp: 'ATTENDING' })
    expect(out).not.toHaveProperty('rsvp')
  })
})

describe('createGuest', () => {
  it('davetliyi oluşturur', async () => {
    const d = makeDeps()
    const g = await createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d)
    expect(g.id).toBe('g1')
    expect(d.insertGuest).toHaveBeenCalled()
  })

  it('transaction içinde çalışır', async () => {
    const d = makeDeps()
    await createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d)
    expect(d.transaction).toHaveBeenCalled()
  })

  it('weddingId store\'a geçer', async () => {
    const d = makeDeps()
    await createGuest({ weddingId: 'w1', userId: 'u1', input: { name: 'Ayşe' } }, d)
    const written = d.insertGuest.mock.calls[0]![0] as Record<string, unknown>
    expect(written['weddingId']).toBe('w1')
  })

  it('geçersiz girdi hata fırlatır, yazma yapılmaz', async () => {
    const d = makeDeps()
    await expect(
      createGuest({ weddingId: 'w1', userId: 'u1', input: { name: '' } }, d),
    ).rejects.toThrow(/zorunlu/i)
    expect(d.insertGuest).not.toHaveBeenCalled()
  })
})

describe('listGuests', () => {
  it('sorgu weddingId + userId ile (IDOR)', async () => {
    const d = makeDeps()
    await listGuests({ weddingId: 'w1', userId: 'u1' }, d)
    expect(d.listByWedding).toHaveBeenCalledWith('w1', 'u1', expect.anything())
  })

  it('silinmişler varsayılan gizli', async () => {
    const d = makeDeps()
    await listGuests({ weddingId: 'w1', userId: 'u1' }, d)
    const opts = d.listByWedding.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['includeDeleted']).toBeFalsy()
  })

  it('includeDeleted=true iletilir', async () => {
    const d = makeDeps()
    await listGuests({ weddingId: 'w1', userId: 'u1', includeDeleted: true }, d)
    const opts = d.listByWedding.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['includeDeleted']).toBe(true)
  })

  it('taraf filtresi iletilir', async () => {
    const d = makeDeps()
    await listGuests({ weddingId: 'w1', userId: 'u1', side: 'GROOM' }, d)
    const opts = d.listByWedding.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['side']).toBe('GROOM')
  })

  it('geçersiz taraf filtresi reddedilir', async () => {
    const d = makeDeps()
    await expect(
      listGuests({ weddingId: 'w1', userId: 'u1', side: 'SHARED' as never }, d),
    ).rejects.toThrow()
  })

  it('RSVP filtresi iletilir', async () => {
    const d = makeDeps()
    await listGuests({ weddingId: 'w1', userId: 'u1', rsvp: 'ATTENDING' }, d)
    const opts = d.listByWedding.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['rsvp']).toBe('ATTENDING')
  })
})

describe('updateGuest', () => {
  it('alanları günceller', async () => {
    const d = makeDeps()
    await updateGuest({ weddingId: 'w1', userId: 'u1', guestId: 'g1', patch: { name: 'Fatma' } }, d)
    expect(d.updateGuest).toHaveBeenCalled()
  })

  it('üye olunmayan davetli null döner (404)', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await updateGuest({ weddingId: 'w1', userId: 'yabanci', guestId: 'g1', patch: { name: 'X' } }, d)
    expect(r).toBeNull()
    expect(d.updateGuest).not.toHaveBeenCalled()
  })

  it('boş patch hata fırlatır', async () => {
    const d = makeDeps()
    await expect(
      updateGuest({ weddingId: 'w1', userId: 'u1', guestId: 'g1', patch: {} }, d),
    ).rejects.toThrow(/boş/i)
  })

  it('rsvp alanı bu yoldan değiştirilemez — açık hata verir', async () => {
    // Sessizce yutmak yanıltıcı olurdu: istemci "güncelledim" sanar,
    // davetiye tarafı (confirmed_party_size) eski kalır.
    const d = makeDeps()
    await expect(
      updateGuest({ weddingId: 'w1', userId: 'u1', guestId: 'g1', patch: { rsvp: 'ATTENDING' } }, d),
    ).rejects.toThrow(/rsvp/i)
    expect(d.updateGuest).not.toHaveBeenCalled()
  })

  it('rsvp ile birlikte geçerli alan gelirse de reddedilir', async () => {
    const d = makeDeps()
    await expect(
      updateGuest(
        { weddingId: 'w1', userId: 'u1', guestId: 'g1', patch: { name: 'Yeni', rsvp: 'ATTENDING' } },
        d,
      ),
    ).rejects.toThrow(/rsvp/i)
  })
})

describe('deleteGuest', () => {
  it('soft delete çağırır', async () => {
    const d = makeDeps()
    const ok = await deleteGuest({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    expect(ok).toBe(true)
    expect(d.softDelete).toHaveBeenCalledWith('g1')
  })

  it('üye olunmayan davetli silinemez', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const ok = await deleteGuest({ weddingId: 'w1', userId: 'yabanci', guestId: 'g1' }, d)
    expect(ok).toBe(false)
    expect(d.softDelete).not.toHaveBeenCalled()
  })

  it('silinince davetiye token\'ları revoke edilir (Review Focus #5)', async () => {
    const d = makeDeps()
    await deleteGuest({ weddingId: 'w1', userId: 'u1', guestId: 'g1' }, d)
    expect(d.revokeInvitations).toHaveBeenCalledWith('g1')
  })
})
