import { eq, and, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { users, magicLinkTokens, refreshTokens } from '../db/schema.js'
import type { MagicLinkDeps, VerifyMagicLinkDeps } from './magic-link.js'
import { signAccessToken, createRefreshToken } from './tokens.js'
import { loadEnv } from '../config/env.js'
import { createEmailClient } from './brevo.js'

/**
 * Magic link deposunun Drizzle implementasyonu.
 *
 * Hem istek (MagicLinkDeps) hem doğrulama (VerifyMagicLinkDeps) için
 * gerekli tüm DB işlemlerini sağlar.
 */

export type FullMagicLinkDeps = MagicLinkDeps & VerifyMagicLinkDeps

export function drizzleMagicLinkDeps(): FullMagicLinkDeps {
  const db = getDb()
  const env = loadEnv()

  // E-posta istemcisi — test ortamında gerçek gönderim YOK
  const emailClient = createEmailClient({
    apiKey: env.BREVO_API_KEY ?? '',
    sender: {
      name: 'Düğünce',
      email: env.BREVO_SENDER_EMAIL ?? 'noreply@dugunce.com.tr',
    },
    env: env.NODE_ENV,
    // Test ortamında no-op transport: gerçek mail atılmaz, test çalışır
    ...(env.NODE_ENV === 'test'
      ? {
          transport: async (payload) => {
            // Test ortamında gönderim yok — sadece log
            if (process.env['DEBUG_EMAIL'] === '1') {
              console.log('[test-email]', payload.subject, '→', payload.to[0]?.email)
            }
            return { messageId: 'test-noop' }
          },
        }
      : {}),
  })

  return {
    async sendEmail(params) {
      await emailClient.sendMagicLinkEmail(params)
    },

    // --- İstek tarafı ---

    async findUserByEmail(email) {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      return rows[0] ?? null
    },

    async createUser(email, displayName) {
      const rows = await db
        .insert(users)
        .values({ email, displayName })
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          status: users.status,
        })
      const created = rows[0]
      if (!created) throw new Error('Kullanıcı oluşturulamadı')
      return created
    },

    async insertMagicLink(row) {
      await db.insert(magicLinkTokens).values({
        userId: row.userId,
        tokenHash: row.tokenHash,
        shortCodeHash: row.shortCodeHash,
        expiresAt: row.expiresAt,
      })
    },

    /**
     * Önceki kullanılmamış linkleri geçersiz kılar.
     *
     * Tek aktif link politikası — eski linkler sızsa bile işe yaramaz.
     */
    async invalidatePreviousLinks(userId) {
      const rows = await db
        .update(magicLinkTokens)
        .set({ usedAt: new Date() })
        .where(
          and(eq(magicLinkTokens.userId, userId), isNull(magicLinkTokens.usedAt)),
        )
        .returning({ id: magicLinkTokens.id })
      return rows.length
    },

    // --- Doğrulama tarafı ---

    async findMagicLinkByHash(hash) {
      const rows = await db
        .select({
          id: magicLinkTokens.id,
          userId: magicLinkTokens.userId,
          attempts: magicLinkTokens.attempts,
          expiresAt: magicLinkTokens.expiresAt,
          usedAt: magicLinkTokens.usedAt,
          shortCodeHash: magicLinkTokens.shortCodeHash,
        })
        .from(magicLinkTokens)
        .where(eq(magicLinkTokens.tokenHash, hash))
        .limit(1)
      return rows[0] ?? null
    },

    async findMagicLinkByShortCode(hash) {
      const rows = await db
        .select({
          id: magicLinkTokens.id,
          userId: magicLinkTokens.userId,
          attempts: magicLinkTokens.attempts,
          expiresAt: magicLinkTokens.expiresAt,
          usedAt: magicLinkTokens.usedAt,
          shortCodeHash: magicLinkTokens.shortCodeHash,
        })
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.shortCodeHash, hash),
            isNull(magicLinkTokens.usedAt),
            sql`${magicLinkTokens.expiresAt} > now()`,
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },

    /**
     * Koşullu tüketim — yarış koşulu koruması.
     *
     * `WHERE used_at IS NULL` sayesinde iki eşzamanlı istekten yalnızca
     * biri `true` alır (Review Focus #4).
     */
    async markMagicLinkUsed(id) {
      const rows = await db
        .update(magicLinkTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(magicLinkTokens.id, id), isNull(magicLinkTokens.usedAt)))
        .returning({ id: magicLinkTokens.id })
      return rows.length > 0
    },

    async incrementAttempts(id) {
      const rows = await db
        .update(magicLinkTokens)
        .set({ attempts: sql`${magicLinkTokens.attempts} + 1` })
        .where(eq(magicLinkTokens.id, id))
        .returning({ attempts: magicLinkTokens.attempts })
      return rows[0]?.attempts ?? 0
    },

    async findUserById(id) {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)
      return rows[0] ?? null
    },

    async issueTokens(userId) {
      const accessToken = signAccessToken({ userId }, env.JWT_SECRET)
      const refresh = createRefreshToken()

      await db.insert(refreshTokens).values({
        userId,
        tokenHash: refresh.hash,
        expiresAt: refresh.expiresAt,
      })

      return { accessToken, refreshToken: refresh.raw }
    },

    async touchLastLogin(userId) {
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId))
    },
  }
}

