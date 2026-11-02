import { describe, it, expect } from 'vitest'
import { loadEnv } from '../../src/config/env.js'

const validSource = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/d',
  JWT_SECRET: 'a'.repeat(32),
  NODE_ENV: 'test',
}

describe('loadEnv', () => {
  it('geçerli ortamda Env döner', () => {
    const env = loadEnv(validSource)
    expect(env.NODE_ENV).toBe('test')
    expect(env.DATABASE_URL).toContain('postgres://')
  })

  it('PORT verilmezse varsayılan 3000 kullanır', () => {
    const env = loadEnv(validSource)
    expect(env.PORT).toBe(3000)
  })

  it('PORT verilirse sayıya çevirir', () => {
    const env = loadEnv({ ...validSource, PORT: '8080' })
    expect(env.PORT).toBe(8080)
  })

  it('eksik JWT_SECRET fırlatır', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/d', NODE_ENV: 'test' }),
    ).toThrow(/JWT_SECRET/)
  })

  it('kısa JWT_SECRET reddedilir', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgres://u:p@localhost:5432/d',
        JWT_SECRET: 'kisa',
        NODE_ENV: 'test',
      }),
    ).toThrow(/JWT_SECRET/)
  })

  it('eksik DATABASE_URL fırlatır', () => {
    expect(() =>
      loadEnv({ JWT_SECRET: 'a'.repeat(32), NODE_ENV: 'test' }),
    ).toThrow(/DATABASE_URL/)
  })

  it('geçersiz NODE_ENV reddedilir', () => {
    expect(() =>
      loadEnv({ ...validSource, NODE_ENV: 'staging' }),
    ).toThrow(/NODE_ENV/)
  })

  it('Türkçe karakterli DATABASE_URL bozulmaz', () => {
    const env = loadEnv({
      ...validSource,
      DATABASE_URL: 'postgres://u:p@localhost:5432/d?application_name=şğü',
    })
    expect(env.DATABASE_URL).toContain('şğü')
  })

  it('hata mesajı hangi alanın eksik olduğunu söyler', () => {
    try {
      loadEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/d', NODE_ENV: 'test' })
      expect.fail('hata bekleniyordu')
    } catch (err) {
      expect(String(err)).toContain('JWT_SECRET')
      // Secret değeri hata mesajına sızmamalı
      expect(String(err)).not.toContain('a'.repeat(32))
    }
  })
})
