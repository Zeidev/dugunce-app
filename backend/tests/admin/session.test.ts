import { describe, it, expect } from 'vitest'
import {
  readCookie,
  sessionCookie,
  csrfCookie,
  clearSessionCookies,
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  SESSION_SLIDE_THRESHOLD_MS,
} from '../../src/admin/session.js'

/**
 * Admin çerez yardımcıları — güvenlik açısından kritik.
 *
 * `readCookie` yanlış ayrıştırırsa oturum hiç açılmaz veya YANLIŞ
 * çerez okunur. `sessionCookie` HttpOnly'yi düşürürse token JS'ten
 * okunabilir hâle gelir (XSS).
 */

const base = { secure: false, path: '/api/v1/admin' }

describe('readCookie', () => {
  it('tek cerezi okur', () => {
    expect(readCookie('a_session=abc', ADMIN_SESSION_COOKIE)).toBe('abc')
  })

  it('coklu cerez arasindan dogru olani secer', () => {
    const header = 'x=1; a_session=abc; y=2'
    expect(readCookie(header, ADMIN_SESSION_COOKIE)).toBe('abc')
  })

  it('sira bagimsiz', () => {
    expect(readCookie('a_session=abc; other=1', ADMIN_SESSION_COOKIE)).toBe('abc')
    expect(readCookie('other=1; a_session=abc', ADMIN_SESSION_COOKIE)).toBe('abc')
  })

  it('olmayan cerez null doner', () => {
    expect(readCookie('other=1', ADMIN_SESSION_COOKIE)).toBeNull()
    expect(readCookie(undefined, ADMIN_SESSION_COOKIE)).toBeNull()
    expect(readCookie('', ADMIN_SESSION_COOKIE)).toBeNull()
  })

  it('% kodlamasini cozer', () => {
    expect(readCookie('a_session=a%3Db%26c', ADMIN_SESSION_COOKIE)).toBe('a=b&c')
  })

  it('bos deger bos dize doner', () => {
    expect(readCookie('a_session=', ADMIN_SESSION_COOKIE)).toBe('')
  })

  it('on ek karisikligi YOK — a_session_x, a_session degildir', () => {
    expect(readCookie('a_session_x=kotu', ADMIN_SESSION_COOKIE)).toBeNull()
  })

  it('bozuk % kodlamasi patlamaz', () => {
    expect(() => readCookie('a_session=%E0%A4%A', ADMIN_SESSION_COOKIE)).not.toThrow()
  })
})

describe('sessionCookie — HttpOnly ZORUNLU', () => {
  it('HttpOnly icerir (token JS ten okunamaz)', () => {
    const c = sessionCookie('tok', 60, base)
    expect(c).toContain('HttpOnly')
  })

  it('dogru adi ve yolu kullanir', () => {
    const c = sessionCookie('tok', 60, base)
    expect(c.startsWith(`${ADMIN_SESSION_COOKIE}=tok`)).toBe(true)
    expect(c).toContain('Path=/api/v1/admin')
  })

  it('Max-Age yazilir', () => {
    expect(sessionCookie('tok', 1800, base)).toContain('Max-Age=1800')
  })

  it('secure=false iken Secure YOK, SameSite=Lax', () => {
    const c = sessionCookie('tok', 60, base)
    expect(c).not.toContain('Secure')
    expect(c).toContain('SameSite=Lax')
  })

  it('secure=true iken Secure + SameSite=None (cross-site)', () => {
    const c = sessionCookie('tok', 60, { ...base, secure: true })
    expect(c).toContain('Secure')
    expect(c).toContain('SameSite=None')
  })

  it('SameSite=None ASLA Secure olmadan uretilmez', () => {
    // Tarayıcı bu kombinasyonu reddeder; çerez hiç yazılmaz.
    const c = sessionCookie('tok', 60, base)
    expect(c).not.toContain('SameSite=None')
  })
})

describe('csrfCookie — JS OKUYABILMELI', () => {
  it('HttpOnly ICERMEZ (double-submit icin)', () => {
    expect(csrfCookie('c', 60, base)).not.toContain('HttpOnly')
  })

  it('dogru adi kullanir', () => {
    expect(csrfCookie('c', 60, base).startsWith(`${ADMIN_CSRF_COOKIE}=c`)).toBe(true)
  })
})

describe('clearSessionCookies', () => {
  it('iki cerezi de Max-Age=0 ile siler', () => {
    const cookies = clearSessionCookies(base)
    expect(cookies).toHaveLength(2)
    for (const c of cookies) expect(c).toContain('Max-Age=0')
  })
})

describe('oturum sureleri', () => {
  it('2FA yokken makul: 30 dk bos, 8 saat tavan', () => {
    expect(SESSION_IDLE_MS).toBe(30 * 60 * 1000)
    expect(SESSION_MAX_MS).toBe(8 * 60 * 60 * 1000)
  })

  it('kayan esik bosluk suresinden KISA olmali (yoksa hic uzamaz)', () => {
    expect(SESSION_SLIDE_THRESHOLD_MS).toBeLessThan(SESSION_IDLE_MS)
  })

  it('tavan bosluk suresinden uzun', () => {
    expect(SESSION_MAX_MS).toBeGreaterThan(SESSION_IDLE_MS)
  })
})
