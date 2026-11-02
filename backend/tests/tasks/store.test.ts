/**
 * Görev/yardımcı/mesaj deposu — GERÇEK Drizzle + PGlite.
 *
 * Ham SQL çalıştıran testler Drizzle join'ini KANITLAMAZ (Aşama 3 dersi).
 * Bu dosya gerçek store'u çalıştırır; üyelik join'i veya `assigned_at`
 * filtresi kaldırılırsa kırılır.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { drizzleHelperDeps } from '../../src/helpers/store.js'
import { drizzleTaskDeps } from '../../src/tasks/store.js'
import { drizzleMessageDeps } from '../../src/messages/store.js'
import { createHelper, deleteHelper } from '../../src/helpers/service.js'
import { createTask, assignTask, deleteTask } from '../../src/tasks/service.js'
import { sendMessage, listMessages } from '../../src/messages/service.js'
import { resolveHelperToken } from '../../src/helpers/token.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIG = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let helperStore: ReturnType<typeof drizzleHelperDeps>
let taskStore: ReturnType<typeof drizzleTaskDeps>
let msgStore: ReturnType<typeof drizzleMessageDeps>
let userA: string
let userB: string
let weddingA: string
let weddingB: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const db = drizzle(pg, { schema })
  const d = db as unknown as Parameters<typeof drizzleHelperDeps>[0]
  helperStore = drizzleHelperDeps(d)
  taskStore = drizzleTaskDeps(d)
  msgStore = drizzleMessageDeps(d)

  const a = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('sa@t.local','A') RETURNING id`,
  )
  const b = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('sb@t.local','B') RETURNING id`,
  )
  userA = a.rows[0]!.id
  userB = b.rows[0]!.id

  const wa = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & A','2026-09-12') RETURNING id`,
  )
  const wb = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('B & B','2026-10-12') RETURNING id`,
  )
  weddingA = wa.rows[0]!.id
  weddingB = wb.rows[0]!.id

  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingA, userA],
  )
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingB, userB],
  )

  // Bu dosya limitleri DEĞİL, store davranışını test eder.
  // Ücretsiz limit (1 yardımcı / 1 görev) ayrı testlerde doğrulanıyor.
  await pg.query(`UPDATE weddings SET plan='PREMIUM' WHERE id IN ($1,$2)`, [
    weddingA,
    weddingB,
  ])
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

/**
 * Her test için TAZE düğün + üyelik.
 *
 * Yardımcı limiti 5 (premium) olduğu için testler arasında birikim
 * limiti doldurur. İzolasyon, testlerin birbirini etkilememesini sağlar.
 */
let weddingSeq = 0
async function freshWedding(): Promise<{ weddingId: string; userId: string }> {
  weddingSeq += 1
  const email = `fresh${weddingSeq}@t.local`
  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,'F') RETURNING id`,
    [email],
  )
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan)
     VALUES ($1,'2026-09-12','PREMIUM') RETURNING id`,
    [`Fresh ${weddingSeq}`],
  )
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [w.rows[0]!.id, u.rows[0]!.id],
  )
  return { weddingId: w.rows[0]!.id, userId: u.rows[0]!.id }
}

describe('yardımcı deposu (gerçek Drizzle)', () => {
  it('yardımcı oluşturulur ve token çözülür', async () => {
    const r = await createHelper(
      { weddingId: weddingA, userId: userA, input: { displayName: 'Ayşe' } },
      helperStore,
    )
    expect(r).not.toBeNull()

    const resolved = await resolveHelperToken(r!.token, helperStore)
    expect(resolved).not.toBeNull()
    expect(resolved!.displayName).toBe('Ayşe')
    expect(resolved!.wedding.coupleNames).toBe('A & A')
  })

  it('İDOR: başka düğünün yardımcısı listelenmez', async () => {
    const list = await helperStore.listByWedding(weddingB, userA)
    expect(list).toHaveLength(0)
  })

  it('İDOR: yabancı kullanıcı yardımcı listesini göremez', async () => {
    const list = await helperStore.listByWedding(weddingA, userB)
    expect(list).toHaveLength(0)
  })

  it('revoke sonrası token çözülemez', async () => {
    const r = await createHelper(
      { weddingId: weddingB, userId: userB, input: { displayName: 'Revoke Test' } },
      helperStore,
    )
    await helperStore.revokeToken(r!.helper.id)
    expect(await resolveHelperToken(r!.token, helperStore)).toBeNull()
  })
})

