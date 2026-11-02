import { z } from 'zod'
import { generateToken, hashToken } from '../lib/crypto.js'

/**
 * Yardımcı servisi — çift tarafı.
 *
 * KRİTİK: Yardımcının hesabı YOKTUR. Kimlik doğrulaması yalnızca
 * hash'lenmiş token iledir (SECURITY §1.2). `users` tablosuna girmez.
 */

export const MAX_HELPER_NAME = 60

/** Ücretsiz plan: 1 yardımcı (tadımlık). Premium: 5. */
export const FREE_HELPER_LIMIT = 1
export const PREMIUM_HELPER_LIMIT = 5

export class HelperLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(
      `Planınızda en fazla ${limit} yardımcı ekleyebilirsiniz (şu an ${current}). ` +
        `Premium'a geçerek ${PREMIUM_HELPER_LIMIT} yardımcı ekleyebilirsiniz.`,
    )
    this.name = 'HelperLimitError'
  }
}

/** Kullanıcı bu düğünün üyesi değil → 404 (varlık sızdırmaz). */
export class NotMemberError extends Error {
  constructor() {
    super('Düğün bulunamadı')
    this.name = 'NotMemberError'
  }
}

// ---------------------------------------------------------------------------
// Girdi doğrulama
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  displayName: z
    .string({ required_error: 'İsim zorunlu', invalid_type_error: 'İsim metin olmalı' })
    .trim()
    .min(1, { message: 'İsim zorunlu' })
    .max(MAX_HELPER_NAME, {
      message: `İsim en fazla ${MAX_HELPER_NAME} karakter olabilir`,
    }),
})

export interface ValidatedHelperInput {
  displayName: string
}

export function validateHelperInput(input: unknown): ValidatedHelperInput {
  const parsed = inputSchema.parse(input)
  return { displayName: parsed.displayName }
}

// ---------------------------------------------------------------------------
// Depo arayüzü
// ---------------------------------------------------------------------------

export interface HelperRecord {
  id: string
  weddingId: string
  displayName: string
  tokenRevokedAt: Date | null
  lastSeenAt: Date | null
  createdAt: Date
}

export interface HelperDeps {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
  insertHelper(values: Record<string, unknown>, tx: unknown): Promise<HelperRecord>
  listByWedding(weddingId: string, userId: string): Promise<HelperRecord[]>
  findById(
    helperId: string,
    weddingId: string,
    userId: string,
  ): Promise<HelperRecord | null>
  updateHelper(
    helperId: string,
    values: Record<string, unknown>,
    weddingId: string,
    userId: string,
    tx?: unknown,
  ): Promise<HelperRecord>
  revokeToken(helperId: string, tx?: unknown): Promise<boolean>
  deleteHelper(helperId: string, tx?: unknown): Promise<boolean>
  countHelpers(tx: unknown, weddingId: string, userId: string): Promise<number>
  getPlan(tx: unknown, weddingId: string, userId: string): Promise<'FREE' | 'PREMIUM'>
  assertMember(tx: unknown, weddingId: string, userId: string): Promise<boolean>
  lockWeddingForUpdate(tx: unknown, weddingId: string): Promise<void>
  /**
   * Yardımcının görev atamalarını boşaltır.
   *
   * Composite FK `ON DELETE SET NULL` OLAMAZ (wedding_id NOT NULL).
   * Bu yüzden silmeden ÖNCE bu çağrılır — aksi halde FK ihlali.
   */
  clearTaskAssignments(helperId: string, tx: unknown): Promise<number>
}

// ---------------------------------------------------------------------------
// İşlemler
// ---------------------------------------------------------------------------

export interface CreateHelperParams {
  weddingId: string
  userId: string
  input: unknown
}

export interface CreatedHelper {
  helper: HelperRecord
  /** Ham token — YALNIZCA burada görünür, bir daha okunamaz. */
  token: string
}

/**
 * Yeni yardımcı oluşturur ve token üretir.
 *
 * Ham token yalnızca bu dönüşte görünür. Kaybedilirse çift yeni token
 * üretmek zorundadır (eski link ölür).
 *
 * @throws {HelperLimitError} plan limiti aşıldıysa
 * @throws {NotMemberError} kullanıcı düğünün üyesi değilse
 */
