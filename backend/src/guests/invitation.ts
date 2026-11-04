import { generateToken, hashToken } from '../lib/crypto.js'

/**
 * Davetiye token'ı — üretim ve doğrulama.
 *
 * GÜVENLİK (SECURITY §1.2, §10.2):
 * - Ham token DB'de ASLA saklanmaz, yalnızca SHA-256 hash.
 * - Token 256 bit rastgele (≥128 bit şartını fazlasıyla karşılar).
 * - Doğrulama dört kapıdan geçer: var mı, revoke mu, süresi geçmiş mi,
 *   davetli silinmiş mi.
 *
 * Token URL'de `#fragment` içinde taşınır (design "Davetiye sayfası"),
 * böylece sunucu erişim loglarına düşmez.
 */

export const INVITATION_TTL_DAYS = 90

/** Davetlinin getirebileceği azami kişi sayısı — çift belirler. */
export const MIN_PARTY_SIZE = 1
export const MAX_PARTY_SIZE = 10

/**
 * Davetiye üretilirken kişi sayısı belirtilmezse kullanılan varsayılan.
 *
 * ÖNCE 1 idi: davetli "kaç kişi geleceksiniz" sorusunda "+" butonuna
 * basamıyordu — `max = 1` olduğu için buton hep devre dışıydı
 * (bildirilen hata). 2, "davetli + bir refakatçi" için makul bir
 * başlangıç; çift isterse 1'e düşürebilir.
 */
export const DEFAULT_PARTY_SIZE = 2

export class PartySizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PartySizeError'
  }
}

// ---------------------------------------------------------------------------
// Depo arayüzü
// ---------------------------------------------------------------------------

export interface InvitationGuest {
  id: string
  weddingId: string
  name: string
  deletedAt: Date | null
  /** Düğünün varsayılan kişi sayısı — açıkça değer verilmezse bu kullanılır. */
  defaultPartySize?: number | null
  /** Düğünün azamisi — varsayılanı da sınırlar. */
  maxPartySize?: number | null
}

export interface InvitationRow {
  id: string
  weddingId: string
  guestId: string
  tokenHash: string
  allowedPartySize: number
  confirmedPartySize: number | null
  rsvpSource: string | null
  rsvpAt: Date | null
  expiresAt: Date
  revokedAt: Date | null
  guest: {
    id: string
    name: string
    deletedAt: Date | null
    rsvp: string
  }
  wedding: {
    id: string
    coupleNames: string
    weddingDate?: Date
    timezone?: string
    venueName?: string | null
    venueAddress?: string | null
    mapUrl?: string | null
    program?: unknown
    giftNote?: string | null
    rsvpDeadline?: Date | null
    /** Davetiye şablonu — `public-view` içinde normalleştirilir. */
    template?: string | null
    /** Seçilen font — boş dize "şablonun önerileni" demektir. */
    fontKey?: string | null
    /** Kişi sayısı özelliği açık mı. */
    partySizeEnabled?: boolean | null
    /** Yeni davetiyenin başlangıç izni. */
    defaultPartySize?: number | null
    /** Çiftin izin verdiği üst sınır. */
    maxPartySize?: number | null
  }
}

export interface InvitationDeps {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
  /** Üyelik join'i ile — başka düğünün davetlisi dönmez (SECURITY §1.1). */
  findGuestForInvitation(
    guestId: string,
    weddingId: string,
    userId: string,
  ): Promise<InvitationGuest | null>
  insertInvitation(values: Record<string, unknown>, tx?: unknown): Promise<{ id: string }>
  findByTokenHash(tokenHash: string): Promise<InvitationRow | null>
  revokeByGuestId(guestId: string, tx?: unknown): Promise<number>
  /** Davetiye gönderildi işareti (`inviteStatus = SENT`). */
  markInviteSent(guestId: string, tx?: unknown): Promise<void>
}

// ---------------------------------------------------------------------------
// Üretim
// ---------------------------------------------------------------------------

export interface CreateInvitationParams {
  weddingId: string
  userId: string
  guestId: string
  /** Çiftin izin verdiği azami kişi sayısı. Varsayılan 1. */
  allowedPartySize?: number
}

export interface CreatedInvitation {
  token: string
  storedHash: string
  expiresAt: Date
}

/**
 * Yeni davetiye token'ı üretir.
 *
 * Ham token **yalnızca bu dönüşte** görünür; bir daha okunamaz. Kaybedilirse
 * çift yeni token üretmek zorundadır (eski link ölür).
 *
 * @returns null — davetli yoksa, silinmişse veya kullanıcı üye değilse (404)
 * @throws {PartySizeError} kişi sayısı 1-10 dışındaysa
 */
