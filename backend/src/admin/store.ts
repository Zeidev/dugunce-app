/**
 * Admin deposunun Drizzle implementasyonu.
 *
 * `AdminDeps` (Task 3) arayüzünü implement eder; giriş akışı ve oturum
 * middleware'i DB'yi doğrudan görmez. Böylece her ikisi de PGlite/sahte
 * bağımlılıkla test edilebilir.
 *
 * `dbOverride` diğer depolar (`drizzleGuestDeps`, `drizzleWeddingDeps`) ile
 * aynı desen: testler PGlite bağlantısı enjekte edebilsin diye.
 *
 * DEĞİŞTİRİLEMEZ AUDIT: `audit_logs` için `writeAudit` DIŞINDA hiçbir
 * fonksiyon yoktur. `updateAudit`/`deleteAudit` bilinçli olarak YOK —
 * tabloda bunu DB seviyesinde engelleyen bir trigger var (Task 1), ama
 * store'un böyle bir yol SUNMAMASI ikinci savunma hattıdır: bir gün
 * trigger düşse bile uygulama katmanı yazma yolu açmaz.
 */

import { eq, and, desc, gte, sql, lt, or, ilike, isNull, inArray, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { adminAccounts, adminSessions, auditLogs, users, weddings, weddingMembers, guests } from '../db/schema.js'
import type {
  AdminDeps,
  AdminAccountRow,
  AdminSessionRow,
  AuditEntry,
  CreateSessionValues,
} from './service.js'
import { toAuditView, toUserView, toWeddingView } from './view.js'
import type { AuditView, UserView, WeddingView } from './view.js'

/** Testlerin PGlite bağlantısı enjekte edebilmesi için. */
type Db = ReturnType<typeof getDb>

/** Liste sayfalama sonucu — route katmanı `nextCursor`'ı olduğu gibi yanıtlar. */
export interface AdminPage<T> {
  items: T[]
  /** Daha fazla kayıt varsa son kaydın id'si, yoksa `null`. */
  nextCursor: string | null
}

export interface ListUsersOptions {
  /** `email` veya `displayName` üzerinde ILIKE araması. */
  q?: string
  cursor?: string
  limit?: number
}

export interface ListWeddingsOptions {
  plan?: string
  q?: string
  cursor?: string
  limit?: number
}

export interface ListAuditOptions {
  action?: string
  actorId?: string
  cursor?: string
  limit?: number
}

/** `updateWeddingPlan` yaması — servis (Task 6) bu alanları hesaplar. */
export interface WeddingPlanPatch {
  plan: string
  purchasedAt: Date | null
  purchasePlatform: string | null
  purchaseToken: string | null
}

/** `countGuests` dönüşü — overview kartları. */
export interface GuestCounts {
  total: number
  attending: number
  declined: number
  pending: number
}

export interface CountWeddingsFilter {
  plan?: string
  status?: string
}

/** Sayfa boyu varsayılanı ve tavanı (plan §Task 7: 50 / 100). */
const DEFAULT_PAGE = 50
const MAX_PAGE = 100

/**
 * Cursor'ı `createdAt` + `id` çiftine çevirmek için satırı okur.
 *
 * Keyset sayfalama offset'ten üstündür: araya kayıt girince sayfa kaymaz.
 * Geçersiz UUID (ya da silinmiş satır) sessizce yok sayılır — istemci
 * uydurma bir cursor gönderdiğinde 500 değil "ilk sayfa" almalı.
 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Sayfa içindeki kullanıcıların düğün sayıları — TEK ek sorgu.
 *
 * NEDEN KORELASYONLU ALT SORGU DEĞİL: Drizzle'ın `sql` şablonu alt sorgu
 * içindeki kolonları TABLO NİTELİĞİ OLMADAN yazıyor
 * (`WHERE "user_id" = "id"`). O ifadede `"id"` alt sorgunun KENDİ
 * tablosuna (`wedding_members.id`) çözümlenir ve sayım sessizce 0 döner —
 * testte yakalandı. `inArray` + `GROUP BY` ile nitelik belirsizliği
 * ortadan kalkar ve sayfa başına tek sorgu yeter.
 */
async function countMembersByUser(
  db: Db,
  userIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (userIds.length === 0) return map
  const rows = await db
    .select({ userId: weddingMembers.userId, c: sql<string>`COUNT(*)` })
    .from(weddingMembers)
    .where(inArray(weddingMembers.userId, userIds))
    .groupBy(weddingMembers.userId)
  for (const r of rows) map.set(r.userId, Number(r.c ?? 0))
  return map
}

/** Sayfa içindeki düğünlerin (silinmemiş) davetli sayıları. */
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

/** Sayfa içindeki düğünlerin üye sayıları. */
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
 * Admin satırının servis için gereken kolonları.
 *
 * `passwordHash` BİLEREK dahil: `loginAdmin` parola doğrulaması yapar.
 * Bu satır ASLA doğrudan yanıta yazılmaz — API `toAdminView` kullanır.
 */
function adminColumns() {
  return {
    id: adminAccounts.id,
    email: adminAccounts.email,
    displayName: adminAccounts.displayName,
    role: adminAccounts.role,
    status: adminAccounts.status,
    failedAttempts: adminAccounts.failedAttempts,
    lockoutCount: adminAccounts.lockoutCount,
    lockedUntil: adminAccounts.lockedUntil,
    lastLoginAt: adminAccounts.lastLoginAt,
    passwordHash: adminAccounts.passwordHash,
    totpSecret: adminAccounts.totpSecret,
    recoveryCodes: adminAccounts.recoveryCodes,
  }
}

/**
 * E-posta normalizasyonu — `loginAdmin` ile AYNI zincir.
 *
 * `loginAdmin` zaten normalize edip çağırıyor, ama store'u başka çağıranlar
 * da kullanıyor (CLI, ileride yönetim uçları). Store normalize etmezse
 * "Owner@X.com" ile açılan hesap "owner@x.com" ile bulunamaz ve bu hata
 * giriş akışında DEĞİL, sessiz bir "hesap yok" olarak görünür.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().normalize('NFC')
}

/**
 * `ILIKE` deseni — kullanıcı girdisindeki `%` ve `_` KAÇIRILIR.
 *
 * Kaçırılmazsa `q=%` tüm kayıtları döndürür (arama değil, tam tarama) ve
 * `q=_` tek karakterli her şeyi eşler. Kaçış karakteri `\`.
 */
function likePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`)
  return `%${escaped}%`
}

/**
 * Admin deposu.
 *
 * Dönüş tipi `AdminDeps` — `updateAudit`/`deleteAudit` bu yüzden nesnede
 * YOK. Tip düzeyinde de yoktur; `Record<string, unknown>` ile çağıran bir
 * test bunu `toHaveProperty` ile doğrular.
 */
export function drizzleAdminDeps(dbOverride?: Db): AdminDeps & {
  countUsers(): Promise<number>
  countUsersSince(since: Date): Promise<number>
  countWeddings(filter?: CountWeddingsFilter): Promise<number>
  countGuests(): Promise<GuestCounts>
  listUsers(opts: ListUsersOptions): Promise<AdminPage<UserView>>
  listWeddings(opts: ListWeddingsOptions): Promise<AdminPage<WeddingView>>
  findWeddingById(weddingId: string): Promise<WeddingView | null>
  updateWeddingPlan(weddingId: string, patch: WeddingPlanPatch): Promise<void>
  listAuditLogs(opts: ListAuditOptions): Promise<AdminPage<AuditView>>
} {
  const db = dbOverride ?? getDb()

  return {
    // -----------------------------------------------------------------
    // Hesaplar
    // -----------------------------------------------------------------

    async findAdminByEmail(email) {
      const rows = await db
        .select(adminColumns())
        .from(adminAccounts)
        .where(eq(adminAccounts.email, normalizeEmail(email)))
        .limit(1)
      return (rows[0] as AdminAccountRow | undefined) ?? null
    },

    async findAdminById(adminId) {
      // Geçersiz UUID PostgreSQL uuid tipini patlatır (500). Oturum
      // middleware'i her istekte buraya geliyor; bozuk bir çerez 500
      // üretmek yerine "oturum geçersiz" (401) yoluna düşmeli.
      if (!isUuid(adminId)) return null
      const rows = await db
        .select(adminColumns())
        .from(adminAccounts)
        .where(eq(adminAccounts.id, adminId))
        .limit(1)
      return (rows[0] as AdminAccountRow | undefined) ?? null
    },

    /**
     * Başarısız deneme durumunu yazar.
     *
     * `lockoutCount` YALNIZCA verildiğinde yazılır: `loginAdmin`, var
     * olmayan hesap için zamanlama simetrisi amacıyla bu fonksiyonu
     * `lockoutCount` OLMADAN çağırıyor. O çağrıda alanı 0'a çekseydik
     * saldırgan sıfır olmayan bir UUID ile deneme yaparak üstel kilidi
     * sıfırlayabilirdi (DoS koruması sessizce kaybolurdu).
     */
    async recordFailedAttempt(adminId, state) {
      if (!isUuid(adminId)) return
      await db
        .update(adminAccounts)
        .set({
          failedAttempts: state.failedAttempts,
          lockedUntil: state.lockedUntil,
          ...(state.lockoutCount !== undefined ? { lockoutCount: state.lockoutCount } : {}),
          updatedAt: new Date(),
        })
        .where(eq(adminAccounts.id, adminId))
    },

    /**
     * Başarılı giriş.
     *
     * `lockoutCount` de sıfırlanır: ardışık kilit serisi başarılı bir
     * girişle KIRILIR. Sıfırlanmazsa kullanıcı bir kez kilitlendikten
     * sonra her yeni kilit serisi bir öncekinin cezasını devralır ve
     * süre kalıcı olarak tavanda kalır (meşru kullanıcı cezalandırılır).
     */
    async recordSuccess(adminId) {
      if (!isUuid(adminId)) return
      await db
        .update(adminAccounts)
        .set({
          failedAttempts: 0,
          lockedUntil: null,
          lockoutCount: 0,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(adminAccounts.id, adminId))
    },

    // -----------------------------------------------------------------
    // Oturumlar
    // -----------------------------------------------------------------

    async createSession(values: CreateSessionValues) {
      const rows = await db
        .insert(adminSessions)
        .values({
          adminId: values.adminId,
          // HAM token değil, SHA-256 hash'i. Ham değer yalnız cookie'de.
          sessionHash: values.sessionHash,
          csrfHash: values.csrfHash,
          ip: values.ip ?? null,
          userAgent: values.userAgent ?? null,
          expiresAt: values.expiresAt,
        })
        .returning({ id: adminSessions.id })
      const row = rows[0]
      if (!row) throw new Error('Admin oturumu oluşturulamadı')
      return { id: row.id }
    },

    async findSessionByHash(hash) {
      const rows = await db
        .select({
          id: adminSessions.id,
          adminId: adminSessions.adminId,
          expiresAt: adminSessions.expiresAt,
          lastUsedAt: adminSessions.lastUsedAt,
        })
        .from(adminSessions)
        .where(eq(adminSessions.sessionHash, hash))
        .limit(1)
      return (rows[0] as AdminSessionRow | undefined) ?? null
    },

    /**
     * Kayan pencere — SÖZLEŞME.
     *
     * Middleware `touchSession(id, session.expiresAt)` çağırır: ikinci
     * argüman MUTLAK TAVANDIR, ileri kaydırılmış bir değer DEĞİL.
     * Bu yüzden burada `expiresAt` yazmak işe yaramaz (aynı değeri geri
     * yazar); TAZELENMESİ GEREKEN ALAN `lastUsedAt`'tır.
     *
     * Yalnız `expiresAt` yazsaydık boşta kalma penceresi hiç yenilenmez
     * ve oturum 8 saatte değil, 30. dakikada ölürdü — yoğun kullanımda
     * bile. Bu yüzden `lastUsedAt = now` ZORUNLU.
     *
     * `expiresAt` yine de yazılır: çağıran farklı bir tavan geçerse
     * (ileride mutlak tavanı kısaltma senaryosu) sessizce yok sayılmasın.
     * Tavanı İLERİ TAŞIMAK çağıranın kararıdır, store'un değil.
     */
    async touchSession(id, expiresAt) {
      if (!isUuid(id)) return
      await db
        .update(adminSessions)
        .set({ lastUsedAt: new Date(), expiresAt })
        .where(eq(adminSessions.id, id))
    },

    async deleteSession(id) {
      if (!isUuid(id)) return
      await db.delete(adminSessions).where(eq(adminSessions.id, id))
    },

    // -----------------------------------------------------------------
    // Audit — YALNIZ EKLEME
    // -----------------------------------------------------------------

    /**
     * Denetim kaydı ekler.
     *
     * Opsiyonel alanlar AÇIKÇA `null`'a çevrilir: `undefined` bırakılsaydı
     * Drizzle kolonu atlar ve PostgreSQL varsayılanı (yok) NULL olurdu —
     * davranış aynı, ama tip tarafında `undefined` yazma niyetini gizler.
     * `metadata` parola/token içermemelidir (yazan tarafın sorumluluğu).
     */
    async writeAudit(entry: AuditEntry) {
      await db.insert(auditLogs).values({
        action: entry.action,
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
      })
    },

    // -----------------------------------------------------------------
    // Kullanıcılar
    // -----------------------------------------------------------------

    async countUsers() {
      const rows = await db.select({ c: sql<string>`COUNT(*)` }).from(users)
      return Number(rows[0]?.c ?? 0)
    },

    /**
     * `since`'ten sonra açılan kullanıcılar — overview "son 7 gün" kartı.
     *
     * `gte` kullanılır, ham `sql` şablonu DEĞİL: Drizzle ham şablonda
     * kolon adını tablo niteliği OLMADAN yazabiliyor (bu dosyada
     * korelasyonlu alt sorguda tam olarak bu tuzağa düşüldü). `gte`
     * her zaman `"users"."created_at"` üretir.
     */
    async countUsersSince(since) {
      const rows = await db
        .select({ c: sql<string>`COUNT(*)` })
        .from(users)
        .where(gte(users.createdAt, since))
      return Number(rows[0]?.c ?? 0)
    },

    /**
     * Kullanıcı listesi — `weddingCount` ile birlikte.
     *
     * Sayım KORELASYONLU ALT SORGUYLA yapılır; `GROUP BY` + join ile
     * yapılsaydı `weddingCount = 0` olan kullanıcılar (hiç düğünü
     * olmayanlar — panelde en çok ilgi çeken grup) LEFT JOIN'de
     * görünürdü ama iç join'de tamamen KAYBOLURDU.
     *
     * Sayfalama keyset: `(createdAt DESC, id DESC)`. Cursor = son kaydın
     * id'si; `createdAt` istemciye sızdırılmaz (beyaz listede yok).
     */
    async listUsers(opts) {
      const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_PAGE), MAX_PAGE)
      const conditions: SQL[] = []

      const q = opts.q?.trim()
      if (q) {
        const pattern = likePattern(q)
        const search = or(
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
        )
        if (search) conditions.push(search)
      }

      if (opts.cursor && isUuid(opts.cursor)) {
        const anchorRows = await db
          .select({ createdAt: users.createdAt, id: users.id })
          .from(users)
          .where(eq(users.id, opts.cursor))
          .limit(1)
        const anchor = anchorRows[0]
        if (anchor) {
          const keyset = or(
            lt(users.createdAt, anchor.createdAt),
            and(eq(users.createdAt, anchor.createdAt), lt(users.id, anchor.id)),
          )
          if (keyset) conditions.push(keyset)
        }
      }

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt), desc(users.id))
        // +1: bir sonraki sayfa var mı sorusunu ekstra COUNT sorgusu
        // yapmadan yanıtlamak için.
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const counts = await countMembersByUser(db, page.map((r) => r.id))

      // Beyaz liste dönüşümü TEK yerde: `view.ts`. Store kendi nesnesini
      // kursaydı route katmanı ile zamanla ayrışır ve birinde yeni bir
      // gizli alan sızabilirdi.
      const items: UserView[] = page.map((r) =>
        toUserView({ ...r, weddingCount: counts.get(r.id) ?? 0 }),
      )

      return {
        items,
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      }
    },

    // -----------------------------------------------------------------
    // Düğünler
    // -----------------------------------------------------------------

    async countWeddings(filter) {
      const conditions: SQL[] = []
      if (filter?.plan) conditions.push(eq(weddings.plan, filter.plan))
      if (filter?.status) conditions.push(eq(weddings.status, filter.status))

      const rows = await db
        .select({ c: sql<string>`COUNT(*)` })
        .from(weddings)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
      return Number(rows[0]?.c ?? 0)
    },

    /**
     * Düğün listesi — davetli ve üye sayılarıyla.
     *
     * Sayımlar KORELASYONLU ALT SORGU: `guests` ile join + GROUP BY
     * yapılsaydı davetlisi olmayan düğünler listeden DÜŞERDİ (panelde
     * "yeni açılmış, henüz davetli girilmemiş" düğünler tam da
     * incelenmesi gerekenler).
     *
     * Silinmiş davetliler (`deleted_at`) sayılmaz — kullanıcı onları
     * silmiş sayıyor; sayıya katmak panelde yanlış bir tablo gösterir.
     */
    async listWeddings(opts) {
      const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_PAGE), MAX_PAGE)
      const conditions: SQL[] = []

      if (opts.plan) conditions.push(eq(weddings.plan, opts.plan))

      const q = opts.q?.trim()
      if (q) {
        const search = ilike(weddings.coupleNames, likePattern(q))
        conditions.push(search)
      }

      if (opts.cursor && isUuid(opts.cursor)) {
        const anchorRows = await db
          .select({ createdAt: weddings.createdAt, id: weddings.id })
          .from(weddings)
          .where(eq(weddings.id, opts.cursor))
          .limit(1)
        const anchor = anchorRows[0]
        if (anchor) {
          const keyset = or(
            lt(weddings.createdAt, anchor.createdAt),
            and(eq(weddings.createdAt, anchor.createdAt), lt(weddings.id, anchor.id)),
          )
          if (keyset) conditions.push(keyset)
        }
      }

      const rows = await db
        .select({
          id: weddings.id,
          coupleNames: weddings.coupleNames,
          weddingDate: weddings.weddingDate,
          plan: weddings.plan,
          createdAt: weddings.createdAt,
        })
        .from(weddings)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(weddings.createdAt), desc(weddings.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const ids = page.map((r) => r.id)
      const [guestCounts, memberCounts] = await Promise.all([
        countGuestsByWedding(db, ids),
        countMembersByWedding(db, ids),
      ])
      const items: WeddingView[] = page.map((r) =>
        toWeddingView({
          ...r,
          guestCount: guestCounts.get(r.id) ?? 0,
          memberCount: memberCounts.get(r.id) ?? 0,
        }),
      )

      return {
        items,
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      }
    },

    async findWeddingById(weddingId) {
      if (!isUuid(weddingId)) return null
      const rows = await db
        .select({
          id: weddings.id,
          coupleNames: weddings.coupleNames,
          weddingDate: weddings.weddingDate,
          plan: weddings.plan,
          createdAt: weddings.createdAt,
        })
        .from(weddings)
        .where(eq(weddings.id, weddingId))
        .limit(1)

      const r = rows[0]
      if (!r) return null
      const [guestCounts, memberCounts] = await Promise.all([
        countGuestsByWedding(db, [r.id]),
        countMembersByWedding(db, [r.id]),
      ])
      return toWeddingView({
        ...r,
        guestCount: guestCounts.get(r.id) ?? 0,
        memberCount: memberCounts.get(r.id) ?? 0,
      })
    },

    /**
     * Plan değişikliğini yazar — Task 6 `setWeddingPlan` tüketir.
     *
     * `purchaseToken` BİLEREK `null` yazılır (plan §Task 6): admin
     * tarafından açılan premium bir ödeme makbuzuna dayanmaz, dolayısıyla
     * eski bir Play makbuz token'ı satırda KALMAMALIDIR — kalsaydı
     * "bu düğün mağazadan mı alındı" sorusunun yanıtı bozulurdu.
     *
     * Bu fonksiyon AUDIT YAZMAZ; audit servis katmanının sorumluluğudur
     * (tek bir yerde, `setWeddingPlan` içinde). Store'a audit yazdırmak
     * "değişiklik + kayıt" işlemini atomik yapmaz (transaction yok) ama
     * iki yerde kayıt üretip çift kayıt riski doğururdu.
     */
    async updateWeddingPlan(weddingId, patch) {
      if (!isUuid(weddingId)) return
      await db
        .update(weddings)
        .set({
          plan: patch.plan,
          purchasedAt: patch.purchasedAt,
          purchasePlatform: patch.purchasePlatform,
          purchaseToken: patch.purchaseToken,
          updatedAt: new Date(),
        })
        .where(eq(weddings.id, weddingId))
    },

    // -----------------------------------------------------------------
    // Davetliler (overview sayaçları)
    // -----------------------------------------------------------------

    /**
     * Davetli sayaçları — overview kartları için.
     *
     * TEK sorguda koşullu toplam: dört ayrı COUNT yerine `FILTER` ile
     * tek geçiş. Silinmiş davetliler hiçbir sayaca girmez (kullanıcı
     * onları silmiş sayıyor).
     */
    async countGuests() {
      const rows = await db
        .select({
          total: sql<string>`COUNT(*)`,
          attending: sql<string>`COUNT(*) FILTER (WHERE ${guests.rsvp} = 'ATTENDING')`,
          declined: sql<string>`COUNT(*) FILTER (WHERE ${guests.rsvp} = 'DECLINED')`,
          pending: sql<string>`COUNT(*) FILTER (WHERE ${guests.rsvp} = 'PENDING')`,
        })
        .from(guests)
        .where(isNull(guests.deletedAt))

      const r = rows[0]
      return {
        total: Number(r?.total ?? 0),
        attending: Number(r?.attending ?? 0),
        declined: Number(r?.declined ?? 0),
        pending: Number(r?.pending ?? 0),
      }
    },

    // -----------------------------------------------------------------
    // Audit listesi — SALT OKUMA
    // -----------------------------------------------------------------

    /**
     * Denetim kaydı listesi (en yeniden eskiye).
     *
     * Sıralama `(createdAt DESC, id DESC)` — kararlı keyset sayfalama.
     * Aynı milisaniyede yazılan iki kayıt `id` ile ayrışır; yalnız
     * `createdAt` ile sıralansaydı sayfa sınırında kayıt tekrarı/atlaması
     * olurdu.
     */
    async listAuditLogs(opts) {
      const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_PAGE), MAX_PAGE)
      const conditions: SQL[] = []

      if (opts.action) conditions.push(eq(auditLogs.action, opts.action))
      if (opts.actorId && isUuid(opts.actorId)) {
        conditions.push(eq(auditLogs.actorId, opts.actorId))
      }

      if (opts.cursor && isUuid(opts.cursor)) {
        const anchorRows = await db
          .select({ createdAt: auditLogs.createdAt, id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.id, opts.cursor))
          .limit(1)
        const anchor = anchorRows[0]
        if (anchor) {
          const keyset = or(
            lt(auditLogs.createdAt, anchor.createdAt),
            and(eq(auditLogs.createdAt, anchor.createdAt), lt(auditLogs.id, anchor.id)),
          )
          if (keyset) conditions.push(keyset)
        }
      }

      const rows = await db
        .select({
          id: auditLogs.id,
          actorType: auditLogs.actorType,
          actorId: auditLogs.actorId,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          ip: auditLogs.ip,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const items: AuditView[] = page.map((r) => toAuditView(r))

      return {
        items,
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      }
    },
  }
}
