import { describe, it, expect, vi } from 'vitest'
import {
  createExpense,
  validateExpenseInput,
  listExpenses,
} from '../../src/expenses/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    insertExpense: vi.fn().mockResolvedValue({ id: 'e1', amountKurus: 1_200_000n }),
    insertInstallments: vi.fn().mockResolvedValue(undefined),
    listByWedding: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    updateExpense: vi.fn().mockResolvedValue(null),
    softDelete: vi.fn().mockResolvedValue(true),
    deleteInstallments: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

describe('validateExpenseInput', () => {
  it('geçerli girdi kabul edilir', () => {
    const r = validateExpenseInput({
      title: 'Gelinlik',
      amount: '12000',
      purchaseDate: '2026-01-15',
    })
    expect(r.amountKurus).toBe(1_200_000n)
  })

  it('başlık boşsa hata', () => {
    expect(() =>
      validateExpenseInput({ title: '', amount: '100', purchaseDate: '2026-01-15' }),
    ).toThrow()
  })

  it('tutar 0 ise hata', () => {
    expect(() =>
      validateExpenseInput({ title: 'X', amount: '0', purchaseDate: '2026-01-15' }),
    ).toThrow()
  })

  it('taksit 1 ise ilk ay gerekmez', () => {
    const r = validateExpenseInput({
      title: 'X', amount: '100', purchaseDate: '2026-01-15', installmentCount: 1,
    })
    expect(r.installmentCount).toBe(1)
  })

  it('taksit > 1 ise ilk taksit ayı zorunlu', () => {
    expect(() =>
      validateExpenseInput({
        title: 'X', amount: '1200', purchaseDate: '2026-01-15', installmentCount: 4,
      }),
    ).toThrow(/taksit ayı/i)
  })

  it('taksit 36 üstü reddedilir', () => {
    expect(() =>
      validateExpenseInput({
        title: 'X', amount: '1200', purchaseDate: '2026-01-15',
        installmentCount: 37, firstInstallmentMonth: '2026-01',
      }),
    ).toThrow()
  })

  it('taksit 0 reddedilir', () => {
    expect(() =>
      validateExpenseInput({
        title: 'X', amount: '1200', purchaseDate: '2026-01-15', installmentCount: 0,
      }),
    ).toThrow()
  })

  it('Türkçe karakterler korunur', () => {
    const r = validateExpenseInput({
      title: "Şükrü'nün çiçeği", amount: '100', purchaseDate: '2026-01-15',
    })
    expect(r.title).toBe("Şükrü'nün çiçeği")
  })

  it('geçersiz tarih reddedilir', () => {
    expect(() =>
      validateExpenseInput({ title: 'X', amount: '100', purchaseDate: 'gecersiz' }),
    ).toThrow()
  })

  it('paid_by_side varsayılan SHARED', () => {
    const r = validateExpenseInput({
      title: 'X', amount: '100', purchaseDate: '2026-01-15',
    })
    expect(r.paidBySide).toBe('SHARED')
  })

  it('geçersiz paid_by_side reddedilir', () => {
    expect(() =>
      validateExpenseInput({
        title: 'X', amount: '100', purchaseDate: '2026-01-15', paidBySide: 'ALIEN',
      }),
    ).toThrow()
  })

  it('taksitli harcamada kart zorunlu değil (nakit taksit olmaz ama esnek)', () => {
    const r = validateExpenseInput({
      title: 'X', amount: '1200', purchaseDate: '2026-01-15',
      installmentCount: 4, firstInstallmentMonth: '2026-01',
    })
    expect(r.installmentCount).toBe(4)
  })
})

describe('createExpense', () => {
  it('taksitsiz harcama HİÇ installment üretmez (takvimde görünmesin)', async () => {
    // ÖNCE: count=1 için tek satırlık "taksit" üretiliyordu ve takvim
    // bu tablodan beslendiği için peşin harcama da taksit gibi
    // görünüyordu (bildirilen hata).
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1',
        weddingId: 'w1',
        input: { title: 'X', amount: '1000', purchaseDate: '2026-01-15' },
      },
      d,
    )
    expect(d.insertInstallments).not.toHaveBeenCalled()
  })

  it('4 taksit → 4 installment', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1', weddingId: 'w1',
        input: {
          title: 'X', amount: '12000', purchaseDate: '2026-01-15',
          installmentCount: 4, firstInstallmentMonth: '2026-01',
        },
      },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as unknown[]
    expect(rows).toHaveLength(4)
  })

  it('taksit toplamı = harcama tutarı (Review Focus #1)', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1', weddingId: 'w1',
        input: {
          title: 'X', amount: '100', purchaseDate: '2026-01-15',
          installmentCount: 3, firstInstallmentMonth: '2026-01',
        },
      },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as { amountKurus: bigint }[]
    const sum = rows.reduce((s, r) => s + r.amountKurus, 0n)
    expect(sum).toBe(10_000n)
  })

  it('taksitler weddingId taşır (composite FK için)', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1', weddingId: 'w1',
        input: {
          title: 'X', amount: '1200', purchaseDate: '2026-01-15',
          installmentCount: 2, firstInstallmentMonth: '2026-01',
        },
      },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as { weddingId: string }[]
    expect(rows.every((r) => r.weddingId === 'w1')).toBe(true)
  })

  it('transaction içinde (atomik)', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1', weddingId: 'w1',
        input: { title: 'X', amount: '100', purchaseDate: '2026-01-15' },
      },
      d,
    )
    expect(d.transaction).toHaveBeenCalledOnce()
  })

  it('taksit ekleme hatası → harcama da geri alınır', async () => {
    // Taksitli olmalı: taksitsizde `insertInstallments` hiç çağrılmıyor.
    const d = makeDeps({ insertInstallments: vi.fn().mockRejectedValue(new Error('DB')) })
    await expect(
      createExpense(
        {
          userId: 'u1', weddingId: 'w1',
          input: {
            title: 'X', amount: '1200', purchaseDate: '2026-01-15',
            installmentCount: 3, firstInstallmentMonth: '2026-02',
          },
        },
        d,
      ),
    ).rejects.toThrow()
  })
})

describe('listExpenses', () => {
  it('weddingId + userId ile çağrılır (IDOR koruması)', async () => {
    const d = makeDeps()
    await listExpenses({ weddingId: 'w1', userId: 'u1' }, d)
    expect(d.listByWedding).toHaveBeenCalledWith(
      'w1',
      'u1',
      expect.objectContaining({ includeDeleted: false }),
    )
  })

  it('silinmiş harcamalar varsayılan gizli', async () => {
    const d = makeDeps()
    await listExpenses({ weddingId: 'w1', userId: 'u1' }, d)
    const args = d.listByWedding.mock.calls[0] as unknown[]
    expect(args[2]).toMatchObject({ includeDeleted: false })
  })

  it('includeDeleted=true ile silinmişler de gelir', async () => {
    const d = makeDeps()
    await listExpenses({ weddingId: 'w1', userId: 'u1', includeDeleted: true }, d)
    const args = d.listByWedding.mock.calls[0] as unknown[]
    expect(args[2]).toMatchObject({ includeDeleted: true })
  })
})