export async function createInvitation(
  params: CreateInvitationParams,
  deps: Pick<
    InvitationDeps,
    'findGuestForInvitation' | 'insertInvitation' | 'revokeByGuestId' | 'transaction' | 'markInviteSent'
  >,
): Promise<CreatedInvitation | null> {
  const guest = await deps.findGuestForInvitation(
    params.guestId,
    params.weddingId,
    params.userId,
  )
  if (!guest) return null

  if (guest.deletedAt) {
    throw new Error('Silinmiş davetliye davetiye üretilemez')
  }

  // Açıkça değer verilmediyse DÜĞÜNÜN varsayılanı kullanılır — sabit 2
  // değil. Aksi hâlde ayarlar sayfasındaki "Yeni davetliler bu sayıyla
  // başlar" yalan olurdu (toplu gönderim `allowedPartySize` göndermiyor).
  // Düğünün azamisi varsayılanı da sınırlar.
  const weddingDefault = guest.defaultPartySize ?? DEFAULT_PARTY_SIZE
  const weddingMax = guest.maxPartySize ?? MAX_PARTY_SIZE
  const allowedPartySize =
    params.allowedPartySize ?? Math.max(MIN_PARTY_SIZE, Math.min(weddingDefault, weddingMax))

  if (
    !Number.isInteger(allowedPartySize) ||
    allowedPartySize < MIN_PARTY_SIZE ||
    allowedPartySize > MAX_PARTY_SIZE
  ) {
    throw new PartySizeError(
      `Kişi sayısı ${MIN_PARTY_SIZE}-${MAX_PARTY_SIZE} arasında olmalı`,
    )
  }

  const token = generateToken() // 256 bit
  const storedHash = hashToken(token)
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000)

  // TEK AKTİF TOKEN (SECURITY §10.4 #3 kararı) — ATOMİK.
  //
  // Eski token'lar iptal edilmezse aynı davetlinin iki linki farklı RSVP
  // durumu gösterir. Ama iptal ile ekleme ayrı yapılırsa ve ekleme
  // başarısız olursa davetli TAMAMEN tokensız kalır. Bu yüzden ikisi
  // tek transaction'da: ya yeni token vardır, ya eski token'lar durur.
  await deps.transaction(async (tx) => {
    await deps.revokeByGuestId(params.guestId, tx)
    await deps.insertInvitation(
      {
        weddingId: params.weddingId,
        guestId: params.guestId,
        tokenHash: storedHash,
        allowedPartySize,
        expiresAt,
      },
      tx,
    )
    // "Gönderildi" işareti — AYNI transaction'da. Davetiye üretildiyse
    // çift onu paylaşmaya hazırdır; ayrı işaretleme başarısız olursa
    // durum tutarsız kalırdı.
    await deps.markInviteSent(params.guestId, tx)
  })

  return { token, storedHash, expiresAt }
}

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

/**
 * Ham token'ı çözer ve dört kapıyı denetler.
 *
 * Kapılar sırayla:
 * 1. Hash'le eşleşen kayıt var mı
 * 2. Revoke edilmiş mi
 * 3. Süresi geçmiş mi
 * 4. Davetli silinmiş mi  ← Review Focus #5
 *
 * @returns null — herhangi bir kapı geçilmezse (davetliye 404)
 */
export async function resolveInvitation(
  rawToken: string,
  deps: Pick<InvitationDeps, 'findByTokenHash'>,
): Promise<InvitationRow | null> {
  if (!rawToken) return null

  const row = await deps.findByTokenHash(hashToken(rawToken))
  if (!row) return null
  if (row.revokedAt) return null
  if (row.expiresAt.getTime() <= Date.now()) return null
  if (row.guest.deletedAt) return null

  return row
}

// ---------------------------------------------------------------------------
// İptal
// ---------------------------------------------------------------------------

/**
 * Davetlinin tüm aktif token'larını iptal eder.
 *
 * Davetli silindiğinde çağrılır — aksi halde silinmiş davetlinin linki
 * çalışmaya devam eder ve "silindi" bilgisi yalan olur.
 */
export async function revokeInvitation(
  params: { guestId: string },
  deps: Pick<InvitationDeps, 'revokeByGuestId'>,
): Promise<number> {
  return deps.revokeByGuestId(params.guestId)
}

/**
 * Davetlinin ETKİN azami kişi sayısı.
 *
 * `min` alınır çünkü düğünün azamisi bir ÜST SINIR'dır: çift azamiyi
 * 10'dan 4'e düşürdüğünde daha önce 10 izinli davetli de 4'e inmeli,
 * aksi hâlde ayar yalan söyler. Davetlinin kendi izni düğün
 * varsayılanından küçükse o korunur (çift bilinçli olarak dar izin
 * vermiştir).
 */
export function effectiveAllowedPartySize(row: InvitationRow): number {
  const weddingMax = row.wedding.maxPartySize ?? MAX_PARTY_SIZE
  return Math.max(MIN_PARTY_SIZE, Math.min(row.allowedPartySize, weddingMax))
}
