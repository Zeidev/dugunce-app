import { eq, and, isNull, sql, desc, inArray } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import {
  expenses,
  installments,
  weddingMembers,
  weddings,
} from '../db/schema.js'
import type { ExpenseDeps, ExpenseRecord, InstallmentInput, UpdateExpenseDeps, PaymentDeps } from './service.js'
import type { BudgetSummaryDeps, SideBreakdown, CategoryBreakdown, MonthTotal } from './summary.js'
import type { Kurus } from '../money/money.js'
import { expenseCategories } from '../db/schema.js'

/**
 * Harcama deposunun Drizzle implementasyonu.
 *
 * KRİTİK: Tüm sorgular `wedding_id` + üyelik join'i ile kapsamlı.
 * Başka kullanıcının düğününün verisi asla dönmez (SECURITY §1.1).
 */

/** Üyelik kontrolü — her sorguya eklenir. */
function memberJoinCondition(weddingId: string, userId: string) {
  return and(
    eq(weddingMembers.weddingId, weddingId),
    eq(weddingMembers.userId, userId),
  )
}

/**
 * @param dbOverride — test için enjekte edilebilir Drizzle örneği (PGlite).
 *   Verilmezse üretim bağlantısı kullanılır.
 */
export function drizzleExpenseDeps(
  dbOverride?: ReturnType<typeof getDb>,
): ExpenseDeps & UpdateExpenseDeps & BudgetSummaryDeps & PaymentDeps {
  const db = dbOverride ?? getDb()

  return {
    // --- Transaction ---
    async transaction(fn) {
      return db.transaction(async (tx) => fn(tx))
    },

    // --- Yazma ---
    async insertExpense(values) {
      const rows = await db
        .insert(expenses)
        .values(values as typeof expenses.$inferInsert)
        .returning()
      const row = rows[0]
      if (!row) throw new Error('Harcama oluşturulamadı')
      return row as unknown as ExpenseRecord
    },

    async insertInstallments(rows: InstallmentInput[]) {
      if (rows.length === 0) return
      await db.insert(installments).values(
        rows.map((r) => ({
          weddingId: r.weddingId,
          expenseId: r.expenseId,
          number: r.number,
          amountKurus: r.amountKurus,
          dueMonth: r.dueMonth,
        })),
      )
    },

    async updateExpense(expenseId, patch) {
      const rows = await db
        .update(expenses)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
        .returning()
      return (rows[0] as unknown as ExpenseRecord) ?? null
    },

    async softDelete(expenseId) {
      const rows = await db
        .update(expenses)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
        .returning({ id: expenses.id })
      return rows.length > 0
    },

    async deleteInstallments(expenseId) {
      // Yalnızca ödenmemiş taksitler silinir — ödenmişler muhasebe kaydı
      const rows = await db
        .delete(installments)
        .where(
          and(
            eq(installments.expenseId, expenseId),
            eq(installments.status, 'PENDING'),
          ),
        )
        .returning({ id: installments.id })
      return rows.length
    },

    // --- Okuma ---
    async listByWedding(weddingId, userId, opts) {
      const conditions = [
        eq(expenses.weddingId, weddingId),
        memberJoinCondition(weddingId, userId),
      ]

      if (!opts.includeDeleted) {
        conditions.push(isNull(expenses.deletedAt))
      }
      if (opts.categoryId) {
        conditions.push(eq(expenses.categoryId, opts.categoryId))
      }

      const rows = await db
        .select({
          id: expenses.id,
          weddingId: expenses.weddingId,
          title: expenses.title,
          description: expenses.description,
          amountKurus: expenses.amountKurus,
          currency: expenses.currency,
          categoryId: expenses.categoryId,
          paidBySide: expenses.paidBySide,
          paidByPersonId: expenses.paidByPersonId,
          paymentMethod: expenses.paymentMethod,
          paymentStatus: expenses.paymentStatus,
          cardId: expenses.cardId,
          installmentCount: expenses.installmentCount,
          firstInstallmentMonth: expenses.firstInstallmentMonth,
          purchaseDate: expenses.purchaseDate,
          createdAt: expenses.createdAt,
          deletedAt: expenses.deletedAt,
        })
        .from(expenses)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, expenses.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(expenses.purchaseDate))

      const list = rows as unknown as ExpenseRecord[]
      if (list.length === 0) return list

      /**
       * Taksitleri TEK sorguda ekle.
       *
       * Bildirilen hata: panel "yaklaşan ödemeler"i gösteriyordu (özet
       * ayrı bir uçtan geliyor) ama takvim boştu — çünkü liste yanıtı
       * `installments` alanını hiç taşımıyordu ve istemci
       * `e.installments.map { … }` üzerinde boş dizi görüyordu.
       *
       * N+1'den kaçınmak için `inArray` ile tek sorgu; harcama başına
       * ayrı sorgu atmak 100 harcamada 101 sorgu olurdu.
       */
      const expenseIds = list.map((e) => e.id)
      const inst = await db
        .select({
          expenseId: installments.expenseId,
          id: installments.id,
          number: installments.number,
          amountKurus: installments.amountKurus,
          dueMonth: installments.dueMonth,
          status: installments.status,
          paidAt: installments.paidAt,
        })
        .from(installments)
        .where(inArray(installments.expenseId, expenseIds))
        .orderBy(installments.number)

      const byExpense = new Map<string, typeof inst>()
      for (const row of inst) {
        const arr = byExpense.get(row.expenseId)
        if (arr) arr.push(row)
        else byExpense.set(row.expenseId, [row])
      }

      for (const e of list) {
        // `expenseId` istemciye sızdırılmaz — yalnızca gruplama için
        const items = (byExpense.get(e.id) ?? []).map(({ expenseId: _drop, ...rest }) => rest)
        ;(e as unknown as { installments: unknown }).installments = items
      }

      return list
    },

    async findById(expenseId, weddingId, userId) {
      const rows = await db
        .select({
          id: expenses.id,
          weddingId: expenses.weddingId,
          title: expenses.title,
          amountKurus: expenses.amountKurus,
          purchaseDate: expenses.purchaseDate,
          deletedAt: expenses.deletedAt,
        })
        .from(expenses)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, expenses.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(expenses.id, expenseId),
            eq(expenses.weddingId, weddingId),
            isNull(expenses.deletedAt),
          ),
        )
        .limit(1)
      return (rows[0] as unknown as ExpenseRecord) ?? null
    },

    async findWithInstallments(expenseId, weddingId, userId) {
      const base = await db
        .select({
          id: expenses.id,
          weddingId: expenses.weddingId,
          title: expenses.title,
          amountKurus: expenses.amountKurus,
          installmentCount: expenses.installmentCount,
          firstInstallmentMonth: expenses.firstInstallmentMonth,
          purchaseDate: expenses.purchaseDate,
        })
        .from(expenses)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, expenses.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(expenses.id, expenseId),
            eq(expenses.weddingId, weddingId),
            isNull(expenses.deletedAt),
          ),
        )
        .limit(1)

      const expense = base[0]
      if (!expense) return null

      const inst = await db
        .select({
          number: installments.number,
          status: installments.status,
          amountKurus: installments.amountKurus,
        })
        .from(installments)
        .where(eq(installments.expenseId, expenseId))
        .orderBy(installments.number)

      return {
        ...(expense as unknown as ExpenseRecord),
        installmentCount: expense.installmentCount,
        installments: inst as unknown as { number: number; status: string; amountKurus: Kurus }[],
      }
    },

    // --- Özet ---
    /**
     * Düğünün saat dilimi — "bu ay" hesabı için.
     *
     * Üyelik join'i ile: başka düğünün saat dilimi dönmez (SECURITY §1.1).
     */
    async weddingTimezone(weddingId, userId) {
      const rows = await db
        .select({ timezone: weddings.timezone })
        .from(weddings)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, weddings.id),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(eq(weddings.id, weddingId))
        .limit(1)
      return rows[0]?.timezone ?? null
    },

    async sumExpenses(weddingId, userId) {
      const rows = await db
        .select({
          total: sql<string>`COALESCE(SUM(${expenses.amountKurus}), 0)`,
        })
        .from(expenses)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, expenses.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(
          and(eq(expenses.weddingId, weddingId), isNull(expenses.deletedAt)),
        )
      return BigInt(rows[0]?.total ?? '0')
    },

    async sumInstallmentsDue(weddingId, userId, month) {
      const rows = await db
        .select({
          total: sql<string>`COALESCE(SUM(${installments.amountKurus}), 0)`,
        })
        .from(installments)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, installments.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .innerJoin(expenses, eq(expenses.id, installments.expenseId))
        .where(
          and(
            eq(installments.weddingId, weddingId),
            eq(installments.dueMonth, month),
            eq(installments.status, 'PENDING'),
            isNull(expenses.deletedAt),
          ),
        )
      return BigInt(rows[0]?.total ?? '0')
    },

    async sumRemainingCommitment(weddingId, userId, month) {
      const rows = await db
        .select({
          total: sql<string>`COALESCE(SUM(${installments.amountKurus}), 0)`,
        })
        .from(installments)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, installments.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .innerJoin(expenses, eq(expenses.id, installments.expenseId))
        .where(
          and(
            eq(installments.weddingId, weddingId),
            sql`${installments.dueMonth} > ${month}`,
            eq(installments.status, 'PENDING'),
            isNull(expenses.deletedAt),
          ),
        )
      return BigInt(rows[0]?.total ?? '0')
    },

    async sumBySide(weddingId, userId): Promise<SideBreakdown> {
      const rows = await db
        .select({
          side: expenses.paidBySide,
          total: sql<string>`COALESCE(SUM(${expenses.amountKurus}), 0)`,
        })
        .from(expenses)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, expenses.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .where(
          and(eq(expenses.weddingId, weddingId), isNull(expenses.deletedAt)),
        )
        .groupBy(expenses.paidBySide)

      const result: SideBreakdown = { BRIDE: 0n, GROOM: 0n, SHARED: 0n }
      for (const row of rows) {
        const key = row.side as keyof SideBreakdown
        if (key in result) result[key] = BigInt(row.total)
      }
      return result
    },

    // --- Taksit ödeme durumu (Task 10) ---
    async findInstallment(weddingId, userId, installmentId) {
      const rows = await db
        .select({
          id: installments.id,
          weddingId: installments.weddingId,
          expenseId: installments.expenseId,
          number: installments.number,
          status: installments.status,
          amountKurus: installments.amountKurus,
          dueMonth: installments.dueMonth,
          paidAt: installments.paidAt,
        })
        .from(installments)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, installments.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .innerJoin(expenses, eq(expenses.id, installments.expenseId))
        .where(
          and(
            eq(installments.weddingId, weddingId),
            eq(installments.id, installmentId),
            // Silinmiş harcamanın taksiti ödenmiş işaretlenemez
            isNull(expenses.deletedAt),
          ),
        )
        .limit(1)

      const row = rows[0]
      if (!row) return null
      return {
        ...row,
        status: row.status as 'PENDING' | 'PAID',
        amountKurus: BigInt(row.amountKurus),
      }
    },

    async markInstallmentPaid(weddingId, userId, installmentId, paid) {
      const rows = await db
        .update(installments)
        .set({
          status: paid ? 'PAID' : 'PENDING',
          paidAt: paid ? new Date() : null,
        })
        .where(
          and(
            eq(installments.weddingId, weddingId),
            eq(installments.id, installmentId),
            // Üyelik kontrolü — başka düğünün taksiti güncellenemez
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${installments.weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning({
          id: installments.id,
          weddingId: installments.weddingId,
          expenseId: installments.expenseId,
          number: installments.number,
          status: installments.status,
          amountKurus: installments.amountKurus,
          dueMonth: installments.dueMonth,
          paidAt: installments.paidAt,
        })

      const row = rows[0]
      if (!row) throw new Error('Taksit güncellenemedi')
      return {
        ...row,
        status: row.status as 'PENDING' | 'PAID',
        amountKurus: BigInt(row.amountKurus),
      }
    },

    async sumByCategory(weddingId, userId): Promise<CategoryBreakdown[]> {
      const rows = await db
        .select({
          categoryId: expenses.categoryId,
          categoryName: expenseCategories.name,
          total: sql<string>`COALESCE(SUM(${expenses.amountKurus}), 0)`,
        })
        .from(expenses)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, expenses.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .where(
          and(eq(expenses.weddingId, weddingId), isNull(expenses.deletedAt)),
        )
        .groupBy(expenses.categoryId, expenseCategories.name)

      return rows.map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName ?? 'Kategorisiz',
        totalKurus: BigInt(r.total),
      }))
    },

    async installmentSchedule(weddingId, userId): Promise<MonthTotal[]> {
      const rows = await db
        .select({
          month: installments.dueMonth,
          total: sql<string>`COALESCE(SUM(${installments.amountKurus}), 0)`,
        })
        .from(installments)
        .innerJoin(
          weddingMembers,
          and(
            eq(weddingMembers.weddingId, installments.weddingId),
            eq(weddingMembers.userId, userId),
          ),
        )
        .innerJoin(expenses, eq(expenses.id, installments.expenseId))
        .where(
          and(
            eq(installments.weddingId, weddingId),
            eq(installments.status, 'PENDING'),
            isNull(expenses.deletedAt),
          ),
        )
        .groupBy(installments.dueMonth)
        .orderBy(installments.dueMonth)

      return rows.map((r) => ({ month: r.month, totalKurus: BigInt(r.total) }))
    },
  }
}

/** Kullanılmayan import uyarısını önle. */
void inArray