describe('görev deposu (gerçek Drizzle)', () => {
  it('görev oluşturulur, atama assigned_at yazar', async () => {
    const h = await createHelper(
      { weddingId: weddingA, userId: userA, input: { displayName: 'Görevli' } },
      helperStore,
    )
    const t = await createTask(
      { weddingId: weddingA, userId: userA, input: { title: 'Çiçek' } },
      taskStore,
    )
    const assigned = await assignTask(
      { weddingId: weddingA, userId: userA, taskId: t.id, helperId: h!.helper.id },
      taskStore,
    )
    expect(assigned!.assigneeHelperId).toBe(h!.helper.id)
    expect(assigned!.assignedAt).toBeInstanceOf(Date)
  })

  it('İDOR: yabancı kullanıcı görev listesini göremez', async () => {
    const list = await taskStore.listByWedding(weddingA, userB, {})
    expect(list).toHaveLength(0)
  })

  it('soft delete sonrası görev listede görünmez', async () => {
    const t = await createTask(
      { weddingId: weddingA, userId: userA, input: { title: 'Silinecek' } },
      taskStore,
    )
    await taskStore.softDelete(t.id)
    const list = await taskStore.listByWedding(weddingA, userA, {})
    expect(list.find((x) => x.id === t.id)).toBeUndefined()
  })
})

