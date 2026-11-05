import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  computeLockState,
  nextFailedState,
  MIN_ADMIN_PASSWORD_LENGTH,
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MS,
  lockDurationFor,
  MAX_LOCK_DURATION_MS,
} from '../../src/admin/service.js'

describe('parola hash', () => {
  it('argon2id hash uretir ve dogrular', async () => {
    const hash = await hashPassword('cok-guclu-BIR-parola-123')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toContain('cok-guclu')
    expect(await verifyPassword(hash, 'cok-guclu-BIR-parola-123')).toBe(true)
    expect(await verifyPassword(hash, 'yanlis')).toBe(false)
  })

  it('ayni parola iki farkli hash uretir (tuz)', async () => {
    const a = await hashPassword('ayni-parola-123456789')
    const b = await hashPassword('ayni-parola-123456789')
    expect(a).not.toBe(b)
  })
})

describe('parola guclulugu', () => {
  it('16 karakterden kisa reddedilir', () => {
    const r = validatePasswordStrength('kisa-Parola1')
    expect(r.ok).toBe(false)
    expect(MIN_ADMIN_PASSWORD_LENGTH).toBe(16)
  })

  it('harf olmadan reddedilir', () => {
    expect(validatePasswordStrength('1234567890123456').ok).toBe(false)
  })

  it('rakam olmadan reddedilir', () => {
    expect(validatePasswordStrength('abcdefghijklmnop').ok).toBe(false)
  })

  it('16 karakter + harf + rakam kabul edilir', () => {
    expect(validatePasswordStrength('guclu-parola-123').ok).toBe(true)
  })
})

describe('hesap kilidi', () => {
  it('kilit yoksa OK', () => {
    expect(computeLockState({ failedAttempts: 0, lockedUntil: null })).toBe('OK')
  })

  it('kilit suresi gecmemisse LOCKED', () => {
    const future = new Date(Date.now() + 60_000)
    expect(computeLockState({ failedAttempts: 5, lockedUntil: future })).toBe('LOCKED')
  })

  it('kilit suresi gecmisse OK', () => {
    const past = new Date(Date.now() - 60_000)
    expect(computeLockState({ failedAttempts: 5, lockedUntil: past })).toBe('OK')
  })

  it('5. hatada kilit devreye girer', () => {
    let state = { failedAttempts: 0, lockedUntil: null as Date | null }
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      state = nextFailedState(state.failedAttempts)
      expect(state.lockedUntil).toBeNull()
    }
    state = nextFailedState(state.failedAttempts)
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS)
    expect(state.lockedUntil).not.toBeNull()
    // 15 dakika sonrası
    const delta = state.lockedUntil!.getTime() - Date.now()
    expect(delta).toBeGreaterThan(LOCK_DURATION_MS - 5000)
    expect(delta).toBeLessThanOrEqual(LOCK_DURATION_MS)
  })
})

describe('Turkce karakter normalizasyonu (gercek hata)', () => {
  it('NFC ve NFD yazilmis AYNI parola dogrulanir', async () => {
    // "şifre" iki şekilde yazılabilir: tek kod noktası (U+015F) veya
    // "s" + birleşik çengel. Ekranda aynı, baytlarda farklı.
    const nfc = 'şifre-parola-123'
    const nfd = 's\u0327ifre-parola-123'
    expect(nfc).not.toBe(nfd)          // gerçekten farklı baytlar
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC'))

    const hash = await hashPassword(nfc)
    expect(await verifyPassword(hash, nfd)).toBe(true)
    expect(await verifyPassword(hash, nfc)).toBe(true)
  })
})

describe('kilit sonrasi kalici kilitlenme (gercek hata)', () => {
  it('kilit dolduktan sonra TEK hata sayaci sifirlar, yeniden kilitlemez', () => {
    // 1. Kilit doldu, sayaç 5'te kaldı
    const afterLockExpired = 5
    // 2. Tek hatalı deneme
    const next = nextFailedState(afterLockExpired)
    // 3. Sayaç 1'e dönmeli, kilit YOK
    expect(next.failedAttempts).toBe(1)
    expect(next.lockedUntil).toBeNull()
  })

  it('kilit dolmadan sayac normal artar', () => {
    expect(nextFailedState(0)).toMatchObject({ failedAttempts: 1, lockedUntil: null })
    expect(nextFailedState(1)).toMatchObject({ failedAttempts: 2, lockedUntil: null })
    expect(nextFailedState(3)).toMatchObject({ failedAttempts: 4, lockedUntil: null })
  })

  it('besinci hatada hala kilitlenir', () => {
    const r = nextFailedState(4)
    expect(r.failedAttempts).toBe(5)
    expect(r.lockedUntil).not.toBeNull()
  })
})

describe('ustel kilit — DoS korumasi', () => {
  it('ilk kilit 15 dk', () => {
    expect(lockDurationFor(0)).toBe(15 * 60 * 1000)
  })

  it('ikinci kilit 30 dk, ucuncu 60 dk (ustel)', () => {
    expect(lockDurationFor(1)).toBe(30 * 60 * 1000)
    expect(lockDurationFor(2)).toBe(60 * 60 * 1000)
    expect(lockDurationFor(3)).toBe(120 * 60 * 1000)
  })

  it('tavan 24 saat — sonsuz buyumez', () => {
    expect(lockDurationFor(10)).toBe(MAX_LOCK_DURATION_MS)
    expect(lockDurationFor(100)).toBe(MAX_LOCK_DURATION_MS)
    expect(lockDurationFor(1e9)).toBe(MAX_LOCK_DURATION_MS)
  })

  it('negatif sayac ilk kilit gibi davranir', () => {
    expect(lockDurationFor(-5)).toBe(15 * 60 * 1000)
  })

  it('nextFailedState lockoutCount u artirir', () => {
    const r = nextFailedState(4, new Date(), 2)
    expect(r.lockoutCount).toBe(3)
    expect(r.lockedUntil).not.toBeNull()
  })

  it('kilit dolmadan lockoutCount DEGISMEZ', () => {
    const r = nextFailedState(1, new Date(), 3)
    expect(r.lockoutCount).toBe(3)
    expect(r.lockedUntil).toBeNull()
  })
})
