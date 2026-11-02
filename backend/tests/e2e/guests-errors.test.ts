import { describe, it, expect } from 'vitest'
import { toHttpError as guestsHttpError } from '../../src/routes/guests.js'
import { toHttpError as invitationsHttpError } from '../../src/routes/invitations.js'
import { AppError } from '../../src/lib/errors.js'
import { GuestLimitError } from '../../src/guests/service.js'
import { RsvpError, RsvpClosedError } from '../../src/guests/rsvp.js'
import { PartySizeError } from '../../src/guests/invitation.js'

/**
 * Hata → HTTP eşlemesi (plan Task 8 tablosu).
 *
 * Eşleme fonksiyonları doğrudan test edilir: HTTP üzerinden test etmek
 * auth katmanını da geçmeyi gerektirir ve asıl soruyu (hangi hata hangi
 * koda gider) bulanıklaştırır.
 */

describe('çift tarafı hata eşlemesi', () => {
  it('GuestLimitError → 403 LIMIT_REACHED', () => {
    const out = guestsHttpError(new GuestLimitError(30, 30, 1)) as AppError
    expect(out).toBeInstanceOf(AppError)
    expect(out.statusCode).toBe(403)
    expect(out.code).toBe('LIMIT_REACHED')
  })

  it('GuestLimitError → limit bilgisi details içinde', () => {
    const out = guestsHttpError(new GuestLimitError(30, 28, 5)) as AppError & {
      details?: Record<string, unknown>
    }
    expect(out.details).toEqual({ limit: 30, current: 28, requested: 5 })
  })

  it('PartySizeError → 422', () => {
    const out = guestsHttpError(new PartySizeError('1-10 arası')) as AppError
    expect(out.statusCode).toBe(422)
  })

  it('geçersiz girdi → 400', () => {
    const out = guestsHttpError(new Error('Geçersiz telefon numarası')) as AppError
    expect(out.statusCode).toBe(400)
  })

  it('"zorunlu" mesajı → 400', () => {
    const out = guestsHttpError(new Error('İsim zorunlu')) as AppError
    expect(out.statusCode).toBe(400)
  })

  it('"en fazla" mesajı → 400', () => {
    const out = guestsHttpError(new Error('Tek seferde en fazla 100 davetli')) as AppError
    expect(out.statusCode).toBe(400)
  })

  it('rsvp bu uçtan değiştirilemez → 400', () => {
    const out = guestsHttpError(
      new Error('RSVP durumu bu uçtan değiştirilemez'),
    ) as AppError
    expect(out.statusCode).toBe(400)
  })

  it('silinmiş davetli → 409', () => {
    const out = guestsHttpError(new Error('Silinmiş davetliye davetiye üretilemez')) as AppError
    expect(out.statusCode).toBe(409)
  })

  it('bilinmeyen hata olduğu gibi geçer (500)', () => {
    const original = new Error('beklenmeyen')
    expect(guestsHttpError(original)).toBe(original)
  })
})

describe('davetli tarafı hata eşlemesi', () => {
  it('RsvpClosedError → 410 GONE', () => {
    const out = invitationsHttpError(new RsvpClosedError()) as AppError
    expect(out.statusCode).toBe(410)
    expect(out.code).toBe('GONE')
  })

  it('RsvpError → 422', () => {
    const out = invitationsHttpError(new RsvpError('Kişi sayısı en az 1')) as AppError
    expect(out.statusCode).toBe(422)
  })

  it('izin aşımı mesajı → 422', () => {
    const out = invitationsHttpError(new RsvpError('En fazla 4 kişi')) as AppError
    expect(out.statusCode).toBe(422)
  })

  it('bilinmeyen hata olduğu gibi geçer', () => {
    const original = new Error('db patladı')
    expect(invitationsHttpError(original)).toBe(original)
  })
})

describe('AppError yardımcıları', () => {
  it('gone 410', () => {
    expect(AppError.gone().statusCode).toBe(410)
  })

  it('unprocessable 422', () => {
    expect(AppError.unprocessable().statusCode).toBe(422)
  })

  it('limitReached 403 + details', () => {
    const e = AppError.limitReached('dolu', { limit: 30 }) as AppError & {
      details?: Record<string, unknown>
    }
    expect(e.statusCode).toBe(403)
    expect(e.details).toEqual({ limit: 30 })
  })
})
