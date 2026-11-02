import { z } from 'zod'

/**
 * Davetli servisi — iş mantığı.
 *
 * Tüm fonksiyonlar `weddingId` + `userId` alır; depo katmanı üyelik
 * join'i ile kapsamı zorlar (SECURITY §1.1). Servis katmanı da ayrıca
 * kontrol eder (defense in depth).
 */

export const GUEST_SIDES = ['BRIDE', 'GROOM'] as const
export const RSVP_STATES = ['PENDING', 'ATTENDING', 'DECLINED'] as const
export const INVITE_STATUSES = ['NOT_SENT', 'SENT'] as const

export const MAX_NAME_LENGTH = 100
export const MAX_NOTE_LENGTH = 500

// ---------------------------------------------------------------------------
// Telefon normalizasyonu
// ---------------------------------------------------------------------------

/**
 * Telefonu E.164'e normalize eder.
 *
 * Türkiye odaklı: `0532...`, `532...`, `90532...`, `+90532...` hepsi
 * `+905321234567` olur. Boş girdi `null` döner (telefon opsiyonel).
 *
 * @throws {Error} numara geçersizse
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null

  const trimmed = input.trim()
  if (!trimmed) return null

  // Yalnızca rakam ve baştaki + kalır
  const hadPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')

  if (/\p{L}/u.test(trimmed)) {
    throw new Error(`Geçersiz telefon numarası: ${input}`)
  }
  if (!digits) {
    throw new Error(`Geçersiz telefon numarası: ${input}`)
  }

  // Türkiye: 10 hane (5xx...) veya 12 hane (90 + 5xx...)
  let normalized: string
  if (hadPlus && digits.startsWith('90') && digits.length === 12) {
    normalized = `+${digits}`
  } else if (digits.length === 12 && digits.startsWith('90')) {
    normalized = `+${digits}`
  } else if (digits.length === 11 && digits.startsWith('0')) {
    normalized = `+90${digits.slice(1)}`
  } else if (digits.length === 10 && digits.startsWith('5')) {
    normalized = `+90${digits}`
  } else {
    throw new Error(`Geçersiz telefon numarası: ${input}`)
  }

  return normalized
}

// ---------------------------------------------------------------------------
// Girdi doğrulama
// ---------------------------------------------------------------------------

const baseSchema = z.object({
  name: z
    .string({ required_error: 'İsim zorunlu', invalid_type_error: 'İsim metin olmalı' })
    .trim()
    .min(1, { message: 'İsim zorunlu' })
    .max(MAX_NAME_LENGTH, { message: `İsim en fazla ${MAX_NAME_LENGTH} karakter olabilir` }),
  phone: z.string().optional(),
  side: z.enum(GUEST_SIDES).default('BRIDE'),
  note: z
    .string()
    .trim()
    .max(MAX_NOTE_LENGTH, `Not en fazla ${MAX_NOTE_LENGTH} karakter olabilir`)
    .optional(),
})

export interface ValidatedGuestInput {
  name: string
  phone?: string
  side: (typeof GUEST_SIDES)[number]
  note?: string
}

/**
 * Davetli girdisini doğrular.
 *
 * `rsvp` ve `inviteStatus` BİLİNÇLİ olarak kabul edilmez — bunlar ayrı
 * yollardan (RSVP akışı, WhatsApp gönderimi) değişir. Kullanıcıdan
 * doğrudan alınırsa liste ile gerçek erişim çelişir.
 */
export function validateGuestInput(input: unknown): ValidatedGuestInput {
  const parsed = baseSchema.parse(input)

  const result: ValidatedGuestInput = {
    name: parsed.name,
    side: parsed.side,
  }

  if (parsed.phone !== undefined) {
    const phone = normalizePhone(parsed.phone)
    if (phone !== null) result.phone = phone
  }

  if (parsed.note !== undefined && parsed.note !== '') {
    result.note = parsed.note
  }

  return result
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
    phone: z.string().nullable().optional(),
    side: z.enum(GUEST_SIDES).optional(),
    note: z.string().trim().max(MAX_NOTE_LENGTH).nullable().optional(),
  })
  .strip()
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncelleme boş olamaz' })

export type GuestPatch = z.infer<typeof patchSchema>

// ---------------------------------------------------------------------------
// Depo arayüzü
// ---------------------------------------------------------------------------

