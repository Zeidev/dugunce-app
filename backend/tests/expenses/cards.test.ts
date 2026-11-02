import { describe, it, expect } from 'vitest'
import { validateCardInput } from '../../src/expenses/cards.js'

/**
 * Kart güvenliği — spec §6b.5.
 *
 * "Tam kart numarası ASLA saklanmaz — sadece last_four"
 * "CVV, son kullanma tarihi saklanmaz"
 *
 * Bu testler, istemci yanlışlıkla tam kart bilgisi gönderirse isteğin
 * REDDEDİLDİĞİNİ kanıtlar. Sessizce yok saymak tehlikeli olurdu:
 * kullanıcı kart bilgisinin gönderildiğini sanmaz, ama loglara düşebilir.
 */
describe('kart girdisi — güvenlik', () => {
  it('yalnızca etiket kabul edilir', () => {
    const r = validateCardInput({ label: 'Ziraat ****1234' })
    expect(r.label).toBe('Ziraat ****1234')
    expect(r.lastFour).toBeUndefined()
  })

  it('son 4 hane kabul edilir', () => {
    const r = validateCardInput({ label: 'Ziraat', lastFour: '1234' })
    expect(r.lastFour).toBe('1234')
  })

  it('son 4 hane 4 rakam olmalı', () => {
    expect(() => validateCardInput({ label: 'X', lastFour: '123' })).toThrow(/4 rakam/)
    expect(() => validateCardInput({ label: 'X', lastFour: '12345' })).toThrow(/4 rakam/)
    expect(() => validateCardInput({ label: 'X', lastFour: 'abcd' })).toThrow(/4 rakam/)
  })

  it('TAM KART NUMARASI reddedilir', () => {
    expect(() =>
      validateCardInput({ label: 'X', number: '4111111111111111' }),
    ).toThrow(/saklanmaz/)
  })

  it('cardNumber alanı reddedilir', () => {
    expect(() =>
      validateCardInput({ label: 'X', cardNumber: '4111111111111111' }),
    ).toThrow(/saklanmaz/)
  })

  it('pan alanı reddedilir', () => {
    expect(() => validateCardInput({ label: 'X', pan: '4111' })).toThrow(/saklanmaz/)
  })

  it('CVV reddedilir', () => {
    expect(() => validateCardInput({ label: 'X', cvv: '123' })).toThrow(/saklanmaz/)
    expect(() => validateCardInput({ label: 'X', cvc: '123' })).toThrow(/saklanmaz/)
  })

  it('son kullanma tarihi reddedilir', () => {
    expect(() => validateCardInput({ label: 'X', expiry: '12/28' })).toThrow(/saklanmaz/)
    expect(() => validateCardInput({ label: 'X', expiryDate: '12/28' })).toThrow(/saklanmaz/)
  })

  it('etiketsiz kart reddedilir', () => {
    expect(() => validateCardInput({ lastFour: '1234' })).toThrow()
  })

  it('boş etiket reddedilir', () => {
    expect(() => validateCardInput({ label: '   ' })).toThrow()
  })

  it('hesap kesim günü 1-31', () => {
    expect(validateCardInput({ label: 'X', statementDay: 15 }).statementDay).toBe(15)
    expect(() => validateCardInput({ label: 'X', statementDay: 0 })).toThrow()
    expect(() => validateCardInput({ label: 'X', statementDay: 32 })).toThrow()
  })

  it('banka adı opsiyonel', () => {
    const r = validateCardInput({ label: 'X', bankName: 'Ziraat' })
    expect(r.bankName).toBe('Ziraat')
  })

  it('isActive varsayılan true', () => {
    const r = validateCardInput({ label: 'X' })
    expect(r.isActive).toBeUndefined() // varsayılan depo katmanında
  })

  it('güvenlik mesajı kullanıcıya ne yapacağını söyler', () => {
    try {
      validateCardInput({ label: 'X', number: '4111' })
      expect.fail('hata beklenirdi')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('saklanmaz')
      expect(msg).toContain('son 4 hane')
    }
  })
})
