/**
 * Görev migration kısıtları — PGlite üzerinde.
 *
 * CHECK kısıtları uygulama katmanı atlansa bile korumalı:
 * - body <= 4000 karakter
 * - body boş olamaz
 * - sender_kind ile sender_user_id/sender_helper_id tutarlı
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIG = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let userId: string
let weddingId: string
let helperId: string
let taskId: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('t5@test.local','T') RETURNING id`,
  )
  userId = u.rows[0]!.id

  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('T','2026-09-12') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )

  const h = await pg.query<{ id: string }>(
    `INSERT INTO helpers (wedding_id, display_name, access_token_hash)
     VALUES ($1,'Ayşe','hash1') RETURNING id`,
    [weddingId],
  )
  helperId = h.rows[0]!.id

  const t = await pg.query<{ id: string }>(
    `INSERT INTO tasks (wedding_id, title, assignee_helper_id, assigned_at)
     VALUES ($1,'Görev',NULL,NULL) RETURNING id`,
    [weddingId],
  )
  taskId = t.rows[0]!.id
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('tasks migration', () => {
  it('tasks tablosu var', async () => {
    const r = await pg.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name='tasks'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('COMPOSITE FK var', async () => {
    const r = await pg.query(
      `SELECT conname FROM pg_constraint WHERE conname='tasks_assignee_fk'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('yanlış wedding_id ile atama reddedilir', async () => {
    const w2 = await pg.query<{ id: string }>(
      `INSERT INTO weddings (couple_names, wedding_date) VALUES ('X','2026-10-10') RETURNING id`,
    )
    await expect(
      pg.query(
        `INSERT INTO tasks (wedding_id, title, assignee_helper_id)
         VALUES ($1,'Yanlış',$2)`,
        [w2.rows[0]!.id, helperId],
      ),
    ).rejects.toThrow()
  })

  it('doğrudan yardımcı silme FK ihlali ile REDDEDİLİR (sessiz sahipsizlik yok)', async () => {
    // ON DELETE SET NULL composite FK'da kullanılamaz (wedding_id NOT NULL).
    // ON DELETE CASCADE yanlış olurdu (görevi de silerdi).
    // Bu yüzden FK NO ACTION: doğrudan DELETE reddedilir, servis katmanı
    // önce atamayı boşaltmak zorundadır. Sessiz veri bozulması yerine
    // gürültülü hata — bilinçli tercih.
    const h2 = await pg.query<{ id: string }>(
      `INSERT INTO helpers (wedding_id, display_name, access_token_hash)
       VALUES ($1,'Silinecek','hash2') RETURNING id`,
      [weddingId],
    )
    await pg.query(
      `INSERT INTO tasks (wedding_id, title, assignee_helper_id, assigned_at)
       VALUES ($1,'Atanmış',$2, now())`,
      [weddingId, h2.rows[0]!.id],
    )

    await expect(
      pg.query(`DELETE FROM helpers WHERE id=$1`, [h2.rows[0]!.id]),
    ).rejects.toThrow(/foreign key|violates/i)
  })

  it('önce atama boşaltılınca yardımcı silinebilir', async () => {
    const h3 = await pg.query<{ id: string }>(
      `INSERT INTO helpers (wedding_id, display_name, access_token_hash)
       VALUES ($1,'Boşaltılacak','hash3') RETURNING id`,
      [weddingId],
    )
    const t3 = await pg.query<{ id: string }>(
      `INSERT INTO tasks (wedding_id, title, assignee_helper_id, assigned_at)
       VALUES ($1,'Atanmış',$2, now()) RETURNING id`,
      [weddingId, h3.rows[0]!.id],
    )

    // Servis katmanının yapacağı: önce atamayı boşalt
    await pg.query(
      `UPDATE tasks SET assignee_helper_id=NULL, assigned_at=NULL WHERE assignee_helper_id=$1`,
      [h3.rows[0]!.id],
    )
    // Sonra sil
    await pg.query(`DELETE FROM helpers WHERE id=$1`, [h3.rows[0]!.id])

    const r = await pg.query<{ assignee_helper_id: string | null; assigned_at: string | null }>(
      `SELECT assignee_helper_id, assigned_at::text FROM tasks WHERE id=$1`,
      [t3.rows[0]!.id],
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]!.assignee_helper_id).toBeNull()
    expect(r.rows[0]!.assigned_at).toBeNull()
  })
})

describe('messages CHECK kısıtları', () => {
  it('4000 karakter kabul edilir', async () => {
    await pg.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body)
       VALUES ($1,$2,'COUPLE',$3,$4)`,
      [weddingId, taskId, userId, 'a'.repeat(4000)],
    )
    const r = await pg.query(`SELECT count(*)::int c FROM messages WHERE task_id=$1`, [taskId])
    expect(r.rows[0]).toMatchObject({ c: 1 })
  })

  it('4001 karakter DB tarafından REDDEDİLİR', async () => {
    await expect(
      pg.query(
        `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body)
         VALUES ($1,$2,'COUPLE',$3,$4)`,
        [weddingId, taskId, userId, 'a'.repeat(4001)],
      ),
    ).rejects.toThrow(/check|body/i)
  })

  it('boş mesaj REDDEDİLİR', async () => {
    await expect(
      pg.query(
        `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body)
         VALUES ($1,$2,'COUPLE',$3,'   ')`,
        [weddingId, taskId, userId],
      ),
    ).rejects.toThrow(/check|body/i)
  })

  it('geçersiz sender_kind REDDEDİLİR', async () => {
    await expect(
      pg.query(
        `INSERT INTO messages (wedding_id, task_id, sender_kind, body)
         VALUES ($1,$2,'ADMIN','metin')`,
        [weddingId, taskId],
      ),
    ).rejects.toThrow(/check|sender/i)
  })

  it('COUPLE + sender_user_id NULL KABUL (yardımcı/kullanıcı silinince geçmiş kalır)', async () => {
    // Bu bilinçli: sender_user_id FK'si ON DELETE SET NULL. Sıkı bir
    // CHECK, kullanıcı silinince geçmişi de silmeye zorlardı.
    await pg.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, body)
       VALUES ($1,$2,'COUPLE','geçmiş mesaj')`,
      [weddingId, taskId],
    )
    const r = await pg.query(
      `SELECT id FROM messages WHERE body='geçmiş mesaj'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('HELPER + sender_helper_id NULL KABUL (yardımcı silinince geçmiş kalır)', async () => {
    await pg.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, body)
       VALUES ($1,$2,'HELPER','yardımcı geçmişi')`,
      [weddingId, taskId],
    )
    const r = await pg.query(
      `SELECT id FROM messages WHERE body='yardımcı geçmişi'`,
    )
    expect(r.rows).toHaveLength(1)
  })

  it('HELPER + sender_helper_id → KABUL', async () => {
    await pg.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_helper_id, body)
       VALUES ($1,$2,'HELPER',$3,'yardımcı mesajı')`,
      [weddingId, taskId, helperId],
    )
    const r = await pg.query(
      `SELECT id FROM messages WHERE sender_helper_id=$1`,
      [helperId],
    )
    expect(r.rows).toHaveLength(1)
  })

  it('idempotency UNIQUE: aynı key iki kez reddedilir', async () => {
    await pg.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body, idempotency_key)
       VALUES ($1,$2,'COUPLE',$3,'ilk','key-1')`,
      [weddingId, taskId, userId],
    )
    await expect(
      pg.query(
        `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body, idempotency_key)
         VALUES ($1,$2,'COUPLE',$3,'ikinci','key-1')`,
        [weddingId, taskId, userId],
      ),
    ).rejects.toThrow(/unique|duplicate/i)
  })

  it('CASCADE: görev silinince mesajlar gider', async () => {
    const before = await pg.query<{ c: number }>(
      `SELECT count(*)::int c FROM messages WHERE task_id=$1`,
      [taskId],
    )
    expect(before.rows[0]!.c).toBeGreaterThan(0)

    await pg.query(`DELETE FROM tasks WHERE id=$1`, [taskId])
    const after = await pg.query<{ c: number }>(
      `SELECT count(*)::int c FROM messages WHERE task_id=$1`,
      [taskId],
    )
    expect(after.rows[0]!.c).toBe(0)
  })
})