export async function createHelper(
  params: CreateHelperParams,
  deps: HelperDeps,
): Promise<CreatedHelper> {
  const input = validateHelperInput(params.input)

  return deps.transaction(async (tx) => {
    // Üyelik ÖNCE (SECURITY §1.1 defense in depth)
    const isMember = await deps.assertMember(tx, params.weddingId, params.userId)
    if (!isMember) throw new NotMemberError()

    // Kilit sayımdan önce — aksi halde TOCTOU (Aşama 4 dersi)
    await deps.lockWeddingForUpdate(tx, params.weddingId)

    const plan = await deps.getPlan(tx, params.weddingId, params.userId)
    const limit = plan === 'PREMIUM' ? PREMIUM_HELPER_LIMIT : FREE_HELPER_LIMIT

    const current = await deps.countHelpers(tx, params.weddingId, params.userId)
    if (current >= limit) {
      throw new HelperLimitError(limit, current)
    }

    const token = generateToken() // 256 bit, 43 karakter base64url
    const accessTokenHash = hashToken(token)

    const helper = await deps.insertHelper(
      {
        weddingId: params.weddingId,
        displayName: input.displayName,
        accessTokenHash,
        createdBy: params.userId,
      },
      tx,
    )

    return { helper, token }
  })
}

export interface ListHelpersParams {
  weddingId: string
  userId: string
}

export async function listHelpers(
  params: ListHelpersParams,
  deps: Pick<HelperDeps, 'listByWedding'>,
): Promise<HelperRecord[]> {
  return deps.listByWedding(params.weddingId, params.userId)
}

export interface RenameHelperParams {
  weddingId: string
  userId: string
  helperId: string
  displayName: string
}

/**
 * Yardımcının görünen adını değiştirir.
 *
 * @returns null — yardımcı yoksa veya kullanıcı üye değilse (404)
 */
export async function renameHelper(
  params: RenameHelperParams,
  deps: Pick<HelperDeps, 'findById' | 'updateHelper'>,
): Promise<HelperRecord | null> {
  const existing = await deps.findById(params.helperId, params.weddingId, params.userId)
  if (!existing) return null

  const input = validateHelperInput({ displayName: params.displayName })
  return deps.updateHelper(
    params.helperId,
    { displayName: input.displayName, updatedAt: new Date() },
    params.weddingId,
    params.userId,
  )
}

export interface RevokeHelperParams {
  weddingId: string
  userId: string
  helperId: string
}

/**
 * Yardımcının token'ını iptal eder.
 *
 * Yardımcı ve görevleri KALIR; yalnızca erişim kapanır. Silmek için
 * `deleteHelper` kullanılır.
 *
 * @returns false — yardımcı yoksa veya kullanıcı üye değilse (404)
 */
export async function revokeHelper(
  params: RevokeHelperParams,
  deps: Pick<HelperDeps, 'findById' | 'revokeToken'>,
): Promise<boolean> {
  const existing = await deps.findById(params.helperId, params.weddingId, params.userId)
  if (!existing) return false
  return deps.revokeToken(params.helperId)
}

export interface DeleteHelperParams {
  weddingId: string
  userId: string
  helperId: string
}

/**
 * Yardımcıyı siler.
 *
 * ATOMİK: önce görev atamaları boşaltılır, sonra yardımcı silinir.
 *
 * Neden: composite FK `ON DELETE SET NULL` olamaz (wedding_id NOT NULL),
 * `ON DELETE CASCADE` ise görevleri de silerdi — yanlış. Bu yüzden FK
 * NO ACTION ve boşaltma servis katmanında yapılır.
 *
 * @returns false — yardımcı yoksa veya kullanıcı üye değilse (404)
 */
export async function deleteHelper(
  params: DeleteHelperParams,
  deps: Pick<
    HelperDeps,
    'transaction' | 'findById' | 'clearTaskAssignments' | 'deleteHelper'
  >,
): Promise<boolean> {
  const existing = await deps.findById(params.helperId, params.weddingId, params.userId)
  if (!existing) return false

  return deps.transaction(async (tx) => {
    // SIRA ÖNEMLİ: atamalar önce boşaltılmalı, yoksa FK ihlali
    await deps.clearTaskAssignments(params.helperId, tx)
    return deps.deleteHelper(params.helperId, tx)
  })
}
