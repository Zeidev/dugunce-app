import { z } from 'zod'
import { toKurus, type Kurus } from '../money/money.js'
import { buildInstallmentPlan } from '../money/installment-plan.js'

/**
 * Harcama servisi — iş mantığı.
 *
 * Tüm fonksiyonlar `userId` alır: IDOR koruması middleware'e ek olarak
 * servis katmanında da uygulanır (defense in depth, SECURITY §16.1).
 */

const MAX_TITLE = 200
const MAX_DESCRIPTION = 2000

const PAID_BY_SIDES = ['BRIDE', 'GROOM', 'SHARED'] as const
const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const
const PAYMENT_STATUSES = ['PAID', 'PENDING', 'PARTIAL'] as const

const baseSchema = z.object({
  title: z.string().trim().min(1, 'Başlık boş olamaz').max(MAX_TITLE),
  description: z.string().trim().max(MAX_DESCRIPTION).optional(),
  amount: z.string().or(z.number()),
  categoryId: z.string().uuid().optional(),
  paidBySide: z.enum(PAID_BY_SIDES).default('SHARED'),
  paidByPersonId: z.string().uuid().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  paymentStatus: z.enum(PAYMENT_STATUSES).default('PAID'),
  cardId: z.string().uuid().optional(),
  installmentCount: z.number().int().min(1).max(36).optional(),
  firstInstallmentMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM formatı bekleniyor')
    .optional(),
  purchaseDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'Geçersiz tarih',
  }),
})

export interface ValidatedExpenseInput {
  title: string
  description?: string
  amountKurus: Kurus
  categoryId?: string
  paidBySide: (typeof PAID_BY_SIDES)[number]
  paidByPersonId?: string
  paymentMethod: (typeof PAYMENT_METHODS)[number]
  paymentStatus: (typeof PAYMENT_STATUSES)[number]
  cardId?: string
  installmentCount: number
  firstInstallmentMonth: string
  purchaseDate: Date
}

/**
 * Girdiyi doğrular ve normalleştirir.
 *
 * Kurallar:
 * - Tutar > 0
 * - Taksit 1 ise ilk ay satın alma tarihinden türetilir
 * - Taksit > 1 ise ilk ay **zorunlu** (SECURITY §10.1 #2)
 */
export function validateExpenseInput(input: unknown): ValidatedExpenseInput {
  const parsed = baseSchema.parse(input)

  const amountKurus = toKurus(parsed.amount)
  if (amountKurus <= 0n) {
    throw new Error('Tutar sıfırdan büyük olmalı')
  }

  const installmentCount = parsed.installmentCount ?? 1

  let firstInstallmentMonth = parsed.firstInstallmentMonth
  if (installmentCount > 1) {
    if (!firstInstallmentMonth) {
      throw new Error('Taksitli harcamada ilk taksit ayı zorunlu')
    }
  } else if (!firstInstallmentMonth) {
    // Tek taksit → satın alma ayı
    const d = new Date(parsed.purchaseDate)
    firstInstallmentMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }

  const result: ValidatedExpenseInput = {
    title: parsed.title,
    amountKurus,
    paidBySide: parsed.paidBySide,
    paymentMethod: parsed.paymentMethod,
    paymentStatus: parsed.paymentStatus,
    installmentCount,
    firstInstallmentMonth,
    purchaseDate: new Date(parsed.purchaseDate),
  }

  if (parsed.description !== undefined) result.description = parsed.description
  if (parsed.categoryId !== undefined) result.categoryId = parsed.categoryId
  if (parsed.paidByPersonId !== undefined) result.paidByPersonId = parsed.paidByPersonId
  if (parsed.cardId !== undefined) result.cardId = parsed.cardId

  return result
}

// --- Deps ---

export interface ExpenseRecord {
  id: string
  weddingId: string
  title: string
  amountKurus: Kurus
  [key: string]: unknown
}