export interface GuestRecord {
  id: string
  weddingId: string
  name: string
  phone: string | null
  side: string
  inviteStatus: string
  rsvp: string
  note: string | null
  deletedAt: Date | null
}

export interface ListGuestsOptions {
  includeDeleted?: boolean
  side?: (typeof GUEST_SIDES)[number]
  rsvp?: (typeof RSVP_STATES)[number]
  /**
   * Ad veya telefon araması — spec §6b.7 "Ad arama".
   *
   * Sunucuda uygulanır: istemci tüm listeyi çekip elemez (kural).
   * `ILIKE '%...%'` — büyük/küçük harf duyarsız, Türkçe karakterler
   * PostgreSQL'in `tr_TR` collation'ında doğru çalışır.
   */
  search?: string
}

export interface GuestDeps {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
  insertGuest(values: Record<string, unknown>, tx: unknown): Promise<GuestRecord>
  insertGuests(
    rows: Record<string, unknown>[],
    tx: unknown,
  ): Promise<GuestRecord[]>
  listByWedding(
    weddingId: string,
    userId: string,
    opts: ListGuestsOptions,
  ): Promise<GuestRecord[]>
  findById(
    guestId: string,
    weddingId: string,
    userId: string,
  ): Promise<GuestRecord | null>
  updateGuest(
    guestId: string,
    values: Record<string, unknown>,
    weddingId: string,
    userId: string,
    tx?: unknown,
  ): Promise<GuestRecord>
  softDelete(guestId: string, tx: unknown): Promise<boolean>
  /** Davetli silinince token'ları ölür (Review Focus #5). */
  revokeInvitations(guestId: string, tx: unknown): Promise<number>
  /**
   * Aktif (silinmemiş) davetli sayısı.
   *
   * NOT: `COUNT(*)` ile `FOR UPDATE` birlikte KULLANILAMAZ
   * (PostgreSQL: "FOR UPDATE is not allowed with aggregate functions").
   * Kilit bu yüzden `lockWeddingForUpdate` ile düğün satırına vurulur.
   */
  countActiveGuests(
    tx: unknown,
    weddingId: string,
    userId: string,
  ): Promise<number>
  /**
   * Düğün satırını transaction boyunca kilitler.
   *
   * Aynı düğüne yapılan eşzamanlı davetli eklemelerini serileştirir —
   * limit yarışını kapatan asıl mekanizma budur (Review Focus #1).
   * `COUNT(*) FOR UPDATE` PostgreSQL'de yasak olduğu için bu yol seçildi.
   */
  lockWeddingForUpdate(tx: unknown, weddingId: string): Promise<void>
  /** Düğünün planı — üyelik join'i ile, istemciden ASLA alınmaz. */
  getPlan(tx: unknown, weddingId: string, userId: string): Promise<'FREE' | 'PREMIUM'>
  /**
   * Kullanıcı bu düğünün üyesi mi? (SECURITY §1.1 defense in depth)
   *
   * Route katmanı `requireWeddingMember` ile zaten engelliyor, ama
   * servis kendi başına da korunmalı: bir gün bir job/CLI/admin yolu
   * doğrudan çağırırsa tenant sınırı aşılmasın.
   */
  assertMember(tx: unknown, weddingId: string, userId: string): Promise<boolean>
  /** Davetlinin AKTİF (revoke/süre/silinme değil) davetiyeleri. */
  listActiveInvitationsForGuest(
    guestId: string,
  ): Promise<{ id: string; allowedPartySize: number }[]>
  /** Davetiye RSVP alanlarını yazar (çift tarafı düzeltmesi). */
  setInvitationRsvp(
    invitationId: string,
    values: {
      confirmedPartySize: number | null
      rsvpSource: string
      rsvpAt: Date
    },
    tx: unknown,
  ): Promise<void>
}

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

/**
 * Ücretsiz plan davetli limiti — **kayıt** sayısı, kişi sayısı değil
 * (SECURITY §10.2). Kullanıcı kararı 2026-11-02: 10 → 30.
 */
export const FREE_GUEST_LIMIT = 30

/** Tek toplu eklemede azami kayıt — kaba kötüye kullanım koruması. */
export const MAX_BULK_SIZE = 100

/**
 * Kullanıcı bu düğünün üyesi değil.
 *
 * Route katmanı bunu 404'e çevirir — 403 değil, çünkü 403 "kaynak var
 * ama yetkin yok" der ve düğünün varlığını sızdırır (SECURITY §1.1).
 */
