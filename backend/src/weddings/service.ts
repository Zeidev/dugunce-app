import { z } from 'zod'
import { TEMPLATES, FONTS } from './templates.js'
import { AppError } from '../lib/errors.js'
import {
  DEFAULT_PARTY_SIZE,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
} from '../guests/invitation.js'

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
  /**
   * Harita bağlantısı — YALNIZ http/https.
   *
   * `z.string().url()` tek başına `javascript:` ve `data:` şemalarını da
   * kabul ediyor. Davetiye sayfası bu değeri `<a href>` içine koyduğu
   * için şema beyaz listesi zorunlu (SECURITY §8).
   */
  mapUrl: z
    .string()
    .max(1000)
    .url('Geçerli bir bağlantı girin')
    .refine((v) => /^https?:\/\//i.test(v), {
      message: 'Bağlantı http:// veya https:// ile başlamalı',
    })
    .optional(),
  giftNote: z.string().trim().max(1000).optional(),
  rsvpDeadline: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Geçersiz tarih' })
    .optional(),
  /** Davetiye şablonu — anahtar listesi `templates.ts`. */
  template: z
    .enum(TEMPLATES, {
      errorMap: () => ({ message: 'Geçersiz şablon' }),
    })
    .optional(),
  /** Font — boş bırakılırsa şablonun önerilen fontu kullanılır. */
  fontKey: z.preprocess(
    // Boş dize "şablonun önerilenini kullan" demektir; alanı hiç
    // göndermemekle aynı şey. `enum` boş dizeyi reddettiği için
    // doğrulamadan ÖNCE `undefined`'a çeviriyoruz.
    //
    // NEDEN: mobil `WeddingDto.fontKey` varsayılanı `""` ve istemci bunu
    // olduğu gibi geri gönderebiliyor. Yalnız `enum` ile doğrulanınca
    // 400 dönüyor, kullanıcı "beklenmeyen bir hata" görüyordu.
    (v) => (v === '' ? undefined : v),
    z
      .enum(FONTS, {
        errorMap: () => ({ message: 'Geçersiz font' }),
      })
      .optional(),
  ),
  /** Davetliye "kaç kişi" sorusu sorulsun mu. */
  partySizeEnabled: z.boolean().optional(),
  /** Yeni davetiyenin başlangıç izni. */
  defaultPartySize: z
    .number()
    .int('Kişi sayısı tam sayı olmalı')
    .min(1, 'Kişi sayısı 1-10 arasında olmalı')
    .max(10, 'Kişi sayısı 1-10 arasında olmalı')
    .optional(),
  /** Çiftin izin verdiği üst sınır. */
  maxPartySize: z
    .number()
    .int('Kişi sayısı tam sayı olmalı')
    .min(1, 'Kişi sayısı 1-10 arasında olmalı')
    .max(10, 'Kişi sayısı 1-10 arasında olmalı')
    .optional(),
})

export type WeddingInput = z.input<typeof weddingInputSchema>
export type ValidatedWeddingInput = z.output<typeof weddingInputSchema>

/**
 * Güncellemede kabul edilen alanlar — plan/purchase ASLA kullanıcıdan gelmez.
 *
 * `null` gelen alanlar ATILIR. Gerekçe: mobil istemci (Ktor) opsiyonel
 * alanları bazen `null` olarak gönderiyor; `partial()` şeması `null`'ı
 * geçerli değer saymadığı için istek 400 dönüyordu — kullanıcı
 * "beklenmeyen bir hata oluştu" görüyordu. `null` = "bu alanı değiştirme".
 */
export const weddingPatchSchema = z.preprocess(
  (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return input
    // `null` = "bu alanı değiştirme" → anahtarı tamamen at.
    // Doğrulamadan ÖNCE yapılmalı; `transform` sonra çalışır ve null'lar
    // `partial()` şemasında zaten reddedilmiş olur.
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== null),
    )
  },
  weddingInputSchema.partial(),
)

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

  // Çapraz kural oluşturmada da geçerli — PATCH'te olduğu gibi.
  const createdDefault = input.defaultPartySize ?? DEFAULT_PARTY_SIZE
  const createdMax = input.maxPartySize ?? MAX_PARTY_SIZE
  if (createdDefault > createdMax) {
    throw AppError.badRequest(
      'Varsayılan kişi sayısı azamiyi geçemez',
      'PARTY_SIZE_INCONSISTENT',
    )
  }

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
      // Kişi sayısı ayarları — verilmezse DB varsayılanları geçerli.
      // Bunları DÜŞÜRMEK, istemcinin gönderdiği değeri sessizce yok
      // saymak olurdu.
      ...(input.partySizeEnabled !== undefined
        ? { partySizeEnabled: input.partySizeEnabled }
        : {}),
      ...(input.defaultPartySize !== undefined
        ? { defaultPartySize: input.defaultPartySize }
        : {}),
      ...(input.maxPartySize !== undefined
        ? { maxPartySize: input.maxPartySize }
        : {}),
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
    throw AppError.badRequest('Güncellenecek alan yok', 'EMPTY_PATCH')
  }

  // Üyelik kontrolü — üye değilse güncelleme yok
  const existing = await deps.findById(params.weddingId, params.userId)
  if (!existing) return null

  // Çapraz kural: varsayılan azamiyi geçemez.
  //
  // Şemada doğrulanamaz çünkü PATCH kısmi — yalnız `maxPartySize`
  // gönderildiğinde `defaultPartySize` şemada yoktur. Birleşik sonuç
  // üzerinden kontrol edilir. İstemciye güvenmek `allowed_party_size`
  // hatasının tekrarı olurdu.
  const nextDefault = (cleanPatch['defaultPartySize'] ??
    existing['defaultPartySize']) as number | undefined
  const nextMax = (cleanPatch['maxPartySize'] ??
    existing['maxPartySize']) as number | undefined
  if (
    typeof nextDefault === 'number' &&
    typeof nextMax === 'number' &&
    nextDefault > nextMax
  ) {
    throw AppError.badRequest(
      'Varsayılan kişi sayısı azamiyi geçemez',
      'PARTY_SIZE_INCONSISTENT',
    )
  }

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
