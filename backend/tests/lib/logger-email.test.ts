/**
 * E-posta maskeleme — KVKK.
 *
 * E-posta adresi kişisel veridir. Hata mesajları Drizzle'ın ürettiği
 * SQL'i taşıyor ve parametreler arasında e-posta düz metin geçiyor
 * (gözle görüldü: "params: lumibyte.dev@gmail.com,1").
 *
 * Maskeleme kısmi olmalı: log'da hangi kullanıcı olduğu anlaşılabilsin
 * ama tam adres görünmesin.
 */

import { describe, it, expect } from 'vitest'
import { scrubText } from '../../src/lib/logger.js'

describe('scrubText — e-posta maskeleme', () => {
  it('düz e-posta maskelenir', () => {
    const out = scrubText('params: lumibyte.dev@gmail.com,1')
    expect(out).not.toContain('lumibyte.dev@gmail.com')
  })

  it('kısmi bilgi korunur (ilk 2 karakter + domain)', () => {
    const out = scrubText('kullanici@example.com')
    expect(out).toContain('ku')
    expect(out).toContain('@example.com')
  })

  it('birden fazla e-posta maskelenir', () => {
    const out = scrubText('a@x.com ve b@y.com')
    expect(out).not.toContain('a@x.com')
    expect(out).not.toContain('b@y.com')
  })

  it('SQL parametrelerindeki e-posta da maskelenir', () => {
    const sql = 'Failed query: select * from users where email = $1\nparams: test@test.local,1'
    const out = scrubText(sql)
    expect(out).not.toContain('test@test.local')
  })

  it('e-posta olmayan metin değişmez', () => {
    const msg = 'normal bir hata mesajı'
    expect(scrubText(msg)).toBe(msg)
  })
})
