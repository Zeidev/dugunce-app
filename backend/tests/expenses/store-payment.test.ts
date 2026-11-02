/**
 * Drizzle store — taksit ödeme durumu, GERÇEK Drizzle üzerinden (PGlite).
 *
 * Neden ayrı dosya: `store.test.ts` ham SQL çalıştırıyor, dolayısıyla
 * `drizzleExpenseDeps()` içindeki üyelik join'ini KANITLAMIYOR. Bu dosya
 * gerçek Drizzle sorgularını çalıştırır; join kaldırılırsa test kırılır.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { drizzleExpenseDeps } from '../../src/expenses/store.js'
import { setInstallmentPaid } from '../../src/expenses/service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let store: ReturnType<typeof drizzleExpenseDeps>
let userA: string
let userB: string
let weddingA: string
let weddingB: string
let installmentA: string
let installmentB: string

beforeAll(async () => {
  pg = new PGlite()

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt)
    }
  }

  const db = drizzle(pg, { schema })
  store = drizzleExpenseDeps(db as unknown as ReturnType<typeof drizzleExpenseDeps> extends never ? never : Parameters<typeof drizzleExpenseDeps>[0])

  const a = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`,
    ['pa@test.local', 'A'],
  )
  const b = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`,
    ['pb@test.local', 'B'],
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

  const ea = await pg.query<{ id: string }>(
    `INSERT INTO expenses (wedding_id, title, amount_kurus, purchase_date, created_by)
     VALUES ($1,'A harcama',300000,'2026-01-15',$2) RETURNING id`,
    [weddingA, userA],
  )
  const eb = await pg.query<{ id: string }>(
    `INSERT INTO expenses (wedding_id, title, amount_kurus, purchase_date, created_by)
     VALUES ($1,'B harcama',300000,'2026-01-15',$2) RETURNING id`,
    [weddingB, userB],
  )

  const ia = await pg.query<{ id: string }>(
    `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month)
     VALUES ($1,$2,1,300000,'2026-01') RETURNING id`,
    [weddingA, ea.rows[0]!.id],
  )
  const ib = await pg.query<{ id: string }>(
    `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month)
     VALUES ($1,$2,1,300000,'2026-01') RETURNING id`,
    [weddingB, eb.rows[0]!.id],
  )
  installmentA = ia.rows[0]!.id
  installmentB = ib.rows[0]!.id
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('drizzleExpenseDeps — taksit ödeme (gerçek Drizzle)', () => {
  it('üye kendi taksitini ödendi işaretler, paid_at yazılır', async () => {
    const r = await setInstallmentPaid(
      { weddingId: weddingA, userId: userA, installmentId: installmentA, paid: true },
      store,
    )

    expect(r).not.toBeNull()
    expect(r!.status).toBe('PAID')
    expect(r!.paidAt).toBeInstanceOf(Date)
  })

  it('İDOR: başka düğünün taksiti ödendi işaretlenemez (null döner)', async () => {
    // userA, weddingB'nin taksitine erişmeye çalışıyor
    const r = await setInstallmentPaid(
      { weddingId: weddingB, userId: userA, installmentId: installmentB, paid: true },
      store,
    )
    expect(r).toBeNull()

    // DB'de gerçekten değişmemiş olmalı
    const row = await pg.query<{ status: string; paid_at: string | null }>(
      `SELECT status, paid_at FROM installments WHERE id=$1`,
      [installmentB],
    )
    expect(row.rows[0]!.status).toBe('PENDING')
    expect(row.rows[0]!.paid_at).toBeNull()
  })

  it('İDOR: yanlış düğün id ile kendi taksiti de bulunamaz', async () => {
    const r = await setInstallmentPaid(
      { weddingId: weddingB, userId: userB, installmentId: installmentA, paid: true },
      store,
    )
    expect(r).toBeNull()
  })

  it('idempotent: ikinci kez ödendi işaretlemek paid_at değiştirmez', async () => {
    const first = await setInstallmentPaid(
      { weddingId: weddingA, userId: userA, installmentId: installmentA, paid: true },
      store,
    )
    const second = await setInstallmentPaid(
      { weddingId: weddingA, userId: userA, installmentId: installmentA, paid: true },
      store,
    )

    expect(second!.paidAt).toEqual(first!.paidAt)
  })

  it('SAVUNMA DERİNLİĞİ: markInstallmentPaid doğrudan çağrılsa da yabancı güncelleyemez', async () => {
    // findInstallment'ı atlayıp doğrudan UPDATE katmanını sınıyoruz.
    // Bu ikinci savunma hattı: servis katmanı bir gün değişse bile
    // SQL'deki EXISTS üyelik kontrolü yabancı yazmayı engeller.
    await expect(
      store.markInstallmentPaid(weddingB, userA, installmentB, true),
    ).rejects.toThrow(/güncellenemedi/i)

    const row = await pg.query<{ status: string; paid_at: string | null }>(
      `SELECT status, paid_at FROM installments WHERE id=$1`,
      [installmentB],
    )
    expect(row.rows[0]!.status).toBe('PENDING')
    expect(row.rows[0]!.paid_at).toBeNull()
  })

  it('ödeme geri alınır, paid_at NULL olur', async () => {
    const r = await setInstallmentPaid(
      { weddingId: weddingA, userId: userA, installmentId: installmentA, paid: false },
      store,
    )

    expect(r!.status).toBe('PENDING')
    expect(r!.paidAt).toBeNull()
  })
})
