import { describe, it, expect } from 'vitest'
import {
  toKurus,
  toTl,
  formatTl,
  splitKurus,
  sumKurus,
  addKurus,
  MAX_INSTALLMENTS,
} from '../../src/money/money.js'

describe('toKurus', () => {
  it('tam sayı TL → kuruş', () => {
    expect(toKurus('12000')).toBe(1_200_000n)
    expect(toKurus(12000)).toBe(1_200_000n)
  })

  it('ondalıklı TL → kuruş', () => {
    expect(toKurus('12000.50')).toBe(1_200_050n)
    expect(toKurus('0.01')).toBe(1n)
    expect(toKurus('0.99')).toBe(99n)
  })

  it('tek ondalık basamak', () => {
    expect(toKurus('10.5')).toBe(1050n)
  })

  it('binlik ayraçlı string kabul edilir', () => {
    expect(toKurus('12.000,50')).toBe(1_200_050n)
    expect(toKurus('1.234.567,89')).toBe(123_456_789n)
  })

  it('negatif değer reddedilir', () => {
    expect(() => toKurus('-5')).toThrow()
  })

  it('geçersiz string reddedilir', () => {
    expect(() => toKurus('abc')).toThrow()
    expect(() => toKurus('')).toThrow()
    expect(() => toKurus('  ')).toThrow()
  })

  it('ikiden fazla ondalık basamak reddedilir', () => {
    expect(() => toKurus('10.123')).toThrow()
  })

  it('float hatası yok — 0.1 + 0.2 = 0.3', () => {
    expect(addKurus(toKurus('0.1'), toKurus('0.2'))).toBe(toKurus('0.3'))
  })

  it('büyük değer desteklenir', () => {
    expect(toKurus('9999999999.99')).toBe(999_999_999_999n)
  })
})

describe('toTl', () => {
  it('kuruş → TL string', () => {
    expect(toTl(1_200_050n)).toBe('12000.50')
    expect(toTl(1n)).toBe('0.01')
    expect(toTl(0n)).toBe('0.00')
  })

  it('gidiş-dönüş kayıpsız', () => {
    for (const s of ['0.01', '1.00', '99.99', '12000.50']) {
      expect(toTl(toKurus(s))).toBe(s)
    }
  })
})

describe('formatTl', () => {
  it('Türkçe format — binlik nokta, ondalık virgül', () => {
    expect(formatTl(1_200_050n)).toBe('12.000,50 TL')
    expect(formatTl(1n)).toBe('0,01 TL')
    expect(formatTl(0n)).toBe('0,00 TL')
  })

  it('büyük tutar', () => {
    expect(formatTl(50_000_000n)).toBe('500.000,00 TL')
  })

  it('milyon', () => {
    expect(formatTl(123_456_789n)).toBe('1.234.567,89 TL')
  })
})

describe('splitKurus — eşit bölme, kalanı sona', () => {
  it('tam bölünen', () => {
    expect(splitKurus(1_200_000n, 4)).toEqual([300_000n, 300_000n, 300_000n, 300_000n])
  })

  it('kalan son taksite eklenir (Review Focus #1)', () => {
    expect(splitKurus(10_000n, 3)).toEqual([3_333n, 3_333n, 3_334n])
  })

  it('toplam her zaman korunur', () => {
    for (const total of [1n, 7n, 100n, 10_000n, 123_457n, 999_999_999n]) {
      for (const parts of [1, 2, 3, 4, 6, 12, 36]) {
        expect(sumKurus(splitKurus(total, parts))).toBe(total)
      }
    }
  })

  it('1 kuruş / 12 taksit', () => {
    const r = splitKurus(1n, 12)
    expect(r).toHaveLength(12)
    expect(sumKurus(r)).toBe(1n)
  })

  it('parça sayısı 0 veya negatif → hata', () => {
    expect(() => splitKurus(100n, 0)).toThrow()
    expect(() => splitKurus(100n, -1)).toThrow()
  })

  it('taksit sayısı üst sınırı', () => {
    expect(MAX_INSTALLMENTS).toBe(36)
    expect(() => splitKurus(1000n, 37)).toThrow()
    expect(splitKurus(1000n, 36)).toHaveLength(36)
  })

  it('negatif tutar reddedilir', () => {
    expect(() => splitKurus(-100n, 2)).toThrow()
  })
})

describe('sumKurus', () => {
  it('boş dizi → 0', () => {
    expect(sumKurus([])).toBe(0n)
  })
  it('toplar', () => {
    expect(sumKurus([1n, 2n, 3n])).toBe(6n)
  })
})
