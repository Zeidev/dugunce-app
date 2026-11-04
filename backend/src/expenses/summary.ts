import type { Kurus } from '../money/money.js'

/**
 * Bütçe özeti.
 *
 * KRİTİK AYRIM (SECURITY §10.1 #7):
 * "Raporda 'toplam satın alma' ile 'gelecek ay yükümlülüğü' karıştırılmaz."
 *
 * - `totalSpentKurus` — tüm satın almaların toplamı (bir kez sayılır)
 * - `dueThisMonthKurus` — bu ay ödenecek taksitler
 * - `remainingCommitmentKurus` — gelecek ayların yükümlülüğü
 *
 * İlişki: `totalSpentKurus = dueThisMonthKurus + remainingCommitmentKurus`
 * (yalnızca taksitli harcamalarda; nakit harcamalar bu aya sayılır)
 */

export interface SideBreakdown {
  BRIDE: Kurus
  GROOM: Kurus
  SHARED: Kurus
}

export interface CategoryBreakdown {
  categoryId: string | null
  categoryName: string
  totalKurus: Kurus
}

export interface MonthTotal {
  month: string
  totalKurus: Kurus
}

export interface BudgetSummary {
  /** Tüm satın almaların toplamı — taksitler burada TEKRAR sayılmaz. */
  totalSpentKurus: Kurus
  /** Seçilen ayda ödenecek taksitler. */
  dueThisMonthKurus: Kurus
  /** Bu aydan sonraki kalan yükümlülük. */
  remainingCommitmentKurus: Kurus
  bySide: SideBreakdown
  byCategory: CategoryBreakdown[]
  /** Aylık taksit takvimi. */
  installmentSchedule: MonthTotal[]
}

export interface BudgetSummaryDeps {
  sumExpenses: (weddingId: string, userId: string) => Promise<Kurus>
  sumInstallmentsDue: (
    weddingId: string,
    userId: string,
    month: string,
  ) => Promise<Kurus>
  sumRemainingCommitment: (
    weddingId: string,
    userId: string,
    month: string,
  ) => Promise<Kurus>
  sumBySide: (weddingId: string, userId: string) => Promise<SideBreakdown>
  sumByCategory: (
    weddingId: string,
    userId: string,
  ) => Promise<CategoryBreakdown[]>
  installmentSchedule: (
    weddingId: string,
    userId: string,
  ) => Promise<MonthTotal[]>
  /**
   * Düğünün saat dilimi — "bu ay" bundan hesaplanır.
   *
   * Saat dilimi okunamazsa `undefined` döner ve varsayılan kullanılır.
   */
  weddingTimezone: (weddingId: string, userId: string) => Promise<string | null>
}

export interface GetBudgetSummaryParams {
  weddingId: string
  userId: string
  /** YYYY-MM */
  month: string
}

/**
 * Bütçe özetini hesaplar.
 *
 * Tüm sorgular `weddingId` + `userId` ile yapılır — başka düğünün verisi
 * asla dönmez (SECURITY §1.1).
 *
 * @throws {Error} ay formatı geçersizse
 */
export async function getBudgetSummary(
  params: GetBudgetSummaryParams,
  deps: BudgetSummaryDeps,
): Promise<BudgetSummary> {
  const { weddingId, userId, month } = params

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Geçersiz ay: ${month} (YYYY-MM bekleniyor)`)
  }

  const [
    totalSpentKurus,
    dueThisMonthKurus,
    remainingCommitmentKurus,
    bySide,
    byCategory,
    installmentSchedule,
  ] = await Promise.all([
    deps.sumExpenses(weddingId, userId),
    deps.sumInstallmentsDue(weddingId, userId, month),
    deps.sumRemainingCommitment(weddingId, userId, month),
    deps.sumBySide(weddingId, userId),
    deps.sumByCategory(weddingId, userId),
    deps.installmentSchedule(weddingId, userId),
  ])

  return {
    totalSpentKurus,
    dueThisMonthKurus,
    remainingCommitmentKurus,
    bySide,
    byCategory,
    installmentSchedule,
  }
}