describe('mesaj deposu — assigned_at sınırı GERÇEK SQL\'de', () => {
  it('yeniden atamada yeni yardımcı önceki konuşmayı GÖRMEZ (Review Focus #1)', async () => {
    // 1. Görev + yardımcı A
    const hA = await createHelper(
      { weddingId: weddingA, userId: userA, input: { displayName: 'A' } },
      helperStore,
    )
    // AYNI düğünde ikinci yardımcı — composite FK başka düğünün
    // yardımcısına atamayı zaten reddeder (ayrı test).
    const hB = await createHelper(
      { weddingId: weddingA, userId: userA, input: { displayName: 'B' } },
      helperStore,
    )
    const t = await createTask(
      { weddingId: weddingA, userId: userA, input: { title: 'Sohbet' } },
      taskStore,
    )
    await assignTask(
      { weddingId: weddingA, userId: userA, taskId: t.id, helperId: hA!.helper.id },
      taskStore,
    )

    // 2. A ile konuşma
    await sendMessage(
      {
        weddingId: weddingA,
        taskId: t.id,
        sender: { kind: 'COUPLE', userId: userA },
        body: 'Gizli: bu aileyle uğraşmak zor',
      },
      msgStore,
    )
    await sendMessage(
      {
        weddingId: weddingA,
        taskId: t.id,
        sender: { kind: 'HELPER', helperId: hA!.helper.id },
        body: 'Anladım',
      },
      msgStore,
    )

    // 3. A görebiliyor
    const aView = await listMessages(
      { weddingId: weddingA, taskId: t.id, viewer: { kind: 'HELPER', helperId: hA!.helper.id } },
      msgStore,
    )
    expect(aView.length).toBeGreaterThanOrEqual(2)

    // 4. YENİDEN ATA → B
    await new Promise((r) => setTimeout(r, 10))  // assigned_at ilerlesin
    await assignTask(
      { weddingId: weddingA, userId: userA, taskId: t.id, helperId: hB!.helper.id },
      taskStore,
    )

    // 5. B ÖNCEKİ KONUŞMAYI GÖRMEMELİ
    const bView = await listMessages(
      { weddingId: weddingA, taskId: t.id, viewer: { kind: 'HELPER', helperId: hB!.helper.id } },
      msgStore,
    )
    expect(bView).toHaveLength(0)
    expect(JSON.stringify(bView)).not.toContain('Gizli')

    // 6. Çift TÜM konuşmayı görür
    const coupleView = await listMessages(
      { weddingId: weddingA, taskId: t.id, viewer: { kind: 'COUPLE', userId: userA } },
      msgStore,
    )
    expect(coupleView.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(coupleView)).toContain('Gizli')
  })

  it('B kendi mesajını görür, A\'nınkini görmez', async () => {
    const fw = await freshWedding()
    const hA = await createHelper(
      { weddingId: fw.weddingId, userId: fw.userId, input: { displayName: 'A2' } },
      helperStore,
    )
    const hB = await createHelper(
      { weddingId: fw.weddingId, userId: fw.userId, input: { displayName: 'B2' } },
      helperStore,
    )
    const t = await createTask(
      { weddingId: fw.weddingId, userId: fw.userId, input: { title: 'Sohbet2' } },
      taskStore,
    )
    await assignTask(
      { weddingId: fw.weddingId, userId: fw.userId, taskId: t.id, helperId: hA!.helper.id },
      taskStore,
    )
    await sendMessage(
      {
        weddingId: fw.weddingId, taskId: t.id,
        sender: { kind: 'COUPLE', userId: fw.userId }, body: 'A için',
      },
      msgStore,
    )

    await new Promise((r) => setTimeout(r, 10))
    await assignTask(
      { weddingId: fw.weddingId, userId: fw.userId, taskId: t.id, helperId: hB!.helper.id },
      taskStore,
    )
    await sendMessage(
      {
        weddingId: fw.weddingId, taskId: t.id,
        sender: { kind: 'COUPLE', userId: fw.userId }, body: 'B için',
      },
      msgStore,
    )

    const bView = await listMessages(
      { weddingId: fw.weddingId, taskId: t.id, viewer: { kind: 'HELPER', helperId: hB!.helper.id } },
      msgStore,
    )
    const text = JSON.stringify(bView)
    expect(text).toContain('B için')
    expect(text).not.toContain('A için')
  })

  it('idempotency: aynı key iki kez → tek satır', async () => {
    const t = await createTask(
      { weddingId: weddingA, userId: userA, input: { title: 'Idem' } },
      taskStore,
    )
    const p = {
      weddingId: weddingA,
      taskId: t.id,
      sender: { kind: 'COUPLE' as const, userId: userA },
      body: 'tekrar',
      idempotencyKey: 'k-unique-1',
    }
    const m1 = await sendMessage(p, msgStore)
    const m2 = await sendMessage(p, msgStore)
    expect(m1!.id).toBe(m2!.id)

    const rows = await pg.query<{ c: number }>(
      `SELECT count(*)::int c FROM messages WHERE task_id=$1 AND idempotency_key=$2`,
      [t.id, 'k-unique-1'],
    )
    expect(rows.rows[0]!.c).toBe(1)
  })

  it('sayfalama: limit ve before çalışır', async () => {
    const t = await createTask(
      { weddingId: weddingA, userId: userA, input: { title: 'Sayfalama' } },
      taskStore,
    )
    for (let i = 0; i < 5; i++) {
      await sendMessage(
        {
          weddingId: weddingA, taskId: t.id,
          sender: { kind: 'COUPLE', userId: userA }, body: `mesaj ${i}`,
        },
        msgStore,
      )
    }

    const page1 = await listMessages(
      { weddingId: weddingA, taskId: t.id, viewer: { kind: 'COUPLE', userId: userA }, limit: 2 },
      msgStore,
    )
    expect(page1).toHaveLength(2)

    const page2 = await listMessages(
      {
        weddingId: weddingA, taskId: t.id,
        viewer: { kind: 'COUPLE', userId: userA },
        limit: 2,
        before: page1[page1.length - 1]!.id,
      },
      msgStore,
    )
    expect(page2).toHaveLength(2)
    // Sayfalar çakışmamalı
    const ids1 = page1.map((m) => m.id)
    const ids2 = page2.map((m) => m.id)
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0)
  })
})

