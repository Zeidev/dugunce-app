import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
}, 120_000)

afterAll(async () => { await pg?.close() })

describe('admin tablolari', () => {
  it('admin_accounts sutunlari dogru', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'admin_accounts' ORDER BY column_name`,
    )
    const cols = r.rows.map((x) => x.column_name)
    expect(cols).toEqual([
      'created_at', 'display_name', 'email', 'failed_attempts', 'id',
      'last_login_at', 'locked_until', 'lockout_count', 'password_hash',
      'recovery_codes', 'role', 'status', 'totp_enabled_at', 'totp_secret',
      'updated_at',
    ])
  })

  it('admin_sessions sutunlari dogru', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'admin_sessions' ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual([
      'admin_id', 'created_at', 'csrf_hash', 'expires_at', 'id', 'ip',
      'last_used_at', 'session_hash', 'user_agent',
    ])
  })

  it('audit_logs sutunlari dogru', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_logs' ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual([
      'action', 'actor_id', 'actor_type', 'created_at', 'id', 'ip',
      'metadata', 'target_id', 'target_type',
    ])
  })

  it('email UNIQUE — ayni e-posta iki kez eklenemez', async () => {
    await pg.query(
      `INSERT INTO admin_accounts (email, password_hash, display_name) VALUES ('a@t.local','h','A')`,
    )
    await expect(
      pg.query(
        `INSERT INTO admin_accounts (email, password_hash, display_name) VALUES ('a@t.local','h','B')`,
      ),
    ).rejects.toThrow()
  })

  it('session_hash UNIQUE', async () => {
    const a = await pg.query<{ id: string }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('s@t.local','h','S') RETURNING id`,
    )
    const adminId = a.rows[0]!.id
    const future = new Date(Date.now() + 3_600_000).toISOString()
    await pg.query(
      `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
       VALUES ($1,'same','c1',$2)`,
      [adminId, future],
    )
    await expect(
      pg.query(
        `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
         VALUES ($1,'same','c2',$2)`,
        [adminId, future],
      ),
    ).rejects.toThrow()
  })

  it('admin silinince oturumlari da silinir (CASCADE)', async () => {
    const a = await pg.query<{ id: string }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('c@t.local','h','C') RETURNING id`,
    )
    const adminId = a.rows[0]!.id
    const future = new Date(Date.now() + 3_600_000).toISOString()
    await pg.query(
      `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
       VALUES ($1,'casc','c',$2)`,
      [adminId, future],
    )
    await pg.query(`DELETE FROM admin_accounts WHERE id = $1`, [adminId])
    const left = await pg.query(`SELECT id FROM admin_sessions WHERE admin_id = $1`, [adminId])
    expect(left.rows).toHaveLength(0)
  })

  it('status varsayilani ACTIVE', async () => {
    const r = await pg.query<{ status: string; role: string; failed_attempts: number }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('d@t.local','h','D') RETURNING status, role, failed_attempts`,
    )
    expect(r.rows[0]).toMatchObject({ status: 'ACTIVE', role: 'SUPER_ADMIN', failed_attempts: 0 })
  })
})

describe('audit_logs degistirilemez (spec §5.3)', () => {
  it('UPDATE engellenir', async () => {
    await pg.query(`INSERT INTO audit_logs (actor_type, action) VALUES ('ADMIN','TEST')`)
    await expect(
      pg.query(`UPDATE audit_logs SET action = 'DEGISTI' WHERE action = 'TEST'`),
    ).rejects.toThrow(/değiştirilemez/)
  })

  it('DELETE engellenir', async () => {
    await pg.query(`INSERT INTO audit_logs (actor_type, action) VALUES ('ADMIN','TEST2')`)
    await expect(
      pg.query(`DELETE FROM audit_logs WHERE action = 'TEST2'`),
    ).rejects.toThrow(/değiştirilemez/)
  })

  it('kayit yerinde durur', async () => {
    const r = await pg.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM audit_logs WHERE action IN ('TEST','TEST2')`,
    )
    expect(r.rows[0]!.c).toBe(2)
  })

  it('INSERT serbest — denetim kaydi yazilabilir', async () => {
    await pg.query(`INSERT INTO audit_logs (actor_type, action) VALUES ('ADMIN','TEST3')`)
    const r = await pg.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM audit_logs WHERE action = 'TEST3'`,
    )
    expect(r.rows[0]!.c).toBe(1)
  })
})

describe('constraint isimleri schema ile ayni (drift yok)', () => {
  it('email UNIQUE adi admin_accounts_email_unique', async () => {
    const r = await pg.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'admin_accounts'::regclass AND contype = 'u'`,
    )
    expect(r.rows.map((x) => x.conname)).toContain('admin_accounts_email_unique')
  })

  it('session_hash UNIQUE adi admin_sessions_session_hash_unique', async () => {
    const r = await pg.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'admin_sessions'::regclass AND contype = 'u'`,
    )
    expect(r.rows.map((x) => x.conname)).toContain('admin_sessions_session_hash_unique')
  })

  it('admin_id index var (CASCADE taramasi icin)', async () => {
    const r = await pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'admin_sessions'`,
    )
    expect(r.rows.map((x) => x.indexname)).toContain('admin_sessions_admin_id_idx')
  })

  it('NOT NULL: csrf_hash ve expires_at zorunlu', async () => {
    const a = await pg.query<{ id: string }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('nn@t.local','h','N') RETURNING id`,
    )
    const future = new Date(Date.now() + 3_600_000).toISOString()
    await expect(
      pg.query(
        `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
         VALUES ($1,'nn1',NULL,$2)`,
        [a.rows[0]!.id, future],
      ),
    ).rejects.toThrow()
    await expect(
      pg.query(
        `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
         VALUES ($1,'nn2','c',NULL)`,
        [a.rows[0]!.id],
      ),
    ).rejects.toThrow()
  })
})
