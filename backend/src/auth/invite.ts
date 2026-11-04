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
  /**
   * Kodu tüketir.
   *
   * `tx` ZORUNLU: `acceptInvite` bunu transaction içinde çağırır.
   * `tx` yok sayılırsa transaction atomik olmaz — kod tüketilip üyelik
   * yazılamazsa kod yanar ve kullanıcı bir daha katılamaz.
   */
  markInviteUsed: (id: string, tx?: unknown) => Promise<boolean>
  insertMember: (
    row: {
      weddingId: string
      userId: string
      role: string
    },
    tx?: unknown,
  ) => Promise<unknown>
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
/**
 * Davet kodu hatası — 4xx'e eşlenir.
 *
 * NEDEN: servis düz `Error` fırlatınca `errorHandler` 500 dönüyordu.
 * İstemci 500'ü "sunucu bozuk" sayar; kullanıcı sebebi göremez. Dahası
 * 401 ile karıştırılırsa oturum gereksiz kapanır (bildirilen hata:
 * "davet kodunu girince oturum sonlandırıldı uyarısı").
 */
export class InviteError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'InviteError'
    this.statusCode = statusCode
  }
}

export async function acceptInvite(
  params: AcceptInviteParams,
  deps: InviteDeps,
): Promise<AcceptInviteResult> {
  const code = normalizeInviteCode(params.code)

  const invite = await deps.findByCode(code)
  if (!invite) {
    throw new InviteError('Davet kodu bulunamadı', 404)
  }

  if (invite.usedAt !== null) {
    throw new InviteError('Bu davet kodu kullanılmış', 410)
  }

  if (!invite.expiresAt || invite.expiresAt.getTime() <= Date.now()) {
    throw new InviteError('Davet kodunun süresi dolmuş', 410)
  }

  return deps.transaction(async (tx) => {
    // Koşullu tüketim — aynı kod iki kez kabul edilemez
    const consumed = await deps.markInviteUsed(invite.id, tx)
    if (!consumed) {
      throw new InviteError('Bu davet kodu kullanılmış', 410)
    }

    try {
      await deps.insertMember(
        {
          weddingId: invite.weddingId,
          userId: params.userId,
          role: invite.role,
        },
        tx,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/unique|duplicate/i.test(message)) {
        throw new InviteError('Bu düğüne zaten üyesiniz', 409)
      }
      throw err
    }

    return { weddingId: invite.weddingId, role: invite.role }
  })
}
