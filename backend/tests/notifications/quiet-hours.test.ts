import { describe, it, expect } from 'vitest'
import { shouldSendNow } from '../../src/notifications/quiet-hours.js'

/**
 * Sessiz saat — spec §6b.3.
 *
 * NEDEN SAF FONKSİYON TESTİ: `shouldSendNow` `Date.now()` ÇAĞIRMIYOR;
 * an parametre olarak geliyor. Aksi hâlde "gece 03:00" senaryosu ancak
 * sistem saatini değiştirerek sınanabilirdi (kırılgan, CI'da
 * tekrarlanamaz).
 */

/** İstanbul saatiyle verilen an. Europe/Istanbul sabit UTC+3'tür (2016'dan beri). */
function istanbul(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 10, 5, hour - 3, minute))
}

const WEDDING = new Date('2026-12-01T18:00:00Z')

describe('shouldSendNow', () => {
  it('gündüz gönderir (14:00)', () => {
    expect(shouldSendNow(istanbul(14), WEDDING, false)).toBe(true)
  })

  it('21:59 gönderir — sessiz saat henüz başlamadı', () => {
    expect(shouldSendNow(istanbul(21, 59), WEDDING, false)).toBe(true)
  })

  it('22:00 sessiz saat BAŞLAR — göndermez', () => {
    expect(shouldSendNow(istanbul(22, 0), WEDDING, false)).toBe(false)
  })

  it('23:00 göndermez', () => {
    expect(shouldSendNow(istanbul(23), WEDDING, false)).toBe(false)
  })

  it('03:00 göndermez', () => {
    expect(shouldSendNow(istanbul(3), WEDDING, false)).toBe(false)
  })

  it('08:59 hâlâ sessiz — göndermez', () => {
    expect(shouldSendNow(istanbul(8, 59), WEDDING, false)).toBe(false)
  })

  it('09:00 sessizlik BİTER — gönderir', () => {
    expect(shouldSendNow(istanbul(9, 0), WEDDING, false)).toBe(true)
  })

  it('düğün öncesi hafta istisnası: 23:00 gönderir', () => {
    const now = istanbul(23)
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    expect(shouldSendNow(now, soon, false)).toBe(true)
  })

  it('düğün 8 gün sonraysa istisna YOK — 23:00 göndermez', () => {
    const now = istanbul(23)
    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(shouldSendNow(now, later, false)).toBe(false)
  })

  it('düğün GEÇMİŞSE istisna yok — 23:00 göndermez', () => {
    const now = istanbul(23)
    const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    expect(shouldSendNow(now, past, false)).toBe(false)
  })

  it('düğün tarihi null ise sessiz saat normal uygulanır', () => {
    expect(shouldSendNow(istanbul(23), null, false)).toBe(false)
    expect(shouldSendNow(istanbul(14), null, false)).toBe(true)
  })

  it('quietHoursOverride sessiz saati tamamen kapatır', () => {
    expect(shouldSendNow(istanbul(3), WEDDING, true)).toBe(true)
  })

  it('quietHoursOverride düğün geçmiş olsa da çalışır (kullanıcı tercihi üstün)', () => {
    const past = new Date(istanbul(3).getTime() - 30 * 24 * 60 * 60 * 1000)
    expect(shouldSendNow(istanbul(3), past, true)).toBe(true)
  })
})
