import { z } from 'zod'
import { TEMPLATES, FONTS } from './templates.js'

/**
 * Düğün iş mantığı.
 *
 * Tüm fonksiyonlar `userId` alır — IDOR koruması servis katmanında,
 * middleware'e ek olarak burada da uygulanır (defense in depth).
 */

const MAX_COUPLE_NAMES = 200

export const weddingInputSchema = z.object({
  coupleNames: z
    .string()
    .trim()
    .min(1, 'Çift isimleri boş olamaz')
    .max(MAX_COUPLE_NAMES, `En fazla ${MAX_COUPLE_NAMES} karakter`),
  weddingDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Geçersiz tarih' }),
  timezone: z.string().default('Europe/Istanbul'),
  venueName: z.string().trim().max(200).optional(),
  venueAddress: z.string().trim().max(500).optional(),
  mapUrl: z.string().url().max(1000).optional(),
  giftNote: z.string().trim().max(1000).optional(),
  rsvpDeadline: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Geçersiz tarih' })
    .optional(),
  /** Davetiye şablonu — anahtar listesi `templates.ts`. */
  template: z.enum(TEMPLATES).optional(),
  /** Font — boş bırakılırsa şablonun önerilen fontu kullanılır. */
  fontKey: z.enum(FONTS).optional(),
})

export type WeddingInput = z.input<typeof weddingInputSchema>
export type ValidatedWeddingInput = z.output<typeof weddingInputSchema>

/** Güncellemede kabul edilen alanlar — plan/purchase ASLA kullanıcıdan gelmez. */
export const weddingPatchSchema = weddingInputSchema.partial()

export function validateWeddingInput(input: unknown): ValidatedWeddingInput {
  return weddingInputSchema.parse(input)
}

export interface WeddingRecord {
  id: string
  coupleNames: string
  weddingDate: Date
  plan: string
  status: string
  timezone: string
  [key: string]: unknown
}

export interface WeddingDeps {
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
  insertWedding: (values: Record<string, unknown>) => Promise<WeddingRecord>
  insertMember: (values: {
    weddingId: string
    userId: string
    role: string
  }) => Promise<unknown>
  listByUser: (userId: string) => Promise<WeddingRecord[]>
  findById: (weddingId: string, userId: string) => Promise<WeddingRecord | null>
  updateWedding: (
    weddingId: string,
    patch: Record<string, unknown>,
  ) => Promise<WeddingRecord | null>
}

/**
 * Düğün oluşturur ve yaratıcıyı OWNER yapar.
 *
 * Transaction içinde: düğün + üyelik atomik. Biri başarısızsa ikisi de geri alınır.
 */
export async function createWedding(
  params: { userId: string; input: unknown },
  deps: WeddingDeps,
): Promise<WeddingRecord> {
  const input = validateWeddingInput(params.input)

  return deps.transaction(async () => {
    const wedding = await deps.insertWedding({
      coupleNames: input.coupleNames,
      weddingDate: new Date(input.weddingDate),
      timezone: input.timezone,
      venueName: input.venueName ?? null,
      venueAddress: input.venueAddress ?? null,
      mapUrl: input.mapUrl ?? null,
      giftNote: input.giftNote ?? null,
      rsvpDeadline: input.rsvpDeadline ? new Date(input.rsvpDeadline) : null,
      plan: 'FREE',
      status: 'ACTIVE',
    })

    await deps.insertMember({
      weddingId: wedding.id,
      userId: params.userId,
      role: 'OWNER',
    })

    return wedding
  })
}

/** Kullanıcının üye olduğu düğünleri listeler. */
export async function listUserWeddings(
  userId: string,
  deps: Pick<WeddingDeps, 'listByUser'>,
): Promise<WeddingRecord[]> {
  return deps.listByUser(userId)
}

/**
 * Tek düğün getirir — üyelik kontrolü sorguya gömülü.
 *
 * Üye değilse `null` döner; çağıran taraf 404 üretir.
 */
export async function getWedding(
  params: { weddingId: string; userId: string },
  deps: Pick<WeddingDeps, 'findById'>,
): Promise<WeddingRecord | null> {
  return deps.findById(params.weddingId, params.userId)
}

/**
 * Düğünü günceller.
 *
 * `plan`, `purchaseToken`, `status` gibi alanlar **kullanıcıdan kabul edilmez** —
 * yalnızca sistem (ödeme doğrulaması, admin) değiştirebilir.
 */
export async function updateWedding(
  params: { weddingId: string; userId: string; patch: unknown },
  deps: Pick<WeddingDeps, 'findById' | 'updateWedding'>,
): Promise<WeddingRecord | null> {
  const patch = weddingPatchSchema.parse(params.patch)

  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  )

  if (Object.keys(cleanPatch).length === 0) {
    throw new Error('Güncellenecek alan yok')
  }

  // Üyelik kontrolü — üye değilse güncelleme yok
  const existing = await deps.findById(params.weddingId, params.userId)
  if (!existing) return null

  // Tarih alanlarını Date'e çevir
  const normalized: Record<string, unknown> = { ...cleanPatch }
  if (typeof normalized['weddingDate'] === 'string') {
    normalized['weddingDate'] = new Date(normalized['weddingDate'])
  }
  if (typeof normalized['rsvpDeadline'] === 'string') {
    normalized['rsvpDeadline'] = new Date(normalized['rsvpDeadline'])
  }

  return deps.updateWedding(params.weddingId, normalized)
}
