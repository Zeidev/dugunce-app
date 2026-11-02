import { splitKurus, type Kurus } from './money.js'

/**
 * Taksit planı üretimi.
 *
 * SECURITY §10.1 kuralları:
 * - Taksit toplamı harcamaya kuruş hassasiyetinde eşit
 * - İlk taksit ayı satın alma tarihinden farklı olabilir
 * - Ayın 29/30/31'i sonraki aya güvenli taşınır
 */

export interface InstallmentRow {
  /** 1'den başlayan taksit numarası */
  number: number
  amountKurus: Kurus
  /** YYYY-MM */
  dueMonth: string
}

/**
 * Ay ekler — ay sonu taşmasını güvenli yönetir.
 *
 * Naif `Date.setMonth` 31 Ocak + 1 ay = 3 Mart verir (Şubat 31 çekmediği
 * için taşar). Bu fonksiyon yalnızca **yıl-ay** ile çalışır, gün bilgisi
 * taşımadığı için taşma imkânsızdır.
 *
 * @param date `YYYY-MM-DD` formatında tarih
 * @param months eklenecek ay sayısı (>= 0)
 * @returns `YYYY-MM`
 */
export function addMonthsSafe(date: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error('Ay sayısı negatif olamaz')
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    throw new Error(`Geçersiz tarih: ${date} (YYYY-MM-DD bekleniyor)`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) throw new Error(`Geçersiz ay: ${date}`)
  if (day < 1 || day > 31) throw new Error(`Geçersiz gün: ${date}`)

  // Yıl*12 + (ay-1) uzayında topla — taşma yok
  const totalMonths = year * 12 + (month - 1) + months
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (totalMonths % 12) + 1

  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

export interface BuildPlanParams {
  totalKurus: Kurus
  count: number
  /** İlk taksitin ayı (YYYY-MM). Satın alma tarihinden farklı olabilir. */
  firstMonth: string
}

/**
 * Taksit planı üretir.
 *
 * - Tutar eşit bölünür, **yuvarlama farkı son taksite** eklenir
 * - Aylar ardışık, ay sonu taşması yok
 * - Taksit numarası 1'den başlar
 * - Toplam her zaman `totalKurus`'a eşit
 *
 * @throws {Error} geçersiz ay formatı, count < 1 veya > 36
 */
export function buildInstallmentPlan(params: BuildPlanParams): InstallmentRow[] {
  const { totalKurus, count, firstMonth } = params

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth)) {
    throw new Error(`Geçersiz ay: ${firstMonth} (YYYY-MM bekleniyor)`)
  }

  const amounts = splitKurus(totalKurus, count)
  const baseDate = `${firstMonth}-01`

  return amounts.map((amountKurus, index) => ({
    number: index + 1,
    amountKurus,
    dueMonth: addMonthsSafe(baseDate, index),
  }))
}
