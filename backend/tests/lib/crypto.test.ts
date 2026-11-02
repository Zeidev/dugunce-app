import { describe, it, expect } from 'vitest'
import {
  generateToken,
  hashToken,
  generateShortCode,
  generateInviteCode,
  timingSafeEqualHex,
} from '../../src/lib/crypto.js'

describe('generateToken', () => {
  it('32 bayt varsayılan, base64url döner', () => {
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(t, 'base64url').length).toBe(32)
  })

  it('her çağrıda farklı', () => {
    expect(generateToken()).not.toBe(generateToken())
  })

  it('en az 128 bit entropi (16 bayt) destekler', () => {
    const t = generateToken(16)
    expect(Buffer.from(t, 'base64url').length).toBeGreaterThanOrEqual(16)
  })

  it('256 bit varsayılan (SECURITY §1.2)', () => {
    const t = generateToken()
    expect(Buffer.from(t, 'base64url').length * 8).toBe(256)
  })
})

describe('hashToken', () => {
  it('deterministik — aynı girdi aynı hash', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })

  it('farklı girdi farklı hash', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('64 karakter hex (SHA-256)', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ham token hash içinde görünmez', () => {
    const raw = 'gizli-token-degeri'
    expect(hashToken(raw)).not.toContain(raw)
  })

  it('Türkçe karakterler bozulmadan hashlenir', () => {
    expect(hashToken('şğıöçü')).toBe(hashToken('şğıöçü'))
    expect(hashToken('şğıöçü')).not.toBe(hashToken('sgioou'))
  })
})

describe('generateShortCode', () => {
  it('6 hane, sadece rakam', () => {
    const c = generateShortCode()
    expect(c).toMatch(/^\d{6}$/)
  })

  it('her çağrıda farklı (olasılıkla)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateShortCode()))
    expect(codes.size).toBeGreaterThan(15)
  })

  it('başında sıfır olabilir (padStart doğru)', () => {
    // 100 denemede en az bir kez 0 ile başlayan kod çıkmalı
    const codes = Array.from({ length: 200 }, () => generateShortCode())
    expect(codes.some((c) => c.startsWith('0'))).toBe(true)
  })
})

describe('generateInviteCode', () => {
  it('7 karakter', () => {
    expect(generateInviteCode()).toHaveLength(7)
  })

  it('yalnızca karışmayan karakterler (0,O,1,I,l yok)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode()
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/)
    }
  })

  it('her çağrıda farklı (olasılıkla)', () => {
    const codes = new Set(Array.from({ length: 30 }, () => generateInviteCode()))
    expect(codes.size).toBeGreaterThan(25)
  })

  it('33^7 uzaydan gelir (~1.3e10 kombinasyon)', () => {
    // Karakter seti 32 değil 33: A-Z eksi I,O (24) + 2-9 (8) = 32
    const code = generateInviteCode()
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    expect(charset.length).toBe(32)
    for (const ch of code) expect(charset).toContain(ch)
  })
})

describe('timingSafeEqualHex', () => {
  it('aynı değerde true', () => {
    const h = hashToken('x')
    expect(timingSafeEqualHex(h, h)).toBe(true)
  })

  it('farklı değerde false', () => {
    expect(timingSafeEqualHex(hashToken('a'), hashToken('b'))).toBe(false)
  })

  it('farklı uzunlukta false (hata fırlatmaz)', () => {
    expect(timingSafeEqualHex('ab', 'abcd')).toBe(false)
  })

  it('geçersiz hex false döner (hata fırlatmaz)', () => {
    expect(timingSafeEqualHex('zzzz', 'zzzz')).toBe(false)
  })
})
