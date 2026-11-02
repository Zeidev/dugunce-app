import { describe, it, expect } from 'vitest'
import { runMigrations, assertSafeTarget } from '../../scripts/migrate.js'
import { getSql, closeDb } from '../../src/db/client.js'

const hasDb = Boolean(process.env['DATABASE_URL'])

describe('assertSafeTarget — ortam koruması', () => {
  it('test ortamında serbest', () => {
    expect(() =>
      assertSafeTarget({
        nodeEnv: 'test',
        databaseUrl: 'postgres://u:p@localhost:5432/davetly_test',
        force: false,
      }),
    ).not.toThrow()
  })

  it('production + force yoksa reddeder', () => {
    expect(() =>
      assertSafeTarget({
        nodeEnv: 'production',
        databaseUrl: 'postgres://u:p@host:5432/davetly_prod',
        force: false,
      }),
    ).toThrow(/force/i)
  })

  it('production + force varsa izin verir', () => {
    expect(() =>
      assertSafeTarget({
        nodeEnv: 'production',
        databaseUrl: 'postgres://u:p@host:5432/davetly_prod',
        force: true,
      }),
    ).not.toThrow()
  })

  it('URL içinde "prod" geçiyorsa production olmasa bile uyarır', () => {
    expect(() =>
      assertSafeTarget({
        nodeEnv: 'development',
        databaseUrl: 'postgres://u:p@host:5432/davetly_prod',
        force: false,
      }),
    ).toThrow(/prod/i)
  })

  it('staging hedefi güvenli', () => {
    expect(() =>
      assertSafeTarget({
        nodeEnv: 'development',
        databaseUrl: 'postgres://u:p@host:5432/davetly_stage',
        force: false,
      }),
    ).not.toThrow()
  })
})

describe.skipIf(!hasDb)('runMigrations', () => {
  it('migration çalışır ve users tablosu oluşur', async () => {
    await runMigrations({ force: true })
    const sql = getSql()
    const result = await sql`SELECT to_regclass('public.users') AS t`
    expect(result[0]?.t).toBe('users')
  })

  it('migration idempotent — iki kez çalıştırılabilir', async () => {
    await runMigrations({ force: true })
    await expect(runMigrations({ force: true })).resolves.not.toThrow()
  })

  it('users tablosu beklenen kolonlara sahip', async () => {
    await runMigrations({ force: true })
    const sql = getSql()
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `
    const names = cols.map((c) => c['column_name'])
    expect(names).toContain('id')
    expect(names).toContain('email')
    expect(names).toContain('display_name')
    expect(names).toContain('email_verified_at')
    expect(names).toContain('status')
    expect(names).toContain('created_at')
  })

  it('temizlik', async () => {
    await closeDb()
  })
})
