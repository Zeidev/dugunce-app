import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core'

/**
 * users — hesabı olan kullanıcılar (yalnızca çift üyeleri).
 *
 * Yardımcı ve misafir bu tabloya GİRMEZ; onlar token'lı link ile erişir
 * (bkz. design §7 ve SECURITY §1.2).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    status: text('status').notNull().default('ACTIVE'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('users_status_idx').on(table.status),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
  }),
)

/**
 * refresh_tokens — oturum yenileme token'ları.
 *
 * Ham token ASLA saklanmaz; yalnızca SHA-256 hash'i (SECURITY §2).
 * Rotasyon: her kullanımda eski revoke edilir, yenisi üretilir.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    deviceLabel: text('device_label'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index('refresh_tokens_hash_idx').on(table.tokenHash),
    userIdx: index('refresh_tokens_user_idx').on(table.userId),
  }),
)

/**
 * magic_link_tokens — tek kullanımlık giriş token'ları.
 *
 * Kural: GET isteği token'ı TÜKETMEZ (e-posta güvenlik tarayıcıları
 * linki yakmasın). Tüketim yalnızca POST /auth/verify ile olur.
 */
export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    shortCodeHash: text('short_code_hash'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index('magic_link_tokens_hash_idx').on(table.tokenHash),
    userIdx: index('magic_link_tokens_user_idx').on(table.userId),
  }),
)

/**
 * weddings — düğün kaydı.
 *
 * Tüm düğün verisi bu tablonun id'si ile kapsamlıdır (SECURITY §1.1).
 * `plan` alanı satın alma için Aşama 2.5'te kullanılacak.
 */
export const weddings = pgTable(
  'weddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coupleNames: text('couple_names').notNull(),
    weddingDate: timestamp('wedding_date', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('Europe/Istanbul'),
    venueName: text('venue_name'),
    venueAddress: text('venue_address'),
    venueLat: text('venue_lat'),
    venueLng: text('venue_lng'),
    mapUrl: text('map_url'),
    giftNote: text('gift_note'),
    rsvpDeadline: timestamp('rsvp_deadline', { withTimezone: true }),
    program: jsonb('program'),
    plan: text('plan').notNull().default('FREE'),
    /**
     * Davetiye şablonu — anahtar listesi `weddings/templates.ts`.
     * Bilinmeyen değer okuma sırasında `ZARIF`'e normalleştirilir.
     */
    template: text('template').notNull().default('ZARIF'),
    /**
     * Seçilen font — anahtar listesi `weddings/templates.ts`.
     * Boş dize "şablonun önerilen fontunu kullan" demektir.
     */
    fontKey: text('font_key').notNull().default(''),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }),
    purchaseToken: text('purchase_token'),
    purchasePlatform: text('purchase_platform'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Composite FK hedefi için gerekli (SECURITY §1.1)
    idUnique: unique('weddings_id_unique').on(table.id),
    statusIdx: index('weddings_status_idx').on(table.status),
    dateIdx: index('weddings_date_idx').on(table.weddingDate),
  }),
)

/**
 * wedding_members — kim hangi düğünde, hangi rolde.
 *
 * OWNER ve CO_OWNER tam yetkili (design §7). Yardımcı bu tabloya girmez.
 */
export const weddingMembers = pgTable(
  'wedding_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('OWNER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueMember: unique('wedding_members_unique').on(table.weddingId, table.userId),
    weddingIdx: index('wedding_members_wedding_idx').on(table.weddingId),
    userIdx: index('wedding_members_user_idx').on(table.userId),
  }),
)

/**
 * invites — davet kodları (2. eş için CO_OWNER).
 *
 * 7 karakter, karışmayan karakter seti, tek kullanım, süreli.
 * Kod düz metin saklanır (kullanıcı okuyup girecek) — ama 10 dk TTL +
 * tek kullanım + rate limit ile korunur.
 */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    role: text('role').notNull(),
    displayName: text('display_name'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    weddingIdx: index('invites_wedding_idx').on(table.weddingId),
    codeIdx: index('invites_code_idx').on(table.code),
  }),
)

// ---------------------------------------------------------------------------
// Bütçe tabloları (Aşama 3)
// ---------------------------------------------------------------------------

/**
 * expense_categories — harcama kategorileri.
 *
 * `wedding_id` null ise sistem kategorisi (herkes kullanabilir).
 */
