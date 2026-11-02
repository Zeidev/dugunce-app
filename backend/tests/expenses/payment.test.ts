import { describe, it, expect, vi } from 'vitest'
import { setInstallmentPaid } from '../../src/expenses/service.js'

/**
 * Taksit ödeme durumu — Task 10 (plandan sapma, boşluk kapatma).
 *
 * Task 5 ödenmiş taksiti koruyordu ama hiçbir yol onu PAID yapmıyordu.
 * Bu testler o yazma yolunu tanımlar.
 */

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    findInstallment: vi.fn().mockResolvedValue({
      id: 'i1',
      weddingId: 'w1',
      expenseId: 'e1',
      number: 1,
      status: 'PENDING',
      amountKurus: 300_000n,
      dueMonth: '2026-01',
      paidAt: null,
    }),
    markInstallmentPaid: vi.fn(async (_w: string, _u: string, _i: string, paid: boolean) => ({
      id: 'i1',
      weddingId: 'w1',
      expenseId: 'e1',
      number: 1,
      status: paid ? 'PAID' : 'PENDING',
      amountKurus: 300_000n,
      dueMonth: '2026-01',
      paidAt: paid ? new Date('2026-02-01T10:00:00Z') : null,
    })),
    ...overrides,
  }
}

describe('setInstallmentPaid', () => {
  it('PENDING taksit PAID yapılır ve paid_at yazılır', async () => {
    const d = makeDeps()

    const result = await setInstallmentPaid(
      { weddingId: 'w1', userId: 'u1', installmentId: 'i1', paid: true },
      d,
    )

    expect(result.status).toBe('PAID')
    expect(result.paidAt).toBeInstanceOf(Date)
    expect(d.markInstallmentPaid).toHaveBeenCalledWith('w1', 'u1', 'i1', true)
  })

  it('PAID taksit geri alınır ve paid_at temizlenir', async () => {
    const d = makeDeps({
      findInstallment: vi.fn().mockResolvedValue({
        id: 'i1',
        weddingId: 'w1',
        expenseId: 'e1',
        number: 1,
        status: 'PAID',
        amountKurus: 300_000n,
        dueMonth: '2026-01',
        paidAt: new Date('2026-01-05T09:00:00Z'),
      }),
    })

    const result = await setInstallmentPaid(
      { weddingId: 'w1', userId: 'u1', installmentId: 'i1', paid: false },
      d,
    )

    expect(result.status).toBe('PENDING')
    expect(result.paidAt).toBeNull()
    expect(d.markInstallmentPaid).toHaveBeenCalledWith('w1', 'u1', 'i1', false)
  })

  it('zaten PAID olan taksit tekrar PAID edilirse paid_at DEĞİŞMEZ (idempotent)', async () => {
    const originalPaidAt = new Date('2026-01-05T09:00:00Z')
    const d = makeDeps({
      findInstallment: vi.fn().mockResolvedValue({
        id: 'i1',
        weddingId: 'w1',
        expenseId: 'e1',
        number: 1,
        status: 'PAID',
        amountKurus: 300_000n,
        dueMonth: '2026-01',
        paidAt: originalPaidAt,
      }),
    })

    const result = await setInstallmentPaid(
      { weddingId: 'w1', userId: 'u1', installmentId: 'i1', paid: true },
      d,
    )

    // Muhasebe kaydı bozulmaz: ilk ödeme tarihi korunur
    expect(result.paidAt).toEqual(originalPaidAt)
    // Gereksiz yazma yapılmaz
    expect(d.markInstallmentPaid).not.toHaveBeenCalled()
  })

  it('zaten PENDING olan taksit tekrar PENDING edilirse yazma yapılmaz', async () => {
    const d = makeDeps()

    const result = await setInstallmentPaid(
      { weddingId: 'w1', userId: 'u1', installmentId: 'i1', paid: false },
      d,
    )

    expect(result.status).toBe('PENDING')
    expect(d.markInstallmentPaid).not.toHaveBeenCalled()
  })

  it('üye olunmayan taksit null döner (404 için)', async () => {
    const d = makeDeps({ findInstallment: vi.fn().mockResolvedValue(null) })

    const result = await setInstallmentPaid(
      { weddingId: 'w1', userId: 'yabanci', installmentId: 'i1', paid: true },
      d,
    )

    expect(result).toBeNull()
    expect(d.markInstallmentPaid).not.toHaveBeenCalled()
  })

  it('başka düğünün taksiti bulunamaz (IDOR)', async () => {
    const d = makeDeps({ findInstallment: vi.fn().mockResolvedValue(null) })

    const result = await setInstallmentPaid(
      { weddingId: 'w-baska', userId: 'u1', installmentId: 'i1', paid: true },
      d,
    )

    expect(result).toBeNull()
    expect(d.findInstallment).toHaveBeenCalledWith('w-baska', 'u1', 'i1')
  })
})
