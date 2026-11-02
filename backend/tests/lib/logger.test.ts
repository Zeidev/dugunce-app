import { describe, it, expect } from 'vitest'
import { Writable } from 'node:stream'
import pino from 'pino'
import { redact, scrubText } from '../../src/lib/logger.js'

/**
 * Pino'yu bir stream'e yazdırıp çıktıyı yakalar.
 * Gerçek logger'ın transport'unu (pino-pretty) atlar — test edilen
 * maskeleme mantığıdır, format değil.
 */
function captureLog(
  fn: (l: pino.Logger) => void,
  redactPaths: string[] = [
    'token', '*.token', 'password', '*.password', 'secret', '*.secret',
    'phone', '*.phone', 'email', '*.email', 'apiKey', '*.apiKey',
  ],
): string {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString())
      cb()
    },
  })
  const testLogger = pino(
    { level: 'debug', redact: { paths: redactPaths, censor: '[REDACTED]' } },
    stream,
  )
  fn(testLogger)
  return chunks.join('')
}

describe('logger maskeleme', () => {
  it('token maskelenir', () => {
    const out = captureLog((l) => l.info({ token: 'abc123secret' }, 'test'))
    expect(out).not.toContain('abc123secret')
    expect(out).toContain('[REDACTED]')
  })

  it('parola maskelenir', () => {
    const out = captureLog((l) => l.info({ password: 'gizliParola' }, 'test'))
    expect(out).not.toContain('gizliParola')
  })

  it('telefon maskelenir', () => {
    const out = captureLog((l) => l.info({ phone: '+905551112233' }, 'test'))
    expect(out).not.toContain('+905551112233')
  })

  it('e-posta maskelenir', () => {
    const out = captureLog((l) => l.info({ email: 'kisi@ornek.com' }, 'test'))
    expect(out).not.toContain('kisi@ornek.com')
  })

  it('iç içe token maskelenir', () => {
    const out = captureLog((l) => l.info({ auth: { token: 'nested-secret-xyz' } }, 'test'))
    expect(out).not.toContain('nested-secret-xyz')
  })
})

describe('scrubText', () => {
  it('postgres bağlantı dizesini maskeler', () => {
    const out = scrubText('bağlantı hatası: postgres://user:pass@host:5432/db')
    expect(out).not.toContain('user:pass')
    expect(out).toContain('postgres://[REDACTED]')
  })

  it('postgresql:// varyantını da maskeler', () => {
    const out = scrubText('postgresql://u:p@h/d başarısız')
    expect(out).not.toContain('u:p@h')
  })

  it('Bearer token maskeler', () => {
    const out = scrubText('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(out).toContain('Bearer [REDACTED]')
  })

  it('masum metni değiştirmez', () => {
    const text = 'Düğün tarihi 12 Eylül 2026'
    expect(scrubText(text)).toBe(text)
  })
})

describe('redact', () => {
  it('Error mesajındaki bağlantı dizesini temizler', () => {
    const err = new Error('connect failed: postgres://u:p@host/db')
    const out = redact({ err }) as { err: { message: string } }
    expect(out.err.message).not.toContain('u:p@host')
    expect(out.err.message).toContain('[REDACTED]')
  })

  it('Error stack içindeki bağlantı dizesini temizler', () => {
    const err = new Error('postgres://u:p@host/db patladı')
    const out = redact({ err }) as { err: { stack?: string } }
    expect(out.err.stack ?? '').not.toContain('u:p@host')
  })

  it('message alanını da temizler', () => {
    const out = redact({ message: 'hata: postgres://u:p@h/d' }) as { message: string }
    expect(out.message).not.toContain('u:p@h')
  })

  it('hassas olmayan alanları korur', () => {
    const out = redact({ count: 42, name: 'test' })
    expect(out).toEqual({ count: 42, name: 'test' })
  })
})
