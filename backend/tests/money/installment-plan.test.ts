import { describe, it, expect } from 'vitest'
import {
  buildInstallmentPlan,
  addMonthsSafe,
} from '../../src/money/installment-plan.js'

describe('addMonthsSafe — ay sonu taşması (Review Focus #3)', () => {
  it('31 Ocak + 1 ay = Şubat (28 gün)', () => {
    expect(addMonthsSafe('2026-01-31', 1)).toBe('2026-02')
  })

  it('31 Ocak + 1 ay = Şubat (artık yıl, 29 gün)', () => {
    expect(addMonthsSafe('2024-01-31', 1)).toBe('2024-02')
  })

  it('31 Mart + 1 ay = Nisan (30 gün)', () => {
    expect(addMonthsSafe('2026-03-31', 1)).toBe('2026-04')
  })

  it('31 Mayıs + 1 ay = Haziran', () => {
    expect(addMonthsSafe('2026-05-31', 1)).toBe('2026-06')
  })

  it('yıl geçişi', () => {
    expect(addMonthsSafe('2026-12-15', 1)).toBe('2027-01')
  })

  it('12 ay sonra aynı ay', () => {
    expect(addMonthsSafe('2026-03-15', 12)).toBe('2027-03')
  })

  it('0 ay = aynı ay', () => {
    expect(addMonthsSafe('2026-03-15', 0)).toBe('2026-03')
  })

  it('36 ay sonra', () => {
    expect(addMonthsSafe('2026-01-15', 36)).toBe('2029-01')
  })

  it('negatif ay reddedilir', () => {
    expect(() => addMonthsSafe('2026-03-15', -1)).toThrow()
  })

  it('geçersiz tarih reddedilir', () => {
    expect(() => addMonthsSafe('gecersiz', 1)).toThrow()
    expect(() => addMonthsSafe('2026-13-01', 1)).toThrow()
    expect(() => addMonthsSafe('2026-1-1', 1)).toThrow()
  })
})

describe('buildInstallmentPlan', () => {
  it('4 taksit, 12.000 TL → 4 × 3.000', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 1_200_000n,
      count: 4,
      firstMonth: '2026-01',
    })
    expect(plan).toHaveLength(4)
    expect(plan[0]?.amountKurus).toBe(300_000n)
    expect(plan[0]?.dueMonth).toBe('2026-01')
    expect(plan[3]?.dueMonth).toBe('2026-04')
  })

  it('yuvarlama farkı son taksite (Review Focus #1)', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 10_000n,
      count: 3,
      firstMonth: '2026-01',
    })
    expect(plan.map((p) => p.amountKurus)).toEqual([3_333n, 3_333n, 3_334n])

    const total = plan.reduce((s, p) => s + p.amountKurus, 0n)
    expect(total).toBe(10_000n)
  })

  it('12 taksit, aylar sıralı', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 600_000n,
      count: 12,
      firstMonth: '2026-01',
    })
    expect(plan[0]?.dueMonth).toBe('2026-01')
    expect(plan[11]?.dueMonth).toBe('2026-12')
  })

  it('yıl geçişi', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 300_000n,
      count: 3,
      firstMonth: '2026-11',
    })
    expect(plan.map((p) => p.dueMonth)).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('tek taksit', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 500_000n,
      count: 1,
      firstMonth: '2026-06',
    })
    expect(plan).toHaveLength(1)
    expect(plan[0]?.amountKurus).toBe(500_000n)
  })

  it('taksit numarası 1\'den başlar', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 300_000n,
      count: 3,
      firstMonth: '2026-01',
    })
    expect(plan.map((p) => p.number)).toEqual([1, 2, 3])
  })

  it('ilk taksit ayı satın alma tarihinden farklı olabilir (Review Focus #2)', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 300_000n,
      count: 3,
      firstMonth: '2026-03',
    })
    expect(plan[0]?.dueMonth).toBe('2026-03')
  })

  it('taksit sayısı 0 → hata', () => {
    expect(() =>
      buildInstallmentPlan({ totalKurus: 100n, count: 0, firstMonth: '2026-01' }),
    ).toThrow()
  })

  it('36 taksit desteklenir', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 3_600_000n,
      count: 36,
      firstMonth: '2026-01',
    })
    expect(plan).toHaveLength(36)
    expect(plan[35]?.dueMonth).toBe('2028-12')
  })

  it('geçersiz firstMonth reddedilir', () => {
    expect(() =>
      buildInstallmentPlan({ totalKurus: 100n, count: 1, firstMonth: '2026-1' }),
    ).toThrow()
    expect(() =>
      buildInstallmentPlan({ totalKurus: 100n, count: 1, firstMonth: 'Ocak' }),
    ).toThrow()
  })

  it('toplam her zaman korunur (fuzz)', () => {
    for (const total of [1n, 99n, 10_000n, 1_234_567n]) {
      for (const count of [1, 2, 3, 7, 12, 36]) {
        const plan = buildInstallmentPlan({
          totalKurus: total,
          count,
          firstMonth: '2026-01',
        })
        const sum = plan.reduce((s, p) => s + p.amountKurus, 0n)
        expect(sum).toBe(total)
      }
    }
  })
})
