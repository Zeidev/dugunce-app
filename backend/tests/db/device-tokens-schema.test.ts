import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0011 — push bildirimleri veri modeli.
 *
 * NEDEN PGlite: gerçek Postgres davranışı (unique, cascade, DEFAULT)
 * sınanmalı. Mock'lanmış bir şema, `ON DELETE CASCADE` çalışmadığında
 * bunu gizlerdi.
 */

const MIG = join(process.cwd(), 'src/db/migrations')

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite()
  // 0000 users tablosunu kurar; 0011 onu ALTER eder.
  for (const f of ['0000_free_genesis.sql', '0011_push_notifications.sql']) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim()
      if (trimmed !== '') await pg.exec(trimmed)
    }
  }
  return pg
}

describe('0011 push migration', () => {
  it('device_tokens tablosunu beklenen kolonlarla oluşturur', async () => {
    const pg = await freshDb()
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'device_tokens' ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual([
      'created_at',
      'id',
      'last_seen_at',
      'platform',
      'token',
      'user_id',
    ])
  })

  it('aynı token iki kez yazılamaz (unique kısıt)', async () => {
    const pg = await freshDb()
    await pg.exec(`INSERT INTO users (email, display_name) VALUES ('a@t.local','A')`)
    const u = await pg.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
    const userId = u.rows[0]?.id
    expect(userId).toBeDefined()

    await pg.query(
      `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,'tok1','ANDROID')`,
      [userId],
    )
    await expect(
      pg.query(
        `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,'tok1','ANDROID')`,
        [userId],
      ),
    ).rejects.toThrow()
  })

  it('kullanıcı silinince token da silinir (ON DELETE CASCADE)', async () => {
    const pg = await freshDb()
    await pg.exec(`INSERT INTO users (email, display_name) VALUES ('b@t.local','B')`)
    const u = await pg.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)
    const userId = u.rows[0]?.id
    expect(userId).toBeDefined()

    await pg.query(
      `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,'tok2','ANDROID')`,
      [userId],
    )
    await pg.query(`DELETE FROM users WHERE id = $1`, [userId])
    const left = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM device_tokens`)
    expect(left.rows[0]?.n).toBe(0)
  })

  it('users tablosunda bildirim tercihleri varsayılanlı gelir', async () => {
    const pg = await freshDb()
    await pg.exec(`INSERT INTO users (email, display_name) VALUES ('c@t.local','C')`)
    const r = await pg.query<{ notifications_enabled: boolean; quiet_hours_override: boolean }>(
      `SELECT notifications_enabled, quiet_hours_override FROM users`,
    )
    // Bildirimler varsayılan AÇIK: kullanıcı istemeden kapatılmış
    // olmamalı. Sessiz saat istisnası varsayılan KAPALI.
    expect(r.rows[0]?.notifications_enabled).toBe(true)
    expect(r.rows[0]?.quiet_hours_override).toBe(false)
  })
})
