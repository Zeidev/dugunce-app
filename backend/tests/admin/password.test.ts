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
