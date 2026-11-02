import { z } from 'zod'
import { eq, and, isNull, or, asc, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { expenseCategories, weddingMembers, weddings } from '../db/schema.js'

/**
 * Harcama kategorileri — brief §5.3.
 *
 * İki tür kategori var (design §7 `expense_category`):
 * - **Sistem** kategorileri: `wedding_id IS NULL`, `is_system = true`.
 *   Her düğün bunları görür; seed migration ile eklenir.
 * - **Düğün** kategorileri: `wedding_id = ?`, kullanıcı ekler.
 *
 * Kullanıcı yalnızca üye olduğu düğünün kategorilerini görür
 * (defense in depth: `wedding_members` join'i).
 */

export const MAX_CATEGORY_NAME = 60

const inputSchema = z.object({
  name: z
    .string({ required_error: 'Kategori adı zorunlu' })
    .trim()
    .min(1, 'Kategori adı boş olamaz')
    .max(MAX_CATEGORY_NAME, `En fazla ${MAX_CATEGORY_NAME} karakter`),
  icon: z.string().trim().max(40).optional(),
})

export interface CategoryRecord {
  id: string
  weddingId: string | null
  name: string
  icon: string | null
  sortOrder: number
  isSystem: boolean
}

export interface CategoryDeps {
  listVisible(weddingId: string, userId: string): Promise<CategoryRecord[]>
  insertCategory(values: Record<string, unknown>): Promise<CategoryRecord>
  findById(categoryId: string, weddingId: string, userId: string): Promise<CategoryRecord | null>
  deleteCategory(categoryId: string, weddingId: string, userId: string): Promise<boolean>
}

/** Varsayılan (sistem) kategoriler — design §7 ve brief §5.3 listesi. */
export const DEFAULT_CATEGORIES = [
  'Mekân',
  'Yemek / Catering',
  'Fotoğraf / Video',
  'Gelinlik / Damatlık',
  'Kuaför / Makyaj',
  'Çiçek / Dekorasyon',
  'Müzik / Eğlence',
  'Davetiye',
  'Ulaşım',
  'Konaklama',
  'Hediyelik',
  'Diğer',
] as const

/**
 * Görünür kategoriler: sistem + düğünün kendi kategorileri.
 *
 * Sistem kategorileri `sort_order` ile sabit sırada; kullanıcı kategorileri
 * sonra eklenir.
 */
export async function listCategories(
  params: { weddingId: string; userId: string },
  deps: Pick<CategoryDeps, 'listVisible'>,
): Promise<CategoryRecord[]> {
  return deps.listVisible(params.weddingId, params.userId)
}

export interface CreateCategoryParams {
  weddingId: string
  userId: string
  input: unknown
}

/**
 * Düğüne özel kategori ekler.
 *
 * Sistem kategorileri değiştirilemez; kullanıcı yalnızca kendi eklediğini
 * silebilir.
 */
export async function createCategory(
  params: CreateCategoryParams,
  deps: Pick<CategoryDeps, 'insertCategory' | 'listVisible'>,
): Promise<CategoryRecord> {
  const parsed = inputSchema.parse(params.input)

  // Üyelik kapısı: görünür liste boşsa üye değil (404 sızdırmaz)
  const visible = await deps.listVisible(params.weddingId, params.userId)
  if (visible.length === 0) {
    throw new Error('Düğün bulunamadı')
  }

  return deps.insertCategory({
    weddingId: params.weddingId,
    name: parsed.name,
    icon: parsed.icon ?? null,
    isSystem: false,
    sortOrder: visible.length,
  })
}

/**
 * Düğüne özel kategoriyi siler.
 *
 * Sistem kategorisi silinemez; harcamaların `category_id` FK'si
 * `ON DELETE SET NULL` olduğu için harcamalar silinmez, kategorisiz kalır.
 *
 * @returns false — kategori yok, sistem kategorisi veya kullanıcı üye değil (404)
 */
export async function deleteCategory(
  params: { weddingId: string; userId: string; categoryId: string },
  deps: Pick<CategoryDeps, 'findById' | 'deleteCategory'>,
): Promise<boolean> {
  const existing = await deps.findById(params.categoryId, params.weddingId, params.userId)
  if (!existing) return false
  // Sistem kategorisi silinemez
  if (existing.isSystem) return false
  return deps.deleteCategory(params.categoryId, params.weddingId, params.userId)
}

// ---------------------------------------------------------------------------
// Drizzle deposu
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof getDb>

function categoryColumns() {
  return {
    id: expenseCategories.id,
    weddingId: expenseCategories.weddingId,
    name: expenseCategories.name,
    icon: expenseCategories.icon,
    sortOrder: expenseCategories.sortOrder,
    isSystem: expenseCategories.isSystem,
  }
}

export function drizzleCategoryDeps(dbOverride?: Db): CategoryDeps {
  const db = dbOverride ?? getDb()

  function memberJoin(weddingId: string, userId: string) {
    return and(
      eq(weddingMembers.weddingId, weddingId),
      eq(weddingMembers.userId, userId),
    )
  }

  return {
    async listVisible(weddingId, userId) {
      const rows = await db
        .select(categoryColumns())
        .from(expenseCategories)
        .innerJoin(weddings, eq(weddings.id, weddingId))
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(
          or(
            // Sistem kategorileri (wedding_id NULL)
            isNull(expenseCategories.weddingId),
            eq(expenseCategories.weddingId, weddingId),
          ),
        )
        .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name))
      return rows as CategoryRecord[]
    },

    async insertCategory(values) {
      const rows = await db
        .insert(expenseCategories)
        .values(values as typeof expenseCategories.$inferInsert)
        .returning(categoryColumns())
      const row = rows[0]
      if (!row) throw new Error('Kategori oluşturulamadı')
      return row as CategoryRecord
    },

    async findById(categoryId, weddingId, userId) {
      const rows = await db
        .select(categoryColumns())
        .from(expenseCategories)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(
          and(
            eq(expenseCategories.id, categoryId),
            or(
              isNull(expenseCategories.weddingId),
              eq(expenseCategories.weddingId, weddingId),
            ),
          ),
        )
        .limit(1)
      return (rows[0] as CategoryRecord | undefined) ?? null
    },

    async deleteCategory(categoryId, weddingId, userId) {
      const rows = await db
        .delete(expenseCategories)
        .where(
          and(
            eq(expenseCategories.id, categoryId),
            eq(expenseCategories.weddingId, weddingId),
            // Sistem kategorisi silinemez — SQL seviyesinde de garanti
            eq(expenseCategories.isSystem, false),
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning({ id: expenseCategories.id })
      return rows.length > 0
    },
  }
}
