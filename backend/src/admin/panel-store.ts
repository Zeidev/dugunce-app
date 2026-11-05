/**
 * Admin paneli deposu — `store.ts`'in ÜZERİNE eklenen okuma/yazma yolları.
 *
 * NEDEN AYRI DOSYA: `store.ts` (Task 5) gözden geçirilmiş ve dondurulmuş
 * bir sözleşmedir (`AdminDeps` + liste/sayım uçları). Panelin ihtiyaç
 * duyduğu birkaç şey orada YOK ve oraya eklemek review edilmiş dosyayı
 * değiştirmek olurdu:
 *
 * - `findUserById` / `listWeddingsForUser` — `GET /users/:id` (spec §6.3)
 * - `updateUserStatus` — `PATCH /users/:id` (spec §6.3)
 * - `listMembersForWedding` / `countExpensesForWedding` — düğün detayı (§6.4)
 * - `findSessionCsrfHash` — CSRF double-submit doğrulaması
 *
 * BURADA DURAN LİSTE/SAYIM YOLLARI `store.ts`'e DELEGE EDER, kopyalamaz:
 * `listUsers`, `listWeddings`, `findWeddingById`, `listAuditLogs`, sayaçlar
 * tek kaynaktan gelir. Böylece sayfalama ve 100 satır tavanı iki yerde
 * ayrışamaz.
 *
 * GÜVENLİK: dönen her nesne `view.ts`'teki BEYAZ LİSTE dönüşümlerinden
 * geçer. `...row` ASLA — `password_hash`, `purchase_token` gibi sütunlar
 * yanıta sızmasın.
 */

import { eq, and, desc, sql, isNull, inArray } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { adminSessions, expenses, guests, users, weddings, weddingMembers } from '../db/schema.js'
import { drizzleAdminDeps } from './store.js'
import { toUserView, toWeddingView } from './view.js'
import type { UserView, WeddingView } from './view.js'

/** Testlerin PGlite bağlantısı enjekte edebilmesi için. */
type Db = ReturnType<typeof getDb>

/** `PATCH /users/:id` için kabul edilen durumlar (spec §6.3). */
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && (USER_STATUSES as readonly string[]).includes(value)
}

/** Düğün üyesi — beyaz liste. `email` panelde operatöre lazım. */
export interface WeddingMemberView {
  userId: string
  displayName: string
  email: string
  role: string
  joinedAt: Date
}

/**
 * UUID koruması.
 *
 * Geçersiz UUID PostgreSQL `uuid` tipini patlatır (500). Panelde yanlış
 * yazılmış bir id 500 değil 404 dönmeli.
 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Sayfa içindeki düğünlerin davetli ve üye sayıları.
 *
 * `inArray` + `GROUP BY` — korelasyonlu alt sorgu DEĞİL. Ham `sql` şablonu
 * alt sorgu içindeki kolonları tablo niteliği olmadan üretiyor ve sayım
 * sessizce 0 dönüyordu (Task 5'te yakalanan bug). Silinmiş davetliler
 * sayılmaz: kullanıcı onları silmiş sayıyor.
 */
async function countGuestsByWedding(
  db: Db,
  weddingIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (weddingIds.length === 0) return map
  const rows = await db
    .select({ weddingId: guests.weddingId, c: sql<string>`COUNT(*)` })
    .from(guests)
    .where(and(inArray(guests.weddingId, weddingIds), isNull(guests.deletedAt)))
    .groupBy(guests.weddingId)
  for (const r of rows) map.set(r.weddingId, Number(r.c ?? 0))
  return map
}

async function countMembersByWedding(
  db: Db,
  weddingIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (weddingIds.length === 0) return map
  const rows = await db
    .select({ weddingId: weddingMembers.weddingId, c: sql<string>`COUNT(*)` })
    .from(weddingMembers)
    .where(inArray(weddingMembers.weddingId, weddingIds))
    .groupBy(weddingMembers.weddingId)
  for (const r of rows) map.set(r.weddingId, Number(r.c ?? 0))
  return map
}

/**
 * Panel deposu — `store.ts`'in tamamı + panelin ek okuma/yazmaları.
 *
 * Tip `ReturnType<typeof drizzleAdminDeps>`'ten TÜRETİLİR: elle yazılsaydı
 * `store.ts`'e yeni bir metot eklendiğinde bu tip sessizce eskir ve route
 * katmanı derleme zamanında göremezdi.
 */
