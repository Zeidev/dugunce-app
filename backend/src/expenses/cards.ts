import { z } from 'zod'
import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { cards, weddingMembers } from '../db/schema.js'

/**
 * Kart yönetimi — spec §6b.5.
 *
 * **GÜVENLİK KURALI (spec §6b.5, design §7):**
 * - Tam kart numarası ASLA saklanmaz — yalnızca `lastFour`
 * - CVV, son kullanma tarihi ASLA saklanmaz
 * - `lastFour` dışındaki rakamlar istemciden gelirse **reddedilir**
 *
 * Kart silinince harcamalar silinmez; `expenses.card_id` FK'si
 * `ON DELETE SET NULL` (schema).
 */

export const MAX_CARD_LABEL = 60
export const MAX_BANK_NAME = 60

/** 4 hane — başka uzunluk kabul edilmez. */
const lastFourSchema = z
  .string()
  .regex(/^\d{4}$/, 'Kart son 4 hanesi 4 rakam olmalı')

const inputSchema = z.object({
  label: z
    .string({ required_error: 'Kart etiketi zorunlu' })
    .trim()
    .min(1, 'Kart etiketi boş olamaz')
    .max(MAX_CARD_LABEL, `En fazla ${MAX_CARD_LABEL} karakter`),
  bankName: z.string().trim().max(MAX_BANK_NAME).optional(),
  lastFour: lastFourSchema.optional(),
  statementDay: z
    .number()
    .int()
    .min(1, 'Hesap kesim günü 1-31 arası olmalı')
    .max(31, 'Hesap kesim günü 1-31 arası olmalı')
    .optional(),
  isActive: z.boolean().optional(),
})

export type CardInput = z.input<typeof inputSchema>

export interface CardRecord {
  id: string
  weddingId: string
  label: string
  bankName: string | null
  lastFour: string | null
  statementDay: number | null
  isActive: boolean
}

export interface CardDeps {
  assertMember(weddingId: string, userId: string): Promise<boolean>
  listByWedding(weddingId: string, userId: string): Promise<CardRecord[]>
  insertCard(values: Record<string, unknown>): Promise<CardRecord>
  updateCard(
    cardId: string,
    values: Record<string, unknown>,
    weddingId: string,
    userId: string,
  ): Promise<CardRecord | null>
  deleteCard(cardId: string, weddingId: string, userId: string): Promise<boolean>
}

/**
 * Girdiyi doğrular.
 *
 * **Reddedilen alanlar:** `number`, `cardNumber`, `cvv`, `cvc`,
 * `expiry`, `expiryDate` — istemci yanlışlıkla tam kart bilgisi
 * göndermeye çalışırsa sessizce yok saymak yerine hata döneriz
 * (spec §6b.5: "ASLA saklanmaz").
 */
export function validateCardInput(input: unknown): z.output<typeof inputSchema> {
  if (input && typeof input === 'object') {
    const forbidden = ['number', 'cardNumber', 'cvv', 'cvc', 'expiry', 'expiryDate', 'pan']
    for (const key of forbidden) {
      if (key in (input as Record<string, unknown>)) {
        throw new Error(
          `Kart numarası, CVV ve son kullanma tarihi saklanmaz. ` +
            `Yalnızca etiket ve son 4 hane gönderin.`,
        )
      }
    }
  }
  return inputSchema.parse(input)
}

export async function listCards(
  params: { weddingId: string; userId: string },
  deps: Pick<CardDeps, 'listByWedding'>,
): Promise<CardRecord[]> {
  return deps.listByWedding(params.weddingId, params.userId)
}

export async function createCard(
  params: { weddingId: string; userId: string; input: unknown },
  deps: Pick<CardDeps, 'insertCard' | 'assertMember'>,
): Promise<CardRecord> {
  const parsed = validateCardInput(params.input)

  // Üyelik kapısı — route katmanındaki requireMember'a EK (defense in depth)
  const isMember = await deps.assertMember(params.weddingId, params.userId)
  if (!isMember) throw new Error('Düğün bulunamadı')

  return deps.insertCard({
    weddingId: params.weddingId,
    label: parsed.label,
    bankName: parsed.bankName ?? null,
    lastFour: parsed.lastFour ?? null,
    statementDay: parsed.statementDay ?? null,
    isActive: parsed.isActive ?? true,
  })
}

export async function updateCard(
  params: { weddingId: string; userId: string; cardId: string; input: unknown },
  deps: Pick<CardDeps, 'updateCard'>,
): Promise<CardRecord | null> {
  const parsed = validateCardInput(params.input)
  const values: Record<string, unknown> = { label: parsed.label }
  if (parsed.bankName !== undefined) values['bankName'] = parsed.bankName
  if (parsed.lastFour !== undefined) values['lastFour'] = parsed.lastFour
  if (parsed.statementDay !== undefined) values['statementDay'] = parsed.statementDay
  if (parsed.isActive !== undefined) values['isActive'] = parsed.isActive

  return deps.updateCard(params.cardId, values, params.weddingId, params.userId)
}

export async function deleteCard(
  params: { weddingId: string; userId: string; cardId: string },
  deps: Pick<CardDeps, 'deleteCard'>,
): Promise<boolean> {
  return deps.deleteCard(params.cardId, params.weddingId, params.userId)
}

// ---------------------------------------------------------------------------
// Drizzle deposu
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof getDb>

function cardColumns() {
  return {
    id: cards.id,
    weddingId: cards.weddingId,
    label: cards.label,
    bankName: cards.bankName,
    lastFour: cards.lastFour,
    statementDay: cards.statementDay,
    isActive: cards.isActive,
  }
}

export function drizzleCardDeps(dbOverride?: Db): CardDeps {
  const db = dbOverride ?? getDb()

  function memberJoin(weddingId: string, userId: string) {
    return and(
      eq(weddingMembers.weddingId, weddingId),
      eq(weddingMembers.userId, userId),
    )
  }

  return {
    async assertMember(weddingId, userId) {
      const rows = await db
        .select({ id: weddingMembers.id })
        .from(weddingMembers)
        .where(memberJoin(weddingId, userId))
        .limit(1)
      return rows.length > 0
    },

    async listByWedding(weddingId, userId) {
      const rows = await db
        .select(cardColumns())
        .from(cards)
        .innerJoin(weddingMembers, memberJoin(weddingId, userId))
        .where(eq(cards.weddingId, weddingId))
        .orderBy(cards.createdAt)
      return rows as CardRecord[]
    },

    async insertCard(values) {
      const rows = await db
        .insert(cards)
        .values(values as typeof cards.$inferInsert)
        .returning(cardColumns())
      const row = rows[0]
      if (!row) throw new Error('Kart oluşturulamadı')
      return row as CardRecord
    },

    async updateCard(cardId, values, weddingId, userId) {
      const rows = await db
        .update(cards)
        .set(values as Partial<typeof cards.$inferInsert>)
        .where(
          and(
            eq(cards.id, cardId),
            eq(cards.weddingId, weddingId),
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${cards.weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning(cardColumns())
      return (rows[0] as CardRecord | undefined) ?? null
    },

    async deleteCard(cardId, weddingId, userId) {
      const rows = await db
        .delete(cards)
        .where(
          and(
            eq(cards.id, cardId),
            eq(cards.weddingId, weddingId),
            sql`EXISTS (SELECT 1 FROM ${weddingMembers}
                        WHERE ${weddingMembers.weddingId} = ${weddingId}
                          AND ${weddingMembers.userId} = ${userId})`,
          ),
        )
        .returning({ id: cards.id })
      return rows.length > 0
    },
  }
}