export class NotMemberError extends Error {
  constructor() {
    super('Düğün bulunamadı')
    this.name = 'NotMemberError'
  }
}

export class GuestLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly current: number,
    public readonly requested: number = 1,
  ) {
    super(
      `Ücretsiz planda en fazla ${limit} davetli eklenebilir ` +
        `(şu an ${current}, eklenmek istenen ${requested}). ` +
        `Premium'a geçerek sınırsız davetli ekleyebilirsiniz.`,
    )
    this.name = 'GuestLimitError'
  }
}

/**
 * Limit kontrolü + işlemi AYNI transaction içinde yürütür.
 *
 * Neden: sayım ile yazma arasında başka bir istek araya girerse limit
 * aşılır. `countActiveGuests` store tarafında `FOR UPDATE` ile kilitlenir,
 * böylece eşzamanlı iki transaction sırayla çalışır.
 */
async function withLimitCheck<T>(
  params: { weddingId: string; userId: string; addCount: number },
  deps: GuestDeps,
  fn: (tx: unknown) => Promise<T>,
): Promise<T> {
  return deps.transaction(async (tx) => {
    // ÜYELİK ÖNCE (SECURITY §1.1 defense in depth).
    // `countActiveGuests` ve `getPlan` üyelik join'i kullandığı için üye
    // olmayan kullanıcı count=0 / plan=FREE görür ve limit kontrolü
    // sessizce geçerdi. Bu yüzden açık kontrol şart.
    const isMember = await deps.assertMember(tx, params.weddingId, params.userId)
    if (!isMember) {
      throw new NotMemberError()
    }

    // SONRA kilitle: aynı düğüne eşzamanlı yazma varsa bekle.
    // Kilit sayımdan önce alınmalı, sonra değil — aksi halde TOCTOU açığı kalır.
    await deps.lockWeddingForUpdate(tx, params.weddingId)

    const plan = await deps.getPlan(tx, params.weddingId, params.userId)
    if (plan === 'PREMIUM') return fn(tx)

    const current = await deps.countActiveGuests(tx, params.weddingId, params.userId)
    if (current + params.addCount > FREE_GUEST_LIMIT) {
      throw new GuestLimitError(FREE_GUEST_LIMIT, current, params.addCount)
    }
    return fn(tx)
  })
}

// ---------------------------------------------------------------------------
// İşlemler
// ---------------------------------------------------------------------------

export interface CreateGuestParams {
  weddingId: string
  userId: string
  input: unknown
}

export async function createGuest(
  params: CreateGuestParams,
  deps: GuestDeps,
): Promise<GuestRecord> {
  // Doğrulama limit kontrolünden ÖNCE — geçersiz girdi için kota harcanmasın
  const input = validateGuestInput(params.input)

  return withLimitCheck(
    { weddingId: params.weddingId, userId: params.userId, addCount: 1 },
    deps,
    async (tx) =>
      deps.insertGuest(
        {
          weddingId: params.weddingId,
          name: input.name,
          phone: input.phone ?? null,
          side: input.side,
          note: input.note ?? null,
        },
        tx,
      ),
  )
}

export interface BulkCreateGuestsParams {
  weddingId: string
  userId: string
  inputs: unknown[]
}

/**
 * Davetlileri toplu ekler — ya hepsi ya hiçbiri.
 *
 * Tek bir girdi geçersizse veya limit aşılırsa **hiçbiri** eklenmez.
 * Kısmi ekleme, kullanıcının listede ne olduğunu bilememesi demektir.
 */
export async function createGuestsBulk(
  params: BulkCreateGuestsParams,
  deps: GuestDeps,
): Promise<GuestRecord[]> {
  if (!Array.isArray(params.inputs) || params.inputs.length === 0) {
    throw new Error('En az bir davetli girilmeli')
  }
  if (params.inputs.length > MAX_BULK_SIZE) {
    throw new Error(`Tek seferde en fazla ${MAX_BULK_SIZE} davetli eklenebilir`)
  }

  // Önce HEPSİNİ doğrula — sonra tek transaction
  const validated = params.inputs.map((i) => validateGuestInput(i))

  return withLimitCheck(
    {
      weddingId: params.weddingId,
      userId: params.userId,
      addCount: validated.length,
    },
    deps,
    async (tx) =>
      deps.insertGuests(
        validated.map((v) => ({
          weddingId: params.weddingId,
          name: v.name,
          phone: v.phone ?? null,
          side: v.side,
          note: v.note ?? null,
        })),
        tx,
      ),
  )
}