export interface InstallmentInput {
  weddingId: string
  expenseId: string
  number: number
  amountKurus: Kurus
  dueMonth: string
}

export interface ExpenseDeps {
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
  insertExpense: (values: Record<string, unknown>) => Promise<ExpenseRecord>
  insertInstallments: (rows: InstallmentInput[]) => Promise<unknown>
  listByWedding: (
    weddingId: string,
    userId: string,
    opts: { includeDeleted: boolean; month?: string; categoryId?: string },
  ) => Promise<ExpenseRecord[]>
  findById: (
    expenseId: string,
    weddingId: string,
    userId: string,
  ) => Promise<ExpenseRecord | null>
  updateExpense: (
    expenseId: string,
    patch: Record<string, unknown>,
  ) => Promise<ExpenseRecord | null>
  softDelete: (expenseId: string) => Promise<boolean>
  deleteInstallments: (expenseId: string) => Promise<number>
}

/**
 * Harcama oluşturur + taksitleri üretir.
 *
 * Transaction içinde: harcama ve taksitler atomik. Biri başarısızsa
 * ikisi de geri alınır.
 */
export async function createExpense(
  params: { userId: string; weddingId: string; input: unknown },
  deps: ExpenseDeps,
): Promise<ExpenseRecord> {
  const input = validateExpenseInput(params.input)

  return deps.transaction(async () => {
    const expense = await deps.insertExpense({
      weddingId: params.weddingId,
      title: input.title,
      description: input.description ?? null,
      amountKurus: input.amountKurus,
      categoryId: input.categoryId ?? null,
      paidBySide: input.paidBySide,
      paidByPersonId: input.paidByPersonId ?? null,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      cardId: input.cardId ?? null,
      installmentCount: input.installmentCount,
      firstInstallmentMonth: input.firstInstallmentMonth,
      purchaseDate: input.purchaseDate,
      createdBy: params.userId,
    })

    // Taksit kaydı YALNIZ gerçek taksitte (count > 1) oluşturulur.
    //
    // ÖNCE: `buildInstallmentPlan` her zaman çağrılıyordu; `count=1` için
    // TEK satırlık bir "taksit" üretiyordu. Takvim bu tablodan beslendiği
    // için peşin (veya nakit) harcama da takvimde taksit gibi görünüyordu
    // — kullanıcının bildirdiği hata.
    //
    // Peşin harcamanın takvimde işi yok: ödeme tarihi `purchaseDate` ve
    // durumu `paymentStatus` ile zaten takip ediliyor.
    if (input.installmentCount > 1) {
      const plan = buildInstallmentPlan({
        totalKurus: input.amountKurus,
        count: input.installmentCount,
        firstMonth: input.firstInstallmentMonth,
      })

      await deps.insertInstallments(
        plan.map((row) => ({
          weddingId: params.weddingId,
          expenseId: expense.id,
          number: row.number,
          amountKurus: row.amountKurus,
          dueMonth: row.dueMonth,
        })),
      )
    }

    return expense
  })
}

/** Harcamaları listeler — üyelik kontrolü store katmanında. */
export async function listExpenses(
  params: {
    weddingId: string
    userId: string
    includeDeleted?: boolean
    month?: string
    categoryId?: string
  },
  deps: Pick<ExpenseDeps, 'listByWedding'>,
): Promise<ExpenseRecord[]> {
  return deps.listByWedding(params.weddingId, params.userId, {
    includeDeleted: params.includeDeleted ?? false,
    ...(params.month !== undefined ? { month: params.month } : {}),
    ...(params.categoryId !== undefined ? { categoryId: params.categoryId } : {}),
  })
}

// ---------------------------------------------------------------------------
// Güncelleme — ödenmiş taksit koruması (Review Focus #5)
// ---------------------------------------------------------------------------

export interface ExpenseWithInstallments extends ExpenseRecord {
  installmentCount: number | null
  installments: { number: number; status: string; amountKurus: Kurus }[]
}