export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id').references(() => weddings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    weddingIdx: index('expense_categories_wedding_idx').on(table.weddingId),
  }),
)

/**
 * cards — kredi/banka kartları.
 *
 * GÜVENLİK: Tam kart numarası, CVV veya son kullanma tarihi ASLA saklanmaz.
 * Yalnızca etiket ve son 4 hane (SECURITY §1.4 ruhu).
 */
export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    bankName: text('bank_name'),
    lastFour: text('last_four'),
    statementDay: integer('statement_day'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    weddingIdx: index('cards_wedding_idx').on(table.weddingId),
  }),
)

/**
 * persons — harcamayı yapan gerçek kişiler (opsiyonel detay).
 */
export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    side: text('side').notNull().default('SHARED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    weddingIdx: index('persons_wedding_idx').on(table.weddingId),
  }),
)

/**
 * expenses — satın almanın kendisi.
 *
 * `amount_kurus` bigint: para asla float değil (SECURITY §10.1).
 * `deleted_at` soft delete: kota ve raporlar tutarlı kalsın.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    amountKurus: bigint('amount_kurus', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull().default('TRY'),
    categoryId: uuid('category_id').references(() => expenseCategories.id, {
      onDelete: 'set null',
    }),
    paidBySide: text('paid_by_side').notNull().default('SHARED'),
    paidByPersonId: uuid('paid_by_person_id').references(() => persons.id, {
      onDelete: 'set null',
    }),
    paymentMethod: text('payment_method').notNull().default('CASH'),
    paymentStatus: text('payment_status').notNull().default('PAID'),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    installmentCount: integer('installment_count'),
    firstInstallmentMonth: text('first_installment_month'),
    purchaseDate: timestamp('purchase_date', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // Composite FK hedefi (SECURITY §1.1)
    idWeddingUnique: unique('expenses_id_wedding_unique').on(table.id, table.weddingId),
    weddingIdx: index('expenses_wedding_idx').on(table.weddingId),
    dateIdx: index('expenses_date_idx').on(table.purchaseDate),
    categoryIdx: index('expenses_category_idx').on(table.categoryId),
    deletedIdx: index('expenses_deleted_idx').on(table.deletedAt),
  }),
)

/**
 * installments — her ay ödenecek parça.
 *
 * COMPOSITE FK: (expense_id, wedding_id) → expenses(id, wedding_id).
 * Yanlış wedding_id ile yazma DB tarafından reddedilir (SECURITY §1.1).
 */
export const installments = pgTable(
  'installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id').notNull(),
    expenseId: uuid('expense_id').notNull(),
    number: integer('number').notNull(),
    amountKurus: bigint('amount_kurus', { mode: 'bigint' }).notNull(),
    dueMonth: text('due_month').notNull(),
    status: text('status').notNull().default('PENDING'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    expenseFk: foreignKey({
      columns: [table.expenseId, table.weddingId],
      foreignColumns: [expenses.id, expenses.weddingId],
      name: 'installments_expense_fk',
    }).onDelete('cascade'),
    uniqueNumber: unique('installments_expense_number_unique').on(
      table.expenseId,
      table.number,
    ),
    dueIdx: index('installments_due_idx').on(table.dueMonth),
    weddingIdx: index('installments_wedding_idx').on(table.weddingId),
    statusIdx: index('installments_status_idx').on(table.status),
  }),
)

// --- Tipler ---
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect
export type Wedding = typeof weddings.$inferSelect
export type NewWedding = typeof weddings.$inferInsert
export type WeddingMember = typeof weddingMembers.$inferSelect
export type Invite = typeof invites.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type NewExpense = typeof expenses.$inferInsert
export type Installment = typeof installments.$inferSelect
export type NewInstallment = typeof installments.$inferInsert
export type Card = typeof cards.$inferSelect
export type ExpenseCategory = typeof expenseCategories.$inferSelect
export type Person = typeof persons.$inferSelect

/**
 * guests — davetli listesi.
 *
 * LİMİT BU TABLOYA UYGULANIR: kayıt sayısı, kişi sayısı değil
 * (SECURITY §10.2). "4 kişilik aile" tek kayıttır.
 *
 * `side` yalnızca BRIDE | GROOM — davetli her zaman bir tarafa aittir.
 * (Harcamadaki `paid_by_side` ise SHARED olabilir; farklı kavramlar.)
 */