export interface GuestUsage {
  limit: number | null
  used: number
  remaining: number | null
  plan: 'FREE' | 'PREMIUM'
}

/**
 * Kota göstergesi için kullanım bilgisi (design §6b.6).
 *
 * `limit: null` premium demektir — UI "sınırsız" gösterir.
 */
export async function getGuestUsage(
  params: { weddingId: string; userId: string },
  deps: Pick<GuestDeps, 'countActiveGuests' | 'getPlan'>,
): Promise<GuestUsage> {
  const [plan, used] = await Promise.all([
    deps.getPlan(null, params.weddingId, params.userId),
    deps.countActiveGuests(null, params.weddingId, params.userId),
  ])

  if (plan === 'PREMIUM') {
    return { limit: null, used, remaining: null, plan }
  }
  return {
    limit: FREE_GUEST_LIMIT,
    used,
    remaining: Math.max(0, FREE_GUEST_LIMIT - used),
    plan,
  }
}

export interface ListGuestsParams {
  weddingId: string
  userId: string
  includeDeleted?: boolean
  side?: (typeof GUEST_SIDES)[number]
  rsvp?: (typeof RSVP_STATES)[number]
  /** Ad veya telefon araması (spec §6b.7). */
  search?: string
}

export async function listGuests(
  params: ListGuestsParams,
  deps: Pick<GuestDeps, 'listByWedding'>,
): Promise<GuestRecord[]> {
  if (params.side !== undefined && !GUEST_SIDES.includes(params.side)) {
    throw new Error(`Geçersiz taraf: ${params.side}`)
  }
  if (params.rsvp !== undefined && !RSVP_STATES.includes(params.rsvp)) {
    throw new Error(`Geçersiz RSVP durumu: ${params.rsvp}`)
  }

  const opts: ListGuestsOptions = {
    includeDeleted: params.includeDeleted === true,
  }
  if (params.side !== undefined) opts.side = params.side
  if (params.rsvp !== undefined) opts.rsvp = params.rsvp
  // Arama: boş/whitespace ise yok say
  if (params.search !== undefined && params.search.trim() !== '') {
    opts.search = params.search.trim()
  }

  return deps.listByWedding(params.weddingId, params.userId, opts)
}

export interface UpdateGuestParams {
  weddingId: string
  userId: string
  guestId: string
  patch: unknown
}

/**
 * Davetliyi günceller.
 *
 * `rsvp` bu yoldan DEĞİŞTİRİLEMEZ — RSVP akışının kendi transaction'ı
 * vardır (davetiye + davetli birlikte güncellenir). Burada izin verilseydi
 * `guest_invitations.confirmed_party_size` ile çelişen bir durum oluşurdu.
 *
 * @returns null — davetli yoksa veya kullanıcı üye değilse (404)
 */
export async function updateGuest(
  params: UpdateGuestParams,
  deps: Pick<GuestDeps, 'findById' | 'updateGuest'>,
): Promise<GuestRecord | null> {
  const existing = await deps.findById(params.guestId, params.weddingId, params.userId)
  if (!existing) return null

  // `rsvp` ve `inviteStatus` bu yoldan değiştirilemez. Sessizce yutmak
  // yerine AÇIK hata ver: aksi halde istemci "güncelledim" sanar ama
  // davetiye tarafı eski kalır (rsvp) veya hiç yazılmaz (inviteStatus).
  const raw = params.patch
  if (raw !== null && typeof raw === 'object') {
    const keys = raw as Record<string, unknown>
    if ('rsvp' in keys) {
      throw new Error(
        'RSVP durumu bu uçtan değiştirilemez; PATCH /guests/:id/rsvp kullanılmalı',
      )
    }
    if ('inviteStatus' in keys || 'invite_status' in keys) {
      throw new Error(
        'Davet gönderim durumu bu uçtan değiştirilemez; davetiye gönderim akışı kullanılmalı',
      )
    }
  }

  const parsed = patchSchema.parse(params.patch)

  const values: Record<string, unknown> = {}
  if (parsed.name !== undefined) values['name'] = parsed.name
  if (parsed.side !== undefined) values['side'] = parsed.side
  if (parsed.note !== undefined) values['note'] = parsed.note
  if (parsed.phone !== undefined) {
    values['phone'] = parsed.phone === null ? null : normalizePhone(parsed.phone)
  }

  return deps.updateGuest(params.guestId, values, params.weddingId, params.userId)
}

