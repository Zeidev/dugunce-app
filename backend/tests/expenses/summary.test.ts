import { describe, it, expect, vi } from 'vitest'
import { getBudgetSummary } from '../../src/expenses/summary.js'
import { formatTl } from '../../src/money/money.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    sumExpenses: vi.fn().mockResolvedValue(1_200_000n),
    sumInstallmentsDue: vi.fn().mockResolvedValue(300_000n),
    sumRemainingCommitment: vi.fn().mockResolvedValue(900_000n),
    sumBySide: vi.fn().mockResolvedValue({ BRIDE: 0n, GROOM: 0n, SHARED: 1_200_000n }),
    sumByCategory: vi.fn().mockResolvedValue([]),
    installmentSchedule: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('getBudgetSummary — çift sayım önleme (Review Focus #4)', () => {
  it('toplam harcama ile bu ay ödenecek AYRI alanlar', async () => {
    const d = makeDeps()
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.totalSpentKurus).toBe(1_200_000n)
    expect(r.dueThisMonthKurus).toBe(300_000n)
    expect(r.totalSpentKurus).not.toBe(r.dueThisMonthKurus)
  })

  it('12.000 TL 4 taksit → toplam 12.000, bu ay 3.000', async () => {
    const d = makeDeps()
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(formatTl(r.totalSpentKurus)).toBe('12.000,00 TL')
    expect(formatTl(r.dueThisMonthKurus)).toBe('3.000,00 TL')
  })

  it('gelecek ayların yükümlülüğü ayrı alan', async () => {
    const d = makeDeps()
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.remainingCommitmentKurus).toBe(900_000n)
    // Toplam = bu ay + kalan
    expect(r.dueThisMonthKurus + r.remainingCommitmentKurus).toBe(r.totalSpentKurus)
  })

  it('taraf bazlı kırılım', async () => {
    const d = makeDeps({
      sumBySide: vi.fn().mockResolvedValue({ BRIDE: 600_000n, GROOM: 400_000n, SHARED: 200_000n }),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.bySide.BRIDE).toBe(600_000n)
    expect(r.bySide.GROOM).toBe(400_000n)
    expect(r.bySide.SHARED).toBe(200_000n)
  })

  it('kategori kırılımı', async () => {
    const d = makeDeps({
      sumByCategory: vi.fn().mockResolvedValue([
        { categoryId: 'c1', categoryName: 'Gelinlik', totalKurus: 600_000n },
        { categoryId: 'c2', categoryName: 'Mekân', totalKurus: 600_000n },
      ]),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.byCategory).toHaveLength(2)
    expect(r.byCategory[0]?.categoryName).toBe('Gelinlik')
  })

  it('aylık taksit takvimi', async () => {
    const d = makeDeps({
      installmentSchedule: vi.fn().mockResolvedValue([
        { month: '2026-01', totalKurus: 300_000n },
        { month: '2026-02', totalKurus: 300_000n },
      ]),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.installmentSchedule).toHaveLength(2)
    expect(r.installmentSchedule[0]?.month).toBe('2026-01')
  })

  it('sorgular weddingId + userId ile (IDOR koruması)', async () => {
    const d = makeDeps()
    await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(d.sumExpenses).toHaveBeenCalledWith('w1', 'u1')
    expect(d.sumInstallmentsDue).toHaveBeenCalledWith('w1', 'u1', '2026-01')
  })

  it('boş düğün → sıfırlar', async () => {
    const d = makeDeps({
      sumExpenses: vi.fn().mockResolvedValue(0n),
      sumInstallmentsDue: vi.fn().mockResolvedValue(0n),
      sumRemainingCommitment: vi.fn().mockResolvedValue(0n),
      sumBySide: vi.fn().mockResolvedValue({ BRIDE: 0n, GROOM: 0n, SHARED: 0n }),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.totalSpentKurus).toBe(0n)
    expect(formatTl(r.totalSpentKurus)).toBe('0,00 TL')
  })

  it('geçersiz ay formatı reddedilir', async () => {
    const d = makeDeps()
    await expect(
      getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: 'Ocak' }, d),
    ).rejects.toThrow()
  })
})