export const guests = pgTable(
  'guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** E.164 normalize edilir. Nullable — WhatsApp olmadan da davetli eklenebilir. */
    phone: text('phone'),
    side: text('side').notNull().default('BRIDE'),
    inviteStatus: text('invite_status').notNull().default('NOT_SENT'),
    rsvp: text('rsvp').notNull().default('PENDING'),
    /** Çiftin kendi notu ("Ayşe'nin kuzeni"). Davetliye gösterilmez. */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // Composite FK hedefi (SECURITY §1.1)
    idWeddingUnique: unique('guests_id_wedding_unique').on(table.id, table.weddingId),
    weddingIdx: index('guests_wedding_idx').on(table.weddingId),
    deletedIdx: index('guests_deleted_idx').on(table.deletedAt),
    sideIdx: index('guests_side_idx').on(table.weddingId, table.side),
  }),
)

/**
 * guest_invitations — davetiye (token'lı link).
 *
 * HAM TOKEN ASLA SAKLANMAZ — yalnızca SHA-256 hash (SECURITY §1.2).
 * `allowed_party_size` (çiftin izni) ile `confirmed_party_size` (davetlinin
 * beyanı) AYRI alanlar (SECURITY §10.2).
 */
export const guestInvitations = pgTable(
  'guest_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id').notNull(),
    guestId: uuid('guest_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** Çiftin izin verdiği azami kişi sayısı. Varsayılan 1 (yalnız davetli). */
    allowedPartySize: integer('allowed_party_size').notNull().default(1),
    /** Davetlinin bildirdiği gerçek kişi sayısı. RSVP öncesi null. */
    confirmedPartySize: integer('confirmed_party_size'),
    /** Yanıtı kim verdi — GUEST (kendi) veya COUPLE (telefonla geleni çift girdi). */
    rsvpSource: text('rsvp_source'),
    rsvpAt: timestamp('rsvp_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // COMPOSITE FK: davetiye yalnızca KENDİ düğününün davetlisine bağlanır.
    // Yanlış wedding_id ile yazma DB tarafından reddedilir (SECURITY §1.1, §10.4).
    guestFk: foreignKey({
      columns: [table.guestId, table.weddingId],
      foreignColumns: [guests.id, guests.weddingId],
      name: 'guest_invitations_guest_fk',
    }).onDelete('cascade'),
    guestIdx: index('guest_invitations_guest_idx').on(table.guestId),
    weddingIdx: index('guest_invitations_wedding_idx').on(table.weddingId),
  }),
)

/**
 * helpers — yardımcılar (işbirlikçiler).
 *
 * KRİTİK: Yardımcı `users` tablosuna GİRMEZ. Hesabı yoktur, girişi yoktur.
 * Erişimi yalnızca hash'lenmiş token'lı link iledir (design "Yardımcı
 * web sayfası", SECURITY §1.2). Bu, auth karmaşıklığını ciddi ölçüde azaltır.
 */
