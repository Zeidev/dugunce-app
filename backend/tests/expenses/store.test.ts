/**
 * Harcama deposu — gerçek PostgreSQL (PGlite) entegrasyon testi.
 *
 * Mock değil: migration'lar gerçekten uygulanır, SQL gerçekten çalışır.
 * Bu testler composite FK'nın ve wedding scoping'in DB seviyesinde
 * doğru olduğunu kanıtlar.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let userA: string
let userB: string
let weddingA: string
let weddingB: string

beforeAll(async () => {
  pg = new PGlite()

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt)
    }
  }

  const a = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`,
    ['a@test.local', 'A'],
  )
  const b = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`,
    ['b@test.local', 'B'],
  )
  userA = a.rows[0]!.id
  userB = b.rows[0]!.id

  const wa = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1,$2) RETURNING id`,
    ['A & A', '2026-09-12T19:00:00Z'],
  )
  const wb = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1,$2) RETURNING id`,
    ['B & B', '2026-10-12T19:00:00Z'],
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
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('harcama deposu — gerçek DB', () => {
  it('taksitli harcama oluşturulur ve taksitler doğru aylara dağılır', async () => {
    const e = await pg.query<{ id: string }>(
      `INSERT INTO expenses
         (wedding_id, title, amount_kurus, purchase_date, installment_count, first_installment_month, created_by)
       VALUES ($1,'Gelinlik',1200000,'2026-01-15',4,'2026-01',$2)
       RETURNING id`,
      [weddingA, userA],
    )
    const expenseId = e.rows[0]!.id

    // 4 taksit: 3.000 TL her ay, Ocak-Nisan
    for (let i = 1; i <= 4; i++) {
      const month = `2026-0${i}`
      await pg.query(
        `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month)
         VALUES ($1,$2,$3,300000,$4)`,
        [weddingA, expenseId, i, month],
      )
    }

    const rows = await pg.query<{ number: number; due_month: string; amount_kurus: string }>(
      `SELECT number, due_month, amount_kurus FROM installments WHERE expense_id=$1 ORDER BY number`,
      [expenseId],
    )

    expect(rows.rows).toHaveLength(4)
    expect(rows.rows.map((r) => r.due_month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04',
    ])

    const total = rows.rows.reduce((s, r) => s + BigInt(r.amount_kurus), 0n)
    expect(total).toBe(1_200_000n)
  })

  it('COMPOSITE FK: yanlış wedding_id ile taksit yazılamaz', async () => {
    const e = await pg.query<{ id: string }>(
      `INSERT INTO expenses
         (wedding_id, title, amount_kurus, purchase_date, created_by)
       VALUES ($1,'Test',100000,'2026-01-15',$2)
       RETURNING id`,
      [weddingA, userA],
    )
    const expenseId = e.rows[0]!.id

    // weddingB ile yazma denemesi → FK reddetmeli
    await expect(
      pg.query(
        `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month)
         VALUES ($1,$2,1,100000,'2026-01')`,
        [weddingB, expenseId],
      ),
    ).rejects.toThrow(/foreign key|violates/i)
  })

  it('CASCADE: harcama silinince taksitler gider', async () => {
    const e = await pg.query<{ id: string }>(
      `INSERT INTO expenses
         (wedding_id, title, amount_kurus, purchase_date, created_by)
       VALUES ($1,'Silinecek',50000,'2026-01-15',$2)
       RETURNING id`,
      [weddingA, userA],
    )
    const expenseId = e.rows[0]!.id

    await pg.query(
      `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month)
       VALUES ($1,$2,1,50000,'2026-01')`,
      [weddingA, expenseId],
    )

    await pg.query(`DELETE FROM expenses WHERE id=$1`, [expenseId])

    const rows = await pg.query(
      `SELECT 1 FROM installments WHERE expense_id=$1`,
      [expenseId],
    )
    expect(rows.rows).toHaveLength(0)
  })

  it('soft delete sonrası harcama görünmez ama kayıt durur', async () => {
    const e = await pg.query<{ id: string }>(
      `INSERT INTO expenses
         (wedding_id, title, amount_kurus, purchase_date, created_by)
       VALUES ($1,'SoftDelete',70000,'2026-01-15',$2)
       RETURNING id`,
      [weddingA, userA],
    )
    const expenseId = e.rows[0]!.id

    await pg.query(`UPDATE expenses SET deleted_at = now() WHERE id=$1`, [expenseId])

    const active = await pg.query(
      `SELECT 1 FROM expenses WHERE id=$1 AND deleted_at IS NULL`,
      [expenseId],
    )
    expect(active.rows).toHaveLength(0)

    const all = await pg.query(`SELECT 1 FROM expenses WHERE id=$1`, [expenseId])
    expect(all.rows).toHaveLength(1) // kayıt duruyor
  })

  it('aylık toplam doğru hesaplanır', async () => {
    const w = await pg.query<{ id: string }>(
      `INSERT INTO weddings (couple_names, wedding_date) VALUES ('Sum & Test','2026-12-01') RETURNING id`,
    )
    const wid = w.rows[0]!.id
    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
      [wid, userA],
    )

    // 3 harcama, farklı aylarda taksitler
    for (const [title, amount, month] of [
      ['A', 100000, '2026-05'],
      ['B', 200000, '2026-05'],
      ['C', 300000, '2026-06'],
    ] as const) {
      const e = await pg.query<{ id: string }>(
        `INSERT INTO expenses (wedding_id, title, amount_kurus, purchase_date, created_by)
         VALUES ($1,$2,$3,'2026-05-01',$4) RETURNING id`,
        [wid, title, amount, userA],
      )
      await pg.query(
        `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month)
         VALUES ($1,$2,1,$3,$4)`,
        [wid, e.rows[0]!.id, amount, month],
      )
    }

    const may = await pg.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_kurus),0) AS total FROM installments
       WHERE wedding_id=$1 AND due_month='2026-05' AND status='PENDING'`,
      [wid],
    )
    expect(BigInt(may.rows[0]!.total)).toBe(300_000n) // A+B

    const june = await pg.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_kurus),0) AS total FROM installments
       WHERE wedding_id=$1 AND due_month='2026-06' AND status='PENDING'`,
      [wid],
    )
    expect(BigInt(june.rows[0]!.total)).toBe(300_000n) // C
  })

  it('taraf bazlı toplam doğru', async () => {
    const w = await pg.query<{ id: string }>(
      `INSERT INTO weddings (couple_names, wedding_date) VALUES ('Side & Test','2026-12-01') RETURNING id`,
    )
    const wid = w.rows[0]!.id
    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
      [wid, userA],
    )

    await pg.query(
      `INSERT INTO expenses (wedding_id, title, amount_kurus, purchase_date, paid_by_side, created_by)
       VALUES ($1,'Gelin',600000,'2026-05-01','BRIDE',$2)`,
      [wid, userA],
    )
    await pg.query(
      `INSERT INTO expenses (wedding_id, title, amount_kurus, purchase_date, paid_by_side, created_by)
       VALUES ($1,'Damat',400000,'2026-05-01','GROOM',$2)`,
      [wid, userA],
    )

    const rows = await pg.query<{ side: string; total: string }>(
      `SELECT paid_by_side AS side, SUM(amount_kurus) AS total
       FROM expenses WHERE wedding_id=$1 AND deleted_at IS NULL
       GROUP BY paid_by_side`,
      [wid],
    )

    const map = Object.fromEntries(rows.rows.map((r) => [r.side, BigInt(r.total)]))
    expect(map['BRIDE']).toBe(600_000n)
    expect(map['GROOM']).toBe(400_000n)
  })

  it('başka düğünün harcaması üyelik sorgusuyla gelmez', async () => {
    const rows = await pg.query(
      `SELECT e.id FROM expenses e
       JOIN wedding_members m ON m.wedding_id = e.wedding_id
       WHERE e.wedding_id = $1 AND m.user_id = $2 AND e.deleted_at IS NULL`,
      [weddingB, userA],
    )
    expect(rows.rows).toHaveLength(0)
  })
})