export interface SetGuestRsvpParams {
  weddingId: string
  userId: string
  guestId: string
  rsvp: 'ATTENDING' | 'DECLINED' | 'PENDING'
  /** ATTENDING için kişi sayısı; DECLINED/PENDING'de yok sayılır. */
  partySize?: number
}

/**
 * Çiftin, davetli adına RSVP girmesi (telefonla gelen yanıt).
 *
 * SECURITY §10.2 karar #4: çift yanıtı düzeltebilir ve `rsvp_source`
 * COUPLE olarak saklanır — davetlinin kendi beyanıyla karışmasın.
 *
 * Karar #5: `rsvp_deadline` geçmiş olsa bile çift yazabilir; kapanış
 * yalnızca davetli için anlamlı.
 *
 * Davetiye tarafı da güncellenir ki liste ile davetiye tutarlı kalsın.
 *
 * @returns null — davetli yoksa veya kullanıcı üye değilse (404)
 */
export async function setGuestRsvp(
  params: SetGuestRsvpParams,
  deps: GuestDeps,
): Promise<GuestRecord | null> {
  if (!RSVP_STATES.includes(params.rsvp)) {
    throw new Error(`Geçersiz RSVP durumu: ${String(params.rsvp)}`)
  }

  const existing = await deps.findById(params.guestId, params.weddingId, params.userId)
  if (!existing) return null

  // Kişi sayısı doğrulaması davetiyedeki izne göre yapılır
  const invitations = await deps.listActiveInvitationsForGuest(params.guestId)
  const allowed = invitations[0]?.allowedPartySize ?? 1

  let confirmed: number | null = null
  if (params.rsvp === 'ATTENDING') {
    const size = params.partySize ?? 1
    if (!Number.isInteger(size) || size < 1) {
      throw new Error('Kişi sayısı en az 1 olmalı')
    }
    if (size > allowed) {
      throw new Error(`En fazla ${allowed} kişi bildirilebilir`)
    }
    confirmed = size
  } else if (params.rsvp === 'DECLINED') {
    confirmed = 0
  }

  return deps.transaction(async (tx) => {
    // Davetli kaydı — liste buradan okur
    const updated = await deps.updateGuest(
      params.guestId,
      { rsvp: params.rsvp, updatedAt: new Date() },
      params.weddingId,
      params.userId,
      tx,
    )

    // Davetiye tarafı — tutarlılık
    for (const inv of invitations) {
      await deps.setInvitationRsvp(
        inv.id,
        { confirmedPartySize: confirmed, rsvpSource: 'COUPLE', rsvpAt: new Date() },
        tx,
      )
    }

    return updated
  })
}

export interface DeleteGuestParams {
  weddingId: string
  userId: string
  guestId: string
}

/**
 * Davetliyi siler (soft delete) ve davetiye token'larını iptal eder.
 *
 * Token iptal edilmezse silinmiş davetlinin linki çalışmaya devam eder —
 * "silindi" yalanı olur (Review Focus #5).
 *
 * @returns false — davetli yoksa veya kullanıcı üye değilse (404)
 */
export async function deleteGuest(
  params: DeleteGuestParams,
  deps: Pick<GuestDeps, 'transaction' | 'findById' | 'softDelete' | 'revokeInvitations'>,
): Promise<boolean> {
  const existing = await deps.findById(params.guestId, params.weddingId, params.userId)
  if (!existing) return false

  // ATOMİK: soft delete + token iptali aynı transaction'da.
  // Ayrı yapılırsa soft delete başarılı olup revoke başarısız olabilir —
  // davetli "silinmiş" görünür ama linki çalışmaya devam eder, yani
  // Review Focus #5'in korumak istediği durumun tam kendisi oluşur.
  return deps.transaction(async (tx) => {
    const deleted = await deps.softDelete(params.guestId, tx)
    if (deleted) {
      await deps.revokeInvitations(params.guestId, tx)
    }
    return deleted
  })
}