describe('yardımcı silme — atomik', () => {
  it('görev ataması olan yardımcı silinebilir (önce boşaltılır)', async () => {
    const fw = await freshWedding()
    const h = await createHelper(
      { weddingId: fw.weddingId, userId: fw.userId, input: { displayName: 'Silinecek' } },
      helperStore,
    )
    const t = await createTask(
      { weddingId: fw.weddingId, userId: fw.userId, input: { title: 'Atanmış' } },
      taskStore,
    )
    await assignTask(
      { weddingId: fw.weddingId, userId: fw.userId, taskId: t.id, helperId: h!.helper.id },
      taskStore,
    )

    const ok = await deleteHelper(
      { weddingId: fw.weddingId, userId: fw.userId, helperId: h!.helper.id },
      helperStore,
    )
    expect(ok).toBe(true)

    const task = await pg.query<{ assignee_helper_id: string | null; assigned_at: string | null }>(
      `SELECT assignee_helper_id, assigned_at::text FROM tasks WHERE id=$1`,
      [t.id],
    )
    expect(task.rows[0]!.assignee_helper_id).toBeNull()
    expect(task.rows[0]!.assigned_at).toBeNull()
  })

  it('yardımcı silinince mesaj KALIR, yazar null olur', async () => {
    const fw = await freshWedding()
    const h = await createHelper(
      { weddingId: fw.weddingId, userId: fw.userId, input: { displayName: 'Mesajcı' } },
      helperStore,
    )
    const t = await createTask(
      { weddingId: fw.weddingId, userId: fw.userId, input: { title: 'Mesajlı' } },
      taskStore,
    )
    await assignTask(
      { weddingId: fw.weddingId, userId: fw.userId, taskId: t.id, helperId: h!.helper.id },
      taskStore,
    )
    await sendMessage(
      {
        weddingId: fw.weddingId, taskId: t.id,
        sender: { kind: 'HELPER', helperId: h!.helper.id }, body: 'yardımcı mesajı',
      },
      msgStore,
    )

    await deleteHelper(
      { weddingId: fw.weddingId, userId: fw.userId, helperId: h!.helper.id },
      helperStore,
    )

    const r = await pg.query<{ body: string; sender_helper_id: string | null }>(
      `SELECT body, sender_helper_id FROM messages WHERE task_id=$1 AND sender_kind='HELPER'`,
      [t.id],
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]!.body).toBe('yardımcı mesajı')
    expect(r.rows[0]!.sender_helper_id).toBeNull()
  })
})

describe('görev silme — mesajlar gerçekten gider (SECURITY §10.3)', () => {
  it('deleteTask mesajları FİZİKSEL siler', async () => {
    const fw = await freshWedding()
    const h = await createHelper(
      { weddingId: fw.weddingId, userId: fw.userId, input: { displayName: 'H' } },
      helperStore,
    )
    const t = await createTask(
      { weddingId: fw.weddingId, userId: fw.userId, input: { title: 'Sohbet' } },
      taskStore,
    )
    await assignTask(
      { weddingId: fw.weddingId, userId: fw.userId, taskId: t.id, helperId: h!.helper.id },
      taskStore,
    )
    await sendMessage(
      {
        weddingId: fw.weddingId, taskId: t.id,
        sender: { kind: 'HELPER', helperId: h!.helper.id }, body: 'gizli konuşma',
      },
      msgStore,
    )

    const before = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM messages WHERE task_id=$1`,
      [t.id],
    )
    expect(before.rows[0]!.n).toBe(1)

    const ok = await deleteTask({ weddingId: fw.weddingId, userId: fw.userId, taskId: t.id }, taskStore)
    expect(ok).toBe(true)

    const after = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM messages WHERE task_id=$1`,
      [t.id],
    )
    // Soft-delete satırı bırakır ama konuşma KALMAZ: satır fiziksel
    // silinmediği için ON DELETE CASCADE hiç tetiklenmiyordu; artık
    // mesajlar aynı transaction içinde açıkça siliniyor.
    expect(after.rows[0]!.n).toBe(0)

    const taskRow = await pg.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM tasks WHERE id=$1`,
      [t.id],
    )
    expect(taskRow.rows[0]!.deleted_at).not.toBeNull()
  })
})
