import {
  resolveInvitation,
  effectiveAllowedPartySize,
  type InvitationRow,
} from './invitation.js'

/**
 * RSVP işleme.
 *
 * KRİTİK (SECURITY §10.2, design "Davetiye sayfası"):
 * - RSVP yalnızca `POST` ile değişir. `GET` yan etki yaratmaz — WhatsApp
 *   link önizlemesi davetiyeyi yakmasın.
 * - `allowed_party_size` (çiftin izni) ile `confirmed_party_size` (davetlinin
 *   beyanı) ayrı alanlar; davetli izni AŞAMAZ.
 * - İdempotent: aynı yanıt tekrar gelirse yazma yapılmaz.
 */

export const RSVP_VALUES = ['ATTENDING', 'DECLINED'] as const
export type RsvpValue = (typeof RSVP_VALUES)[number]
export type RsvpSource = 'GUEST' | 'COUPLE'

/** 422 — davetli girdisi iş kuralına uymuyor. */
export class RsvpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RsvpError'
  }
}

/** 410 — RSVP kapanmış (yalnızca davetli için; çift yazabilir). */
export class RsvpClosedError extends Error {
  constructor() {
    super('RSVP süresi doldu. Lütfen çift ile iletişime geçin.')
    this.name = 'RsvpClosedError'
  }
}

export interface RsvpDeps {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
  findByTokenHash(tokenHash: string): Promise<InvitationRow | null>
  updateRsvp(
    values: Record<string, unknown>,
    tx: unknown,
  ): Promise<{ id: string; confirmedPartySize: number | null }>
  /** Davetli listesindeki `rsvp` alanı — davetiye ile TUTARLI olmalı. */
  updateGuestRsvp(guestId: string, rsvp: string, tx: unknown): Promise<void>
}

export interface SubmitRsvpParams {
  rawToken: string
  rsvp: RsvpValue
  partySize?: number
  /** GUEST = davetli kendi bildirdi, COUPLE = çift telefonla geleni girdi. */
  source?: RsvpSource
}

export interface RsvpResult {
  id: string
  rsvp: RsvpValue
  confirmedPartySize: number | null
  /**
   * Yanıtın ait olduğu düğün.
   *
   * NEDEN BURADA: push bildirimi `weddingId` olmadan gönderilemez ve
   * route'un bunu ayrıca sorgulaması ikinci bir DB turu olurdu.
   * `resolveInvitation` zaten bu bilgiyi taşıyor.
   */
  weddingId: string
}

/**
 * Davetlinin RSVP yanıtını kaydeder.
 *
 * @returns null — token geçersiz (404)
 * @throws {RsvpError} 422 — kişi sayısı geçersiz veya izni aşıyor
 * @throws {RsvpClosedError} 410 — deadline geçmiş ve kaynak davetli
 */
export async function submitRsvp(
  params: SubmitRsvpParams,
  deps: RsvpDeps,
): Promise<RsvpResult | null> {
  const source: RsvpSource = params.source ?? 'GUEST'

  if (!RSVP_VALUES.includes(params.rsvp)) {
    throw new RsvpError(`Geçersiz RSVP değeri: ${String(params.rsvp)}`)
  }

  const invitation = await resolveInvitation(params.rawToken, deps)
  if (!invitation) return null

  // Kapanış yalnızca davetli için anlamlı; çift son dakika değişikliğini
  // yönetebilmeli.
  if (source === 'GUEST') {
    const deadline = invitation.wedding.rsvpDeadline
    if (deadline && deadline.getTime() <= Date.now()) {
      throw new RsvpClosedError()
    }
  }

  const confirmedPartySize = resolvePartySize(params, invitation)

  // İdempotent: aynı durum + aynı kişi sayısı → yazma yok
  const sameRsvp = invitation.guest.rsvp === params.rsvp
  const sameSize = (invitation.confirmedPartySize ?? null) === confirmedPartySize
  if (sameRsvp && sameSize) {
    return {
      id: invitation.id,
      rsvp: params.rsvp,
      confirmedPartySize,
      weddingId: invitation.weddingId,
    }
  }

  return deps.transaction(async (tx) => {
    await deps.updateRsvp(
      {
        invitationId: invitation.id,
        confirmedPartySize,
        rsvpSource: source,
        rsvpAt: new Date(),
      },
      tx,
    )

    // Davetli listesi ile davetiye TUTARLI olmalı; ikisi ayrı yazılırsa
    // liste yanlış görünür.
    await deps.updateGuestRsvp(invitation.guestId, params.rsvp, tx)

    return {
      id: invitation.id,
      rsvp: params.rsvp,
      confirmedPartySize,
      weddingId: invitation.weddingId,
    }
  })
}

/**
 * Kişi sayısını doğrular ve normalleştirir.
 *
 * DECLINED → her zaman 0 (kişi sayısı yok sayılır).
 * ATTENDING → 1..allowedPartySize arası tam sayı.
 */
function resolvePartySize(
  params: SubmitRsvpParams,
  invitation: InvitationRow,
): number {
  if (params.rsvp === 'DECLINED') return 0

  // Özellik kapalıyken davetiye kişi sayısı SORMAZ ve göndermez.
  // Burada `partySize`'ı yok sayıp 1 yazıyoruz: aksi hâlde
  // "Katılım için kişi sayısı gerekli" 422'si döner ve davetli
  // "Geliyorum"a basamaz — özelliği kapatan çift, davetlilerin
  // katılım bildirmesini engellemiş olur.
  // Önceden bildirilmiş sayı KORUNUR: davetli 3 kişi bildirmişse ve çift
  // özelliği kapatmışsa tekrar "Geliyorum"a basmak geçmişi silmemeli.
  if (invitation.wedding.partySizeEnabled === false) {
    return Math.max(1, invitation.confirmedPartySize ?? 1)
  }

  const size = params.partySize
  if (size === undefined || size === null) {
    throw new RsvpError('Katılım için kişi sayısı gerekli')
  }
  if (!Number.isInteger(size)) {
    throw new RsvpError('Kişi sayısı tam sayı olmalı')
  }
  if (size < 1) {
    throw new RsvpError('Kişi sayısı en az 1 olmalı')
  }
  // ETKİN azami: `min(davetlinin izni, düğünün max)`. Yalnız davetlinin
  // iznine bakmak, davetli sayfası "en fazla 4" derken eski bir sekmenin
  // 10 göndermesini kabul ederdi — ve çift tarafı `min` uyguladığı için
  // iki yüzey aynı davetiye hakkında farklı gerçek söylerdi.
  const max = effectiveAllowedPartySize(invitation)
  if (size > max) {
    throw new RsvpError(`En fazla ${max} kişi bildirebilirsiniz`)
  }
  return size
}
