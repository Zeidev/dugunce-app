import { resolveGreeting } from './greeting.js'
import {
  effectiveAllowedPartySize,
  MAX_PARTY_SIZE,
  DEFAULT_PARTY_SIZE,
  type InvitationRow,
} from './invitation.js'
import { normalizeTemplate, normalizeFont } from '../weddings/templates.js'

/**
 * Davetliye gösterilen görünüm — BEYAZ LİSTE.
 *
 * Davetli tarafı kimlik doğrulaması olmayan tek yüzey. Tüm satırı döndürmek
 * şunları sızdırırdı:
 * - davetlinin telefonu (başkası linki görürse)
 * - `wedding_id` (başka uçlara zemin)
 * - `token_hash` (token'ın kendisi değil ama hash'i gereksiz risk)
 * - `rsvp_source` (iç denetim bilgisi)
 *
 * Bu yüzden gövde alan alan kurulur, `...row` ASLA kullanılmaz.
 */

/** Dönen alanların tam listesi — test bunu doğrular. */
export const PUBLIC_FIELDS = [
  'coupleNames',
  'weddingDate',
  'timezone',
  'venueName',
  'venueAddress',
  'mapUrl',
  'program',
  'giftNote',
  'guestName',
  'partySizeEnabled',
  'defaultPartySize',
  'maxPartySize',
  'invitationMessage',
  'allowedPartySize',
  'confirmedPartySize',
  'rsvp',
  'rsvpDeadline',
  'isOpen',
  'template',
  'fontKey',
] as const

export interface PublicProgramItem {
  time: string
  title: string
  note?: string
}

export interface PublicInvitation {
  coupleNames: string
  /** ISO 8601 — istemci `Intl.DateTimeFormat('tr-TR')` ile biçimler. */
  weddingDate: string | null
  timezone: string
  venueName: string | null
  venueAddress: string | null
  mapUrl: string | null
  program: PublicProgramItem[] | null
  giftNote: string | null
  guestName: string
  /**
   * Karşılama metni.
   *
   * Davetlinin ADI artık gösterilmiyor (kullanıcı kararı): isim yanlış
   * yazılırsa davetiye mahcup ediyor ve tek link birden çok kişiye
   * iletilebiliyor. Ücretsizde sabit genel mesaj, premium'da çiftin
   * kendi metni.
   */
  invitationMessage: string
  /** Davetliye "kaç kişi" sorusu sorulsun mu. */
  partySizeEnabled: boolean
  /** Yeni davetiyenin başlangıç izni. */
  defaultPartySize: number
  /** Çiftin izin verdiği üst sınır. */
  maxPartySize: number
  /** Çiftin izin verdiği azami kişi sayısı (etkin: min(davetli, düğün)). */
  allowedPartySize: number
  /** Davetlinin bildirdiği sayı; henüz yanıt yoksa null. */
  confirmedPartySize: number | null
  rsvp: string
  rsvpDeadline: string | null
  /** RSVP hâlâ açık mı — deadline geçtiyse false (davetli 410 alır). */
  isOpen: boolean
  /** Davetiye şablonu — bilinmeyen değer `ZARIF`'e normalleştirilir. */
  template: string
  /** Seçilen font — boş/geçersizse şablonun önerilen fontu. */
  fontKey: string
}

function parseProgram(raw: unknown): PublicProgramItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null

  const items: PublicProgramItem[] = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e['time'] !== 'string' || typeof e['title'] !== 'string') continue
    const item: PublicProgramItem = { time: e['time'], title: e['title'] }
    if (typeof e['note'] === 'string') item.note = e['note']
    items.push(item)
  }
  return items.length > 0 ? items : null
}

/**
 * Davetiye satırını davetliye gösterilecek hâle çevirir.
 *
 * Geçersizse (revoke / süresi geçmiş / davetli silinmiş) `null` döner —
 * çağıran 404 verir.
 */
export function toPublicInvitation(row: InvitationRow | null): PublicInvitation | null {
  if (!row) return null
  if (row.revokedAt) return null
  if (row.expiresAt.getTime() <= Date.now()) return null
  if (row.guest.deletedAt) return null

  const w = row.wedding
  const deadline = w.rsvpDeadline ?? null

  return {
    coupleNames: w.coupleNames,
    weddingDate: w.weddingDate ? w.weddingDate.toISOString() : null,
    timezone: w.timezone ?? 'Europe/Istanbul',
    venueName: w.venueName ?? null,
    venueAddress: w.venueAddress ?? null,
    mapUrl: w.mapUrl ?? null,
    program: parseProgram(w.program),
    giftNote: w.giftNote ?? null,
    guestName: row.guest.name,
    invitationMessage: resolveGreeting(w.plan, w.invitationMessage),
    partySizeEnabled: w.partySizeEnabled ?? true,
    defaultPartySize: w.defaultPartySize ?? DEFAULT_PARTY_SIZE,
    maxPartySize: w.maxPartySize ?? MAX_PARTY_SIZE,
    allowedPartySize: effectiveAllowedPartySize(row),
    confirmedPartySize: row.confirmedPartySize,
    rsvp: row.guest.rsvp,
    rsvpDeadline: deadline ? deadline.toISOString() : null,
    isOpen: deadline === null || deadline.getTime() > Date.now(),
    template: normalizeTemplate(w.template),
    fontKey: normalizeFont(w.template, w.fontKey),
  }
}