export interface UpdateExpenseDeps extends ExpenseDeps {
  findWithInstallments: (
    expenseId: string,
    weddingId: string,
    userId: string,
  ) => Promise<ExpenseWithInstallments | null>
}

export interface UpdateExpenseParams {
  weddingId: string
  userId: string
  expenseId: string
  patch: unknown
}

/**
 * Harcamayı günceller.
 *
 * GÜVENLİK KURALI (SECURITY §10.1 #5):
 * "Taksit sayısı/tutarı değişince geçmiş ödemeler sessizce değiştirilmez."
 *
 * Ödenmiş taksit varsa tutar veya taksit sayısı değiştirilemez — kullanıcı
 * önce ödemeyi geri almalı. Bu bilinçli bir sürtünme: muhasebe tutarlılığı
 * sessiz değişiklikten daha önemli.
 *
 * Başlık, kategori, açıklama gibi alanlar her zaman değiştirilebilir.
 */
export async function updateExpense(
  params: UpdateExpenseParams,
  deps: UpdateExpenseDeps,
): Promise<ExpenseRecord | null> {
  const patch = validateExpensePatch(params.patch)

  const existing = await deps.findWithInstallments(
    params.expenseId,
    params.weddingId,
    params.userId,
  )
  if (!existing) return null

  const hasPaid = existing.installments.some((i) => i.status === 'PAID')

  const changesMoney =
    patch.amount !== undefined || patch.installmentCount !== undefined
  const changesFirstMonth = patch.firstInstallmentMonth !== undefined

  if (hasPaid && (changesMoney || changesFirstMonth)) {
    throw new Error(
      'Ödenmiş taksitler varken tutar veya taksit planı değiştirilemez. ' +
        'Önce ödemeleri geri alın.',
    )
  }

  return deps.transaction(async () => {
    const dbPatch: Record<string, unknown> = {}

    if (patch.title !== undefined) dbPatch['title'] = patch.title
    if (patch.description !== undefined) dbPatch['description'] = patch.description
    if (patch.categoryId !== undefined) dbPatch['categoryId'] = patch.categoryId
    if (patch.paidBySide !== undefined) dbPatch['paidBySide'] = patch.paidBySide
    if (patch.paymentMethod !== undefined) dbPatch['paymentMethod'] = patch.paymentMethod
    if (patch.paymentStatus !== undefined) dbPatch['paymentStatus'] = patch.paymentStatus
    if (patch.purchaseDate !== undefined) {
      dbPatch['purchaseDate'] = new Date(patch.purchaseDate)
    }

    // Para/taksit değişikliği varsa taksitleri yeniden üret
    if (changesMoney || changesFirstMonth) {
      const amountKurus =
        patch.amount !== undefined ? toKurus(patch.amount) : existing.amountKurus
      if (amountKurus <= 0n) throw new Error('Tutar sıfırdan büyük olmalı')

      const count = patch.installmentCount ?? existing.installmentCount ?? 1
      const firstMonth =
        patch.firstInstallmentMonth ??
        (existing.firstInstallmentMonth as string | undefined) ??
        monthOf(existing)

      dbPatch['amountKurus'] = amountKurus
      dbPatch['installmentCount'] = count
      dbPatch['firstInstallmentMonth'] = firstMonth

      await deps.deleteInstallments(params.expenseId)

      // Peşin (count=1) ise taksit kaydı ÜRETİLMEZ — takvimde görünmesin.
      // (Aynı kural oluşturmada da geçerli; bkz. createExpense.)
      if (count > 1) {
        const plan = buildInstallmentPlan({
          totalKurus: amountKurus,
          count,
          firstMonth,
        })

        await deps.insertInstallments(
          plan.map((row) => ({
            weddingId: params.weddingId,
            expenseId: params.expenseId,
            number: row.number,
            amountKurus: row.amountKurus,
            dueMonth: row.dueMonth,
          })),
        )
      }
    }

    if (Object.keys(dbPatch).length === 0) {
      throw new Error('Güncellenecek alan yok')
    }

    return deps.updateExpense(params.expenseId, dbPatch)
  })
}

