import { describe, it, expect } from 'vitest'
import { currentMonthIn, DEFAULT_TIMEZONE } from '../../src/lib/month.js'

/**
 * "Bu ay" hangi ay?
 *
 * NEDEN BU TEST:
 * Kullanıcı "Dashboard'da bu ay yazısı neyi gösteriyor" diye sordu.
 * İncelerken gerçek bir hata bulundu: ay `new Date().toISOString()
 * .slice(0,7)` ile hesaplanıyordu — bu UTC'ye çevirir. Türkiye UTC+3
 * olduğu için ayın ilk günü 00:00–03:00 arasında "bu ay" hâlâ ÖNCEKİ
 * ayı gösteriyordu. Ayın 1'inde sabah erkenden bütçe açan çift yanlış
 * ayın taksitlerini görüyordu.
 */
describe('currentMonthIn — saat dilimine göre ay', () => {
  it('UTC+3 te ayin ilk gunu 00:30 hala YENI ayi gosterir', () => {
    // 2026-11-01 00:30 İstanbul = 2026-10-31 21:30 UTC
    const d = new Date('2026-10-31T21:30:00Z')
    expect(currentMonthIn('Europe/Istanbul', d)).toBe('2026-11')
  })

  it('UTC te ayni an onceki aydir', () => {
    const d = new Date('2026-10-31T21:30:00Z')
    expect(currentMonthIn('UTC', d)).toBe('2026-10')
  })

  it('ayin son gunu gece yarisi gecince yeni ay', () => {
    // 2026-11-30 23:59 İstanbul → hâlâ Kasım
    const d = new Date('2026-11-30T20:59:00Z')
    expect(currentMonthIn('Europe/Istanbul', d)).toBe('2026-11')
    // 2026-12-01 00:01 İstanbul → Aralık
    const d2 = new Date('2026-11-30T21:01:00Z')
    expect(currentMonthIn('Europe/Istanbul', d2)).toBe('2026-12')
  })

  it('negatif ofsetli dilimler de dogru', () => {
    // 2026-11-01 10:00 New York = 2026-11-01 15:00 UTC → Kasım
    const d = new Date('2026-11-01T15:00:00Z')
    expect(currentMonthIn('America/New_York', d)).toBe('2026-11')
  })

  it('gecersiz saat dilimi varsayilana duser, patlamaz', () => {
    const d = new Date('2026-11-15T12:00:00Z')
    expect(currentMonthIn('Uydurma/Bolge', d)).toBe('2026-11')
    expect(DEFAULT_TIMEZONE).toBe('Europe/Istanbul')
  })

  it('bos saat dilimi varsayilana duser', () => {
    const d = new Date('2026-11-15T12:00:00Z')
    expect(currentMonthIn('', d)).toBe('2026-11')
    expect(currentMonthIn(null, d)).toBe('2026-11')
  })

  it('ay iki haneli ve sifir dolgulu', () => {
    const d = new Date('2026-01-15T12:00:00Z')
    expect(currentMonthIn('Europe/Istanbul', d)).toBe('2026-01')
  })
})
