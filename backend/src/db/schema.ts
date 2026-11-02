import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
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

// --- Tipler ---
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect
export type Wedding = typeof weddings.$inferSelect
export type NewWedding = typeof weddings.$inferInsert
export type WeddingMember = typeof weddingMembers.$inferSelect
export type Invite = typeof invites.$inferSelect