export type AdminPanelDeps = ReturnType<typeof drizzleAdminDeps> & {
  findUserById(userId: string): Promise<UserView | null>
  listWeddingsForUser(userId: string): Promise<WeddingView[]>
  updateUserStatus(userId: string, status: UserStatus): Promise<void>
  listMembersForWedding(weddingId: string): Promise<WeddingMemberView[]>
  countExpensesForWedding(weddingId: string): Promise<number>
  /**
   * Oturumun CSRF hash'i.
   *
   * NEDEN GEREKLİ: `AdminDeps.findSessionByHash` yalnız
   * `{ id, adminId, expiresAt, lastUsedAt }` döner ve oturum middleware'i
   * `req.admin`'a `csrfHash` KOYMAZ (Task 4 sözleşmesi dondurulmuş).
   * Double-submit doğrulaması için hash'e ayrı bir sorguyla ulaşılır.
   * Sorgu YALNIZ yazma uçlarında çalışır — okuma yolu ekstra DB turu
   * ödemez.
   */
  findSessionCsrfHash(sessionId: string): Promise<string | null>
}

export function drizzleAdminPanelDeps(dbOverride?: Db): AdminPanelDeps {
  const db = dbOverride ?? getDb()
  const base = drizzleAdminDeps(db as Parameters<typeof drizzleAdminDeps>[0])

  return {
    ...base,

    async findUserById(userId) {
      if (!isUuid(userId)) return null
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      const r = rows[0]
      if (!r) return null

      const counts = await db
        .select({ c: sql<string>`COUNT(*)` })
        .from(weddingMembers)
        .where(eq(weddingMembers.userId, r.id))

      return toUserView({ ...r, weddingCount: Number(counts[0]?.c ?? 0) })
    },

    /**
     * Kullanıcının düğünleri — panel detayı.
     *
     * `INNER JOIN`: üyesi olmadığı düğünü görmemeli. Sayımlar ayrı
     * `GROUP BY` sorgusuyla gelir (korelasyonlu alt sorgu tuzağı).
     */
    async listWeddingsForUser(userId) {
      if (!isUuid(userId)) return []
      const rows = await db
        .select({
          id: weddings.id,
          coupleNames: weddings.coupleNames,
          weddingDate: weddings.weddingDate,
          plan: weddings.plan,
          createdAt: weddings.createdAt,
        })
        .from(weddingMembers)
        .innerJoin(weddings, eq(weddings.id, weddingMembers.weddingId))
        .where(eq(weddingMembers.userId, userId))
        .orderBy(desc(weddings.createdAt), desc(weddings.id))

      const ids = rows.map((r) => r.id)
      const [guestCounts, memberCounts] = await Promise.all([
        countGuestsByWedding(db, ids),
        countMembersByWedding(db, ids),
      ])

      return rows.map((r) =>
        toWeddingView({
          ...r,
          guestCount: guestCounts.get(r.id) ?? 0,
          memberCount: memberCounts.get(r.id) ?? 0,
        }),
      )
    },

    async updateUserStatus(userId, status) {
      if (!isUuid(userId)) return
      await db
        .update(users)
        .set({ status, updatedAt: new Date() })
        .where(eq(users.id, userId))
    },

    async listMembersForWedding(weddingId) {
      if (!isUuid(weddingId)) return []
      const rows = await db
        .select({
          userId: weddingMembers.userId,
          displayName: users.displayName,
          email: users.email,
          role: weddingMembers.role,
          joinedAt: weddingMembers.joinedAt,
        })
        .from(weddingMembers)
        .innerJoin(users, eq(users.id, weddingMembers.userId))
        .where(eq(weddingMembers.weddingId, weddingId))
        .orderBy(weddingMembers.joinedAt)

      return rows.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        email: r.email,
        role: r.role,
        joinedAt: r.joinedAt,
      }))
    },

    async countExpensesForWedding(weddingId) {
      if (!isUuid(weddingId)) return 0
      const rows = await db
        .select({ c: sql<string>`COUNT(*)` })
        .from(expenses)
        .where(and(eq(expenses.weddingId, weddingId), isNull(expenses.deletedAt)))
      return Number(rows[0]?.c ?? 0)
    },

    async findSessionCsrfHash(sessionId) {
      if (!isUuid(sessionId)) return null
      const rows = await db
        .select({ csrfHash: adminSessions.csrfHash })
        .from(adminSessions)
        .where(eq(adminSessions.id, sessionId))
        .limit(1)
      return rows[0]?.csrfHash ?? null
    },
  }
}
