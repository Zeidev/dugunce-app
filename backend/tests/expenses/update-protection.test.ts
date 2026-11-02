import { describe, it, expect, vi } from 'vitest'
import { updateExpense, deleteExpense } from '../../src/expenses/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    insertExpense: vi.fn(),
    insertInstallments: vi.fn().mockResolvedValue(undefined),
    listByWedding: vi.fn(),
    findById: vi.fn().mockResolvedValue({ id: 'e1' }),
    findWithInstallments: vi.fn().mockResolvedValue({
      id: 'e1',
      weddingId: 'w1',
      title: 'Gelinlik',
      amountKurus: 1_200_000n,
      installmentCount: 4,
      firstInstallmentMonth: '2026-01',
      purchaseDate: new Date('2026-01-15T00:00:00Z'),
      installments: [
        { number: 1, status: 'PENDING', amountKurus: 300_000n },
        { number: 2, status: 'PENDING', amountKurus: 300_000n },
      ],
    }),
    updateExpense: vi.fn().mockResolvedValue({ id: 'e1', title: 'Yeni' }),
    softDelete: vi.fn().mockResolvedValue(true),
    deleteInstallments: vi.fn().mockResolvedValue(2),
    ...overrides,
  }
}

describe('updateExpense — ödenmiş taksit koruması (Review Focus #5)', () => {
  it('ödenmiş taksit varsa taksit sayısı değiştirilemez', async () => {
    const d = makeDeps({
      findWithInstallments: vi.fn().mockResolvedValue({
        id: 'e1', weddingId: 'w1', title: 'X', amountKurus: 1_200_000n,
        installmentCount: 4, firstInstallmentMonth: '2026-01',
        purchaseDate: new Date('2026-01-15T00:00:00Z'),
        installments: [
          { number: 1, status: 'PAID', amountKurus: 300_000n },
          { number: 2, status: 'PENDING', amountKurus: 300_000n },
        ],
      }),
    })

    await expect(
      updateExpense(
        { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { installmentCount: 6 } },
        d,
      ),
    ).rejects.toThrow(/ödenmiş/i)
  })

  it('ödenmiş taksit varsa tutar değiştirilemez', async () => {
    const d = makeDeps({
      findWithInstallments: vi.fn().mockResolvedValue({
        id: 'e1', weddingId: 'w1', title: 'X', amountKurus: 1_200_000n,
        installmentCount: 4, firstInstallmentMonth: '2026-01',
        purchaseDate: new Date('2026-01-15T00:00:00Z'),
        installments: [{ number: 1, status: 'PAID', amountKurus: 300_000n }],
      }),
    })

    await expect(
      updateExpense(
        { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '20000' } },
        d,
      ),
    ).rejects.toThrow(/ödenmiş/i)
  })

  it('ödenmiş taksit varsa ilk taksit ayı değiştirilemez', async () => {
    const d = makeDeps({
      findWithInstallments: vi.fn().mockResolvedValue({
        id: 'e1', weddingId: 'w1', title: 'X', amountKurus: 1_200_000n,
        installmentCount: 4, firstInstallmentMonth: '2026-01',
        purchaseDate: new Date('2026-01-15T00:00:00Z'),
        installments: [{ number: 1, status: 'PAID', amountKurus: 300_000n }],
      }),
    })

    await expect(
      updateExpense(
        {
          weddingId: 'w1', userId: 'u1', expenseId: 'e1',
          patch: { firstInstallmentMonth: '2026-03' },
        },
        d,
      ),
    ).rejects.toThrow(/ödenmiş/i)
  })

  it('ödenmiş taksit varsa BAŞLIK değiştirilebilir', async () => {
    const d = makeDeps({
      findWithInstallments: vi.fn().mockResolvedValue({
        id: 'e1', weddingId: 'w1', title: 'Eski', amountKurus: 1_200_000n,
        installmentCount: 4, firstInstallmentMonth: '2026-01',
        purchaseDate: new Date('2026-01-15T00:00:00Z'),
        installments: [{ number: 1, status: 'PAID', amountKurus: 300_000n }],
      }),
    })

    const r = await updateExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { title: 'Yeni' } },
      d,
    )
    expect(r).toBeDefined()
  })

  it('ödenmiş taksit yoksa tutar değiştirilebilir', async () => {
    const d = makeDeps()
    const r = await updateExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '20000' } },
      d,
    )
    expect(r).toBeDefined()
  })

  it('tutar değişince taksitler yeniden üretilir', async () => {
    const d = makeDeps()
    await updateExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '20000' } },
      d,
    )
    expect(d.deleteInstallments).toHaveBeenCalledWith('e1')
    expect(d.insertInstallments).toHaveBeenCalledOnce()
  })

  it('yeni taksitler doğru toplamı verir', async () => {
    const d = makeDeps()
    await updateExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '100' } },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as { amountKurus: bigint }[]
    const sum = rows.reduce((s, r) => s + r.amountKurus, 0n)
    expect(sum).toBe(10_000n)
  })

  it('başlık değişince taksitlere dokunulmaz', async () => {
    const d = makeDeps()
    await updateExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { title: 'Yeni' } },
      d,
    )
    expect(d.deleteInstallments).not.toHaveBeenCalled()
    expect(d.insertInstallments).not.toHaveBeenCalled()
  })

  it('üye olunmayan harcama null döner (404 için)', async () => {
    const d = makeDeps({ findWithInstallments: vi.fn().mockResolvedValue(null) })
    const r = await updateExpense(
      { weddingId: 'w2', userId: 'u1', expenseId: 'e2', patch: { title: 'Hack' } },
      d,
    )
    expect(r).toBeNull()
    expect(d.updateExpense).not.toHaveBeenCalled()
  })

  it('boş patch hata fırlatır', async () => {
    const d = makeDeps()
    await expect(
      updateExpense({ weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: {} }, d),
    ).rejects.toThrow(/alan/i)
  })

  it('transaction içinde çalışır', async () => {
    const d = makeDeps()
    await updateExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { title: 'X' } },
      d,
    )
    expect(d.transaction).toHaveBeenCalledOnce()
  })
})

describe('deleteExpense', () => {
  it('soft delete çağırır', async () => {
    const d = makeDeps()
    const r = await deleteExpense(
      { weddingId: 'w1', userId: 'u1', expenseId: 'e1' },
      d,
    )
    expect(r).toBe(true)
    expect(d.softDelete).toHaveBeenCalledWith('e1')
  })

  it('üye olunmayan harcama silinemez', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await deleteExpense(
      { weddingId: 'w2', userId: 'u1', expenseId: 'e2' },
      d,
    )
    expect(r).toBe(false)
    expect(d.softDelete).not.toHaveBeenCalled()
  })

  it('findById weddingId + userId ile çağrılır', async () => {
    const d = makeDeps()
    await deleteExpense({ weddingId: 'w1', userId: 'u1', expenseId: 'e1' }, d)
    expect(d.findById).toHaveBeenCalledWith('e1', 'w1', 'u1')
  })
})
