import { generateInviteCode } from '../lib/crypto.js'

/**
 * Davet kodu — 2. eş (CO_OWNER) daveti.
 *
 * 7 karakter, karışmayan karakter seti, 10 dk TTL, tek kullanım.
 * Kod düz metin saklanır (kullanıcı okuyup girecek) — ama TTL + tek
 * kullanım + rate limit ile korunur (design §7).
 */

export const INVITE_TTL_MINUTES = 10

/** Kabul edilen roller — yardımcı (HELPER) Aşama 5'te eklenecek. */
const ALLOWED_ROLES = ['CO_OWNER'] as const
export type InviteRole = (typeof ALLOWED_ROLES)[number]

export interface InviteDeps {
  insertInvite: (row: {
    weddingId: string
    code: string
    role: string
    displayName: string | null
    expiresAt: Date
    createdBy: string
  }) => Promise<{
    id: string
    code: string
    role: string
    expiresAt: Date
  }>
  findByCode: (code: string) => Promise<{
    id: string
    weddingId: string
    code: string
    role: string
    /** Şema nullable — kod her zaman süreli üretilir ama tip güvenliği için. */
    expiresAt: Date | null
    usedAt: Date | null
  } | null>
  markInviteUsed: (id: string) => Promise<boolean>
  insertMember: (row: {
    weddingId: string
    userId: string
    role: string
  }) => Promise<unknown>
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
}

export interface CreateInviteParams {
  weddingId: string
  role: InviteRole
  createdBy: string
  displayName?: string
}

/** Davet kodu üretir (10 dk geçerli). */
export async function createInvite(
  params: CreateInviteParams,
  deps: Pick<InviteDeps, 'insertInvite'>,
): Promise<{ code: string; expiresAt: Date }> {
  if (!ALLOWED_ROLES.includes(params.role)) {
    throw new Error(`Geçersiz rol: ${String(params.role)}`)
  }

  const code = generateInviteCode()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MINUTES * 60 * 1000)

  const created = await deps.insertInvite({
    weddingId: params.weddingId,
    code,
    role: params.role,
    displayName: params.displayName ?? null,
    expiresAt,
    createdBy: params.createdBy,
  })

  return { code: created.code, expiresAt: created.expiresAt }
}

/** Kodu normalize eder: trim + büyük harf. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase()
}

export interface AcceptInviteParams {
  code: string
  userId: string
}

export interface AcceptInviteResult {
  weddingId: string
  role: string
}

/**
 * Davet kodunu kabul eder — CO_OWNER üyeliği oluşturur.
 *
 * Sıra (transaction içinde):
 * 1. Kod normalize edilir ve aranır
 * 2. Kullanılmış/süresi dolmuş → reddet
 * 3. **Koşullu UPDATE** ile kod tüketilir (yarış koşulu koruması)
 * 4. Üyelik eklenir
 *
 * Kod tüketimi üyelikten ÖNCE — yarış koşulunda ikinci istek üye ekleyemez.
 */
export async function acceptInvite(
  params: AcceptInviteParams,
  deps: InviteDeps,
): Promise<AcceptInviteResult> {
  const code = normalizeInviteCode(params.code)

  const invite = await deps.findByCode(code)
  if (!invite) {
    throw new Error('Davet kodu bulunamadı')
  }

  if (invite.usedAt !== null) {
    throw new Error('Bu davet kodu kullanılmış')
  }

  if (!invite.expiresAt || invite.expiresAt.getTime() <= Date.now()) {
    throw new Error('Davet kodunun süresi dolmuş')
  }

  return deps.transaction(async () => {
    // Koşullu tüketim — aynı kod iki kez kabul edilemez
    const consumed = await deps.markInviteUsed(invite.id)
    if (!consumed) {
      throw new Error('Bu davet kodu kullanılmış')
    }

    try {
      await deps.insertMember({
        weddingId: invite.weddingId,
        userId: params.userId,
        role: invite.role,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/unique|duplicate/i.test(message)) {
        throw new Error('Bu düğüne zaten üyesiniz')
      }
      throw err
    }

    return { weddingId: invite.weddingId, role: invite.role }
  })
}