function monthOf(expense: ExpenseRecord): string {
  const d = expense['purchaseDate']
  const date = d instanceof Date ? d : new Date(String(d))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE).optional(),
  description: z.string().trim().max(MAX_DESCRIPTION).optional(),
  amount: z.string().or(z.number()).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  paidBySide: z.enum(PAID_BY_SIDES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  installmentCount: z.number().int().min(1).max(36).optional(),
  firstInstallmentMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  purchaseDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Geçersiz tarih' })
    .optional(),
})

export type ExpensePatch = z.infer<typeof patchSchema>

export function validateExpensePatch(input: unknown): ExpensePatch {
  return patchSchema.parse(input)
}

// ---------------------------------------------------------------------------
// Silme — soft delete
// ---------------------------------------------------------------------------

/**
 * Harcamayı siler (soft delete).
 *
 * Neden soft delete:
 * - Kota ve raporlar tutarlı kalsın
 * - Kullanıcı yanlışlıkla silerse geri alınabilir
 * - Fiziksel silme yalnızca KVKK talebi / düğün silindiğinde (CASCADE)
 *
 * Ödenmiş taksitler silinmez (muhasebe kaydı).
 */
export async function deleteExpense(
  params: { weddingId: string; userId: string; expenseId: string },
  deps: Pick<ExpenseDeps, 'findById' | 'softDelete'>,
): Promise<boolean> {
  const existing = await deps.findById(params.expenseId, params.weddingId, params.userId)
  if (!existing) return false
  return deps.softDelete(params.expenseId)
}

// ---------------------------------------------------------------------------
// Taksit ödeme durumu
// ---------------------------------------------------------------------------

export interface InstallmentRecord {
  id: string
  weddingId: string
  expenseId: string
  number: number
  status: 'PENDING' | 'PAID'
  amountKurus: Kurus
  dueMonth: string
  paidAt: Date | null
}

export interface PaymentDeps {
  /** Üyelik join'i ile — başka düğünün taksiti dönmez (SECURITY §1.1). */
  findInstallment: (
    weddingId: string,
    userId: string,
    installmentId: string,
  ) => Promise<InstallmentRecord | null>
  markInstallmentPaid: (
    weddingId: string,
    userId: string,
    installmentId: string,
    paid: boolean,
  ) => Promise<InstallmentRecord>
}

export interface SetInstallmentPaidParams {
  weddingId: string
  userId: string
  installmentId: string
  paid: boolean
}

/**
 * Taksiti ödenmiş / ödenmemiş olarak işaretler.
 *
 * **İdempotent:** zaten istenen durumdaysa yazma yapılmaz ve `paid_at`
 * korunur. Bu kritik — ağ tekrar denemesi veya çift tıklama ilk ödeme
 * tarihini ezmemeli (muhasebe kaydı).
 *
 * Ödemenin geri alınması (`paid: false`) `paid_at`'i temizler; böylece
 * Task 5'teki "ödenmiş taksit koruması" da açılır (taksit artık PENDING).
 *
 * @returns null — taksit yoksa veya kullanıcı o düğünün üyesi değilse (404)
 */
export async function setInstallmentPaid(
  params: SetInstallmentPaidParams,
  deps: PaymentDeps,
): Promise<InstallmentRecord | null> {
  const { weddingId, userId, installmentId, paid } = params

  const existing = await deps.findInstallment(weddingId, userId, installmentId)
  if (!existing) return null

  const targetStatus = paid ? 'PAID' : 'PENDING'

  // İdempotent: durum zaten hedefle aynıysa dokunma
  if (existing.status === targetStatus) {
    return existing
  }

  return deps.markInstallmentPaid(weddingId, userId, installmentId, paid)
}
