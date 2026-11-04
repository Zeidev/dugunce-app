/**
 * Yardımcı oturumu — birim testleri (SECURITY §1.2 #4).
 *
 * Kayan pencere, mutlak tavan, CSRF double-submit ve çerez biçimi.
 * Depo katmanı ayrı; burada davranış saf tutulur.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  openSession,
  loadSession,
  verifyCsrf,
  readCookie,
  sessionCookie,
  csrfCookie,
  clearSessionCookies,
  SESSION_TTL_MS,
  SESSION_MAX_MS,
  SESSION_SLIDE_THRESHOLD_MS,
  type SessionContext,
  type SessionDeps,
} from '../../src/helpers/session.js'

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

function ctx(over: Partial<SessionContext> = {}): SessionContext {
  const now = Date.now()
  return {
    sessionId: 's1',
    helperId: 'h1',
    weddingId: 'w1',
    displayName: 'Ayşe',
    coupleNames: 'A & B',
    csrfHash: sha('csrf'),
    createdAt: new Date(now - 60_000),
    expiresAt: new Date(now + SESSION_TTL_MS),
    ...over,
  }
}

function deps(over: Partial<SessionDeps> = {}): SessionDeps {
  return {
    insertSession: vi.fn().mockResolvedValue({ id: 's1' }),
    findByHash: vi.fn().mockResolvedValue(ctx()),
    touch: vi.fn().mockResolvedValue(undefined),
    deleteByHash: vi.fn().mockResolvedValue(true),
    deleteExpiredBefore: vi.fn().mockResolvedValue(0),
    ...over,
  } as SessionDeps
}

describe('openSession', () => {
  it('oturum ve CSRF AYRI, 256-bit (43 karakter) üretir', async () => {
    const d = deps()
    const s = await openSession({ id: 'h1', weddingId: 'w1' }, d)
    expect(s.session).toHaveLength(43)
    expect(s.csrf).toHaveLength(43)
    expect(s.session).not.toBe(s.csrf)
  })

  it('DB\'ye HAM değer yazmaz, SHA-256 yazar', async () => {
    const d = deps()
    const s = await openSession({ id: 'h1', weddingId: 'w1' }, d)
    const values = (d.insertSession as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      sessionHash: string
      csrfHash: string
    }
    expect(values.sessionHash).toBe(sha(s.session))
    expect(values.csrfHash).toBe(sha(s.csrf))
    expect(values.sessionHash).not.toBe(s.session)
  })

  it('varsayılan ömür 30 dakika', async () => {
    const now = 1_700_000_000_000
    const d = deps()
    const s = await openSession({ id: 'h1', weddingId: 'w1' }, d, now)
    expect(s.expiresAt.getTime()).toBe(now + SESSION_TTL_MS)
  })
})

describe('loadSession', () => {
  it('bilinmeyen oturum → null', async () => {
    const d = deps({ findByHash: vi.fn().mockResolvedValue(null) })
    expect(await loadSession('yok', d)).toBeNull()
  })

  it('boş değer → null (sorgu bile yapılmaz)', async () => {
    const d = deps()
    expect(await loadSession('', d)).toBeNull()
    expect(d.findByHash).not.toHaveBeenCalled()
  })

  it('süresi geçmiş oturum → null', async () => {
    const d = deps({ findByHash: vi.fn().mockResolvedValue(ctx({ expiresAt: new Date(Date.now() - 1000) })) })
    expect(await loadSession('x', d)).toBeNull()
  })

  it('mutlak tavan aşılmışsa → null (kayan pencere sonsuz olamaz)', async () => {
    const now = Date.now()
    const d = deps({
      findByHash: vi.fn().mockResolvedValue(
        ctx({
          createdAt: new Date(now - SESSION_MAX_MS - 1000),
          expiresAt: new Date(now + SESSION_TTL_MS), // süre yeni ama yaş tavanı aşmış
        }),
      ),
    })
    expect(await loadSession('x', d, now)).toBeNull()
  })

  it('kalan süre eşiğin altındaysa uzatır (kayan pencere)', async () => {
    const now = Date.now()
    const touch = vi.fn().mockResolvedValue(undefined)
    const d = deps({
      findByHash: vi
        .fn()
        .mockResolvedValue(
          ctx({ expiresAt: new Date(now + SESSION_SLIDE_THRESHOLD_MS - 60_000) }),
        ),
      touch,
    })
    const out = await loadSession('x', d, now)
    expect(out).not.toBeNull()
    expect(touch).toHaveBeenCalledTimes(1)
    const [, next] = touch.mock.calls[0] as [string, Date]
    expect(next.getTime()).toBe(now + SESSION_TTL_MS)
  })

  it('kalan süre yeterliyse YAZMAZ', async () => {
    const now = Date.now()
    const touch = vi.fn()
    const d = deps({
      findByHash: vi.fn().mockResolvedValue(ctx({ expiresAt: new Date(now + SESSION_TTL_MS) })),
      touch,
    })
    await loadSession('x', d, now)
    expect(touch).not.toHaveBeenCalled()
  })

  it('uzatma mutlak tavanı AŞAMAZ', async () => {
    const now = Date.now()
    const created = new Date(now - SESSION_MAX_MS + 5 * 60_000) // tavan 5 dk sonra
    const touch = vi.fn().mockResolvedValue(undefined)
    const d = deps({
      findByHash: vi.fn().mockResolvedValue(
        ctx({ createdAt: created, expiresAt: new Date(now + 60_000) }),
      ),
      touch,
    })
    await loadSession('x', d, now)
    const [, next] = touch.mock.calls[0] as [string, Date]
    expect(next.getTime()).toBe(created.getTime() + SESSION_MAX_MS)
  })

  // Çerez ömrü 30 dk. Kayan pencere veritabanında uzatılıyor ama
  // tarayıcıdaki çerez tazelenmezse 30 dk sonra siliniyor → kullanıcı,
  // oturum sunucuda geçerliyken "geçersiz bağlantı" görüyor.
  it('uzattığında renewed bayrağını işaretler', async () => {
    const now = Date.now()
    const d = deps({
      findByHash: vi
        .fn()
        .mockResolvedValue(
          ctx({ expiresAt: new Date(now + SESSION_SLIDE_THRESHOLD_MS - 60_000) }),
        ),
      touch: vi.fn().mockResolvedValue(undefined),
    })
    const out = await loadSession('x', d, now)
    expect(out?.renewed).toBe(true)
  })

  it('uzatmadığında renewed bayrağı YOK', async () => {
    const now = Date.now()
    const d = deps({
      findByHash: vi.fn().mockResolvedValue(ctx({ expiresAt: new Date(now + SESSION_TTL_MS) })),
      touch: vi.fn(),
    })
    const out = await loadSession('x', d, now)
    expect(out?.renewed).toBeUndefined()
  })
})

describe('verifyCsrf', () => {
  it('doğru değeri kabul eder', () => {
    expect(verifyCsrf('abc', sha('abc'))).toBe(true)
  })
  it('yanlış değeri reddeder', () => {
    expect(verifyCsrf('abd', sha('abc'))).toBe(false)
  })
  it('boş/eksik değeri reddeder', () => {
    expect(verifyCsrf(undefined, sha('abc'))).toBe(false)
    expect(verifyCsrf('', sha('abc'))).toBe(false)
  })
})

describe('readCookie', () => {
  it('birden fazla çerezden doğru olanı seçer', () => {
    expect(readCookie('a=1; h_session=xyz; b=2', 'h_session')).toBe('xyz')
  })
  it('yoksa null', () => {
    expect(readCookie('a=1', 'h_session')).toBeNull()
    expect(readCookie(undefined, 'h_session')).toBeNull()
  })
  it('yüzde kodlamayı çözer', () => {
    expect(readCookie('h_session=a%3Db', 'h_session')).toBe('a=b')
  })
})

describe('çerez biçimi', () => {
  it('üretimde Secure + SameSite=None (cross-site)', () => {
    const c = sessionCookie('v', 1800, { secure: true, path: '/api/v1/helper' })
    expect(c).toContain('Secure')
    expect(c).toContain('SameSite=None')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('Max-Age=1800')
  })

  it('geliştirmede Lax, Secure yok', () => {
    const c = sessionCookie('v', 1800, { secure: false, path: '/api/v1/helper' })
    expect(c).toContain('SameSite=Lax')
    expect(c).not.toContain('Secure')
  })

  it('CSRF çerezi HttpOnly DEĞİL (JS okuyabilmeli)', () => {
    const c = csrfCookie('v', 1800, { secure: true, path: '/api/v1/helper' })
    expect(c).not.toContain('HttpOnly')
  })

  it('temizleme Max-Age=0 gönderir', () => {
    const cs = clearSessionCookies({ secure: false, path: '/api/v1/helper' })
    expect(cs).toHaveLength(2)
    for (const c of cs) expect(c).toContain('Max-Age=0')
  })
})
