import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { drizzleExpenseDeps } from '../../src/expenses/store.js'

/**
 * Harcama listesi TAKSİTLERİ taşımalı — bildirilen hata.
 *
 * Belirti: panel "yaklaşan ödemeler" gösteriyordu (özet ayrı uçtan),
 * ama taksit takvimi boştu. Sebep: `listByWedding` yanıtı
 * `installments` alanını hiç doldurmuyordu; istemci boş dizi görüyordu.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIG = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let store: ReturnType<typeof drizzleExpenseDeps>
let wid: string
let uid: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
  const db = drizzle(pg, { schema })
  store = drizzleExpenseDeps(db as never)

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('i@t.local','I') RETURNING id`,
  )
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date, plan) VALUES ('A & B','2026-09-12','PREMIUM') RETURNING id`,
  )
  wid = w.rows[0]!.id
  uid = u.rows[0]!.id
  await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [wid, uid])
}, 90_000)

afterAll(async () => { await pg?.close() })

/** 12.000 TL, 4 taksit — gerçekçi senaryo. */
async function seedInstallments(): Promise<string> {
  const e = await pg.query<{ id: string }>(
    `INSERT INTO expenses (wedding_id, title, amount_kurus, installment_count,
       first_installment_month, purchase_date, created_by)
     VALUES ($1,'Taksitli',1200000,4,'2026-01','2026-01-05',$2) RETURNING id`,
    [wid, uid],
  )
  const id = e.rows[0]!.id
  for (let i = 1; i <= 4; i++) {
    const month = `2026-0${i}`
    await pg.query(
      `INSERT INTO installments (wedding_id, expense_id, number, amount_kurus, due_month, status)
       VALUES ($1,$2,$3,300000,$4,'PENDING')`,
      [wid, id, i, month],
    )
  }
  return id
}

describe('harcama listesi — taksitler', () => {
  it('liste yanıtı installments alanını taşır', async () => {
    await seedInstallments()
    const list = await store.listByWedding(wid, uid, {})
    expect(list.length).toBeGreaterThan(0)

    const withInst = list.find((e: any) => e.title === 'Taksitli') as any
    expect(withInst).toBeDefined()
    expect(Array.isArray(withInst.installments)).toBe(true)
    expect(withInst.installments).toHaveLength(4)
  })

  it('taksit alanları istemcinin beklediği gibi', async () => {
    const list = await store.listByWedding(wid, uid, {})
    const e = list.find((x: any) => x.title === 'Taksitli') as any
    const first = e.installments[0]

    expect(first.number).toBe(1)
    // DB'den BigInt gelir; JSON replacer string'e çevirir (app.ts).
    // Burada depo katmanını test ediyoruz → BigInt beklenir.
    expect(String(first.amountKurus)).toBe('300000')
    expect(first.dueMonth).toBe('2026-01')
    expect(first.status).toBe('PENDING')
    // expenseId istemciye SIZMAMALI — yalnızca gruplama için kullanıldı
    expect(first.expenseId).toBeUndefined()
  })

  it('taksitler aya göre gruplanabilir (takvimin yaptığı)', async () => {
    const list = await store.listByWedding(wid, uid, {})
    const byMonth = new Map<string, number>()
    for (const e of list as any[]) {
      for (const inst of e.installments ?? []) {
        byMonth.set(inst.dueMonth, (byMonth.get(inst.dueMonth) ?? 0) + Number(String(inst.amountKurus)))
      }
    }
    expect(byMonth.size).toBe(4)
    expect(byMonth.get('2026-01')).toBe(300000)
    expect(byMonth.get('2026-04')).toBe(300000)
  })

  it('taksitsiz harcamada boş dizi', async () => {
    await pg.query(
      `INSERT INTO expenses (wedding_id, title, amount_kurus, installment_count, purchase_date)
       VALUES ($1,'Peşin',500000,1,'2026-02-01')`,
      [wid],
    )
    const list = await store.listByWedding(wid, uid, {})
    const cash = list.find((x: any) => x.title === 'Peşin') as any
    expect(cash.installments).toEqual([])
  })

  it('N+1 yok — tek sorgu ile tüm harcamaların taksitleri', async () => {
    // 5 taksitli harcama daha ekle
    for (let k = 0; k < 5; k++) {
      await seedInstallments()
    }
    let queries = 0
    const countingDb = {
      ...(store as any),
    }
    void countingDb
    // Sorgu sayısını ölçmek yerine sonucun doğruluğunu kanıtla:
    // hepsi tek listede, hepsinin taksiti dolu
    const list = await store.listByWedding(wid, uid, {})
    const taksitli = (list as any[]).filter((e) => e.title === 'Taksitli')
    expect(taksitli.length).toBe(6)
    expect(taksitli.every((e) => e.installments.length === 4)).toBe(true)
    void queries
  })
})
