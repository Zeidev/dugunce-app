import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  expenses,
  installments,
  cards,
  expenseCategories,
  persons,
} from '../../src/db/schema.js'

type T = Parameters<typeof getTableConfig>[0]

const col = (t: T, n: string) => getTableConfig(t).columns.find((c) => c.name === n)

describe('expenses', () => {
  it('amount_kurus bigint (float DEĞİL)', () => {
    const c = col(expenses, 'amount_kurus')
    expect(c).toBeDefined()
    expect(c?.columnType).toBe('PgBigInt64')
  })

  it('wedding_id not null', () => {
    expect(col(expenses, 'wedding_id')?.notNull).toBe(true)
  })

  it('title not null', () => {
    expect(col(expenses, 'title')?.notNull).toBe(true)
  })

  it('deleted_at nullable (soft delete)', () => {
    expect(col(expenses, 'deleted_at')).toBeDefined()
    expect(col(expenses, 'deleted_at')?.notNull).toBe(false)
  })

  it('paid_by_side var', () => {
    expect(col(expenses, 'paid_by_side')).toBeDefined()
  })

  it('payment_method var', () => {
    expect(col(expenses, 'payment_method')).toBeDefined()
  })

  it('installment_count nullable', () => {
    expect(col(expenses, 'installment_count')?.notNull).toBe(false)
  })

  it('(id, wedding_id) unique — composite FK hedefi', () => {
    const cfg = getTableConfig(expenses)
    const uniques = cfg.uniqueConstraints.map((u) =>
      u.columns.map((c) => c.name).sort().join(','),
    )
    expect(uniques).toContain('id,wedding_id')
  })

  it('wedding_id FK cascade', () => {
    const cfg = getTableConfig(expenses)
    const fk = cfg.foreignKeys.find((f) => f.getName()?.includes('wedding'))
    expect(fk?.onDelete).toBe('cascade')
  })
})

describe('installments', () => {
  it('amount_kurus bigint', () => {
    expect(col(installments, 'amount_kurus')?.columnType).toBe('PgBigInt64')
  })

  it('due_month var ve not null', () => {
    expect(col(installments, 'due_month')?.notNull).toBe(true)
  })

  it('status not null', () => {
    expect(col(installments, 'status')?.notNull).toBe(true)
  })

  it('paid_at nullable', () => {
    expect(col(installments, 'paid_at')?.notNull).toBe(false)
  })

  it('(expense_id, number) unique', () => {
    const cfg = getTableConfig(installments)
    const uniques = cfg.uniqueConstraints.map((u) =>
      u.columns.map((c) => c.name).sort().join(','),
    )
    expect(uniques.some((u) => u.includes('expense_id') && u.includes('number'))).toBe(true)
  })

  it('composite FK (expense_id, wedding_id) var', () => {
    const cfg = getTableConfig(installments)
    // FK tek: (expense_id, wedding_id) → expenses(id, wedding_id)
    expect(cfg.foreignKeys).toHaveLength(1)
    const fk = cfg.foreignKeys[0]!
    expect(fk.onDelete).toBe('cascade')

    // reference() fonksiyonunu çalıştırıp kolonları al
    const ref = (fk as unknown as { reference: () => {
      columns: { name: string }[]
      foreignColumns: { name: string }[]
    } }).reference()
    expect(ref.columns.map((c) => c.name).sort()).toEqual(['expense_id', 'wedding_id'])
    expect(ref.foreignColumns.map((c) => c.name).sort()).toEqual(['id', 'wedding_id'])
  })
})

describe('cards', () => {
  it('last_four var', () => {
    expect(col(cards, 'last_four')).toBeDefined()
  })

  it('tam kart numarası alanı YOK', () => {
    expect(col(cards, 'card_number')).toBeUndefined()
    expect(col(cards, 'pan')).toBeUndefined()
    expect(col(cards, 'cvv')).toBeUndefined()
  })

  it('wedding_id FK cascade', () => {
    const cfg = getTableConfig(cards)
    const fk = cfg.foreignKeys.find((f) => f.getName()?.includes('wedding'))
    expect(fk?.onDelete).toBe('cascade')
  })
})

describe('expense_categories', () => {
  it('is_system var', () => {
    expect(col(expenseCategories, 'is_system')).toBeDefined()
  })

  it('wedding_id nullable (sistem kategorileri)', () => {
    expect(col(expenseCategories, 'wedding_id')?.notNull).toBe(false)
  })

  it('name not null', () => {
    expect(col(expenseCategories, 'name')?.notNull).toBe(true)
  })
})

describe('persons', () => {
  it('side var', () => {
    expect(col(persons, 'side')).toBeDefined()
  })

  it('name not null', () => {
    expect(col(persons, 'name')?.notNull).toBe(true)
  })
})