export const helpers = pgTable(
  'helpers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    /** Ham token ASLA saklanmaz — yalnızca SHA-256 (SECURITY §1.2). */
    accessTokenHash: text('access_token_hash').notNull().unique(),
    tokenRevokedAt: timestamp('token_revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Erişimin son görülme anı — 5 dk'da bir güncellenir. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /**
     * Davet linkinin (token'ın) son geçerlilik anı — SECURITY §1.2 #3.
     *
     * NULL: süresiz (yalnızca eski kayıtlar için; yeni kayıtlar her zaman
     * tarih alır). Süresi geçen token `resolveHelperToken` tarafında 404.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idWeddingUnique: unique('helpers_id_wedding_unique').on(table.id, table.weddingId),
    weddingIdx: index('helpers_wedding_idx').on(table.weddingId),
  }),
)

/**
 * helper_sessions — yardımcının KISA ÖMÜRLÜ oturumu (SECURITY §1.2 #4).
 *
 * Token (uzun ömürlü davet linki) yalnızca oturum açmak için bir kez
 * kullanılır; veri istekleri bu tablodaki oturumla yapılır. Böylece uzun
 * ömürlü sır URL'de her istekte taşınmaz.
 *
 * Ham oturum değeri DB'de YOKTUR — yalnızca SHA-256 (token ile aynı kural).
 */
export const helperSessions = pgTable(
  'helper_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    helperId: uuid('helper_id').notNull(),
    weddingId: uuid('wedding_id').notNull(),
    /** Ham oturum değeri değil, SHA-256. */
    sessionHash: text('session_hash').notNull().unique(),
    /** CSRF double-submit için ham değerin SHA-256'sı. */
    csrfHash: text('csrf_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    /** Kayan pencere: her kullanımda ileri taşınır, `createdAt` tavanı ayrı. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    // Yardımcı silinirse oturumları da gider; düğünler arası eşleşme imkânsız.
    helperFk: foreignKey({
      columns: [table.helperId, table.weddingId],
      foreignColumns: [helpers.id, helpers.weddingId],
      name: 'helper_sessions_helper_fk',
    }).onDelete('cascade'),
    expiresIdx: index('helper_sessions_expires_idx').on(table.expiresAt),
    helperIdx: index('helper_sessions_helper_idx').on(table.helperId),
  }),
)

/**
 * tasks — görevler.
 *
 * v1: görev başına TEK sorumlu. `assignee_helper_id` tek kolon olduğu için
 * zaten tek atama garanti edilir; çoklu atama v1.1'de join table ile gelir.
 *
 * `assigned_at` kritik: mesaj erişimi bu andan sonrasıyla sınırlıdır
 * (SECURITY §10.3 #4b). Yeniden atamada güncellenmezse yeni yardımcı
 * önceki yardımcının özel konuşmasını görür.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id')
      .notNull()
      .references(() => weddings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assigneeHelperId: uuid('assignee_helper_id'),
    status: text('status').notNull().default('TODO'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    priority: text('priority').notNull().default('NORMAL'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    idWeddingUnique: unique('tasks_id_wedding_unique').on(table.id, table.weddingId),
    // Composite FK: görev yalnızca KENDİ düğününün yardımcısına atanır.
    //
    // DİKKAT: `ON DELETE SET NULL` BURADA KULLANILAMAZ. PostgreSQL
    // composite FK'da SET NULL verildiğinde FK'nin TÜM kolonlarını
    // null'lamaya çalışır — `wedding_id` NOT NULL olduğu için hata verir
    // (doğrulandı: "null value in column wedding_id ... violates
    // not-null constraint"). `ON DELETE CASCADE` de yanlış olurdu:
    // yardımcı silinince görev de silinirdi.
    //
    // Çözüm: FK NO ACTION kalır; yardımcı silme servis katmanında
    // transaction içinde yapılır (önce atamaları boşalt, sonra sil).
    // Doğrudan SQL DELETE ise FK ihlali ile REDDEDİLİR — sessizce
    // sahipsiz görev bırakmaktan iyidir.
    assigneeFk: foreignKey({
      columns: [table.assigneeHelperId, table.weddingId],
      foreignColumns: [helpers.id, helpers.weddingId],
      name: 'tasks_assignee_fk',
    }),
    weddingIdx: index('tasks_wedding_idx').on(table.weddingId),
    assigneeIdx: index('tasks_assignee_idx').on(table.assigneeHelperId),
  }),
)

/**
 * messages — görev sohbeti.
 *
 * Hem `wedding_id` hem `task_id` taşır (composite FK, SECURITY §10.4 #1).
 * Erişim `task.assigned_at` ile sınırlanır — yeniden atamada yeni yardımcı
 * önceki konuşmayı GÖRMEZ (SECURITY §10.3 #4b).
 *
 * `sender_helper_id` SET NULL: yardımcı silinirse çiftin konuşma kaydı
 * bozulmaz, yazar "silinmiş yardımcı" görünür.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weddingId: uuid('wedding_id').notNull(),
    taskId: uuid('task_id').notNull(),
    senderKind: text('sender_kind').notNull(),
    senderUserId: uuid('sender_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    senderHelperId: uuid('sender_helper_id').references(() => helpers.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    /** Aynı key ile tekrar gönderim kopya oluşturmaz (SECURITY §10.3 #3). */
    idempotencyKey: text('idempotency_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskFk: foreignKey({
      columns: [table.taskId, table.weddingId],
      foreignColumns: [tasks.id, tasks.weddingId],
      name: 'messages_task_fk',
    }).onDelete('cascade'),
    idemUnique: unique('messages_task_idem_unique').on(
      table.taskId,
      table.idempotencyKey,
    ),
    taskIdx: index('messages_task_idx').on(table.taskId, table.createdAt),
  }),
)
