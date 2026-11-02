import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  users,
  refreshTokens,
  magicLinkTokens,
  weddings,
  weddingMembers,
  invites,
} from '../../src/db/schema.js'

function cols(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns
}
function col(table: Parameters<typeof getTableConfig>[0], name: string) {
  return cols(table).find((c) => c.name === name)
}

describe('users (mevcut, regresyon)', () => {
  it('email unique', () => {
    expect(col(users, 'email')?.isUnique).toBe(true)
  })
  it('email not null', () => {
    expect(col(users, 'email')?.notNull).toBe(true)
  })
})

describe('refresh_tokens', () => {
  it('token_hash var', () => {
    expect(col(refreshTokens, 'token_hash')).toBeDefined()
  })
  it('token_hash not null (ham token saklanmaz)', () => {
    expect(col(refreshTokens, 'token_hash')?.notNull).toBe(true)
  })
  it('revoked_at nullable', () => {
    expect(col(refreshTokens, 'revoked_at')?.notNull).toBe(false)
  })
  it('expires_at not null', () => {
    expect(col(refreshTokens, 'expires_at')?.notNull).toBe(true)
  })
  it('user_id FK var', () => {
    const cfg = getTableConfig(refreshTokens)
    expect(cfg.foreignKeys.some((fk) => fk.getName()?.includes('user'))).toBe(true)
  })
  it('token_hash üzerinde indeks var (arama hızlı)', () => {
    const cfg = getTableConfig(refreshTokens)
    expect(cfg.indexes.some((i) => i.config.name === 'refresh_tokens_hash_idx')).toBe(true)
  })
})

describe('magic_link_tokens', () => {
  it('token_hash not null', () => {
    expect(col(magicLinkTokens, 'token_hash')?.notNull).toBe(true)
  })
  it('short_code_hash nullable (token yolu yeterli olabilir)', () => {
    expect(col(magicLinkTokens, 'short_code_hash')?.notNull).toBe(false)
  })
  it('attempts default var', () => {
    expect(col(magicLinkTokens, 'attempts')?.hasDefault).toBe(true)
  })
  it('used_at nullable', () => {
    expect(col(magicLinkTokens, 'used_at')?.notNull).toBe(false)
  })
  it('expires_at not null', () => {
    expect(col(magicLinkTokens, 'expires_at')?.notNull).toBe(true)
  })
})

describe('weddings', () => {
  it('couple_names not null', () => {
    expect(col(weddings, 'couple_names')?.notNull).toBe(true)
  })
  it('wedding_date not null', () => {
    expect(col(weddings, 'wedding_date')?.notNull).toBe(true)
  })
  it('plan default FREE', () => {
    expect(col(weddings, 'plan')?.hasDefault).toBe(true)
  })
  it('status default var', () => {
    expect(col(weddings, 'status')?.hasDefault).toBe(true)
  })
  it('timezone default var', () => {
    expect(col(weddings, 'timezone')?.hasDefault).toBe(true)
  })
  it('program JSONB nullable', () => {
    const c = col(weddings, 'program')
    expect(c).toBeDefined()
    expect(c?.notNull).toBe(false)
  })
  it('purchase alanları nullable (Aşama 2.5)', () => {
    expect(col(weddings, 'purchase_token')?.notNull).toBe(false)
    expect(col(weddings, 'purchased_at')?.notNull).toBe(false)
  })
})

describe('wedding_members', () => {
  it('(wedding_id, user_id) unique', () => {
    const cfg = getTableConfig(weddingMembers)
    const uniques = cfg.uniqueConstraints.map((u) =>
      u.columns.map((c) => c.name).sort().join(','),
    )
    expect(uniques).toContain('user_id,wedding_id')
  })
  it('role not null', () => {
    expect(col(weddingMembers, 'role')?.notNull).toBe(true)
  })
  it('wedding_id FK CASCADE', () => {
    const cfg = getTableConfig(weddingMembers)
    const fk = cfg.foreignKeys.find((f) => f.getName()?.includes('wedding'))
    expect(fk?.onDelete).toBe('cascade')
  })
})

describe('invites', () => {
  it('code unique', () => {
    expect(col(invites, 'code')?.isUnique).toBe(true)
  })
  it('code not null', () => {
    expect(col(invites, 'code')?.notNull).toBe(true)
  })
  it('role not null', () => {
    expect(col(invites, 'role')?.notNull).toBe(true)
  })
  it('used_at nullable (tek kullanım)', () => {
    expect(col(invites, 'used_at')?.notNull).toBe(false)
  })
  it('expires_at nullable', () => {
    expect(col(invites, 'expires_at')?.notNull).toBe(false)
  })
})
