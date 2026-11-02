# Düğünce — Aşama 4: Davetli ve RSVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Çiftin davetli listesini yönetebildiği, her davetliye **token'lı bir davetiye linki** üretildiği ve davetlinin **uygulama kurmadan** bu linkten gelip/gelemeyeceğini bildirebildiği bir modül kurmak.

**Architecture:** `guest` = kişi kaydı (limit bu sayılır). `guest_invitation` = token'lı link (ham token DB'de tutulmaz, SHA-256 hash). RSVP yalnızca `POST` ile değişir — `GET` yan etki yaratmaz (WhatsApp link önizlemesi davetiyeyi yakmasın). Tüm çift tarafı sorgular `wedding_id` + üyelik join'i ile kapsamlı; davetli tarafı tek yetki kaynağı tokendır.

**Tech Stack:** Drizzle ORM, PostgreSQL 16, Zod, Vitest, PGlite (gerçek SQL).

**Spec:** `docs/SECURITY.md` §1.1 (tenant), §1.2 (token), §10.2 (davetli/RSVP), §10.4 (ilişkiler) · `docs/superpowers/specs/2026-11-02-dugunce-design.md` §7 (veri modeli), §9 (limitler), "Davetiye sayfası — kritik tasarım"

---

## Global Constraints

- **Ücretsiz limit: 30 davetli** (`guest` kayıt sayısı; kişi sayısı değil — SECURITY §10.2)
- **Ham token asla DB'de tutulmaz** — yalnızca SHA-256 hash (SECURITY §1.2)
- **Token ≥128 bit entropi** — `generateToken()` (256 bit) kullanılır
- **`GET` yan etki yaratmaz** — RSVP yalnızca `POST`
- **`allowed_party_size` ≠ `confirmed_party_size`** — iki ayrı alan
- **Limit kontrolü transaction içinde** — eşzamanlı ekleme limiti aşamaz
- **Silme: soft delete** (`deleted_at`) — limit sayımı ve raporlar tutarlı kalsın
- **Tüm çift tarafı sorgular `wedding_id` + `userId`** (defense in depth)
- **Davetli tarafı yalnızca token ile** — `wedding_id` istemciden alınmaz
- **404, 403 değil** — üye olunmayan düğün varlığını sızdırmaz
- Test: **Vitest**, her görev testleri geçmeden tamam değil
- Türkçe kullanıcı metni, İngilizce kod

---

## SECURITY §10.2'nin 6 açık sorusu — bu planda karara bağlandı

SECURITY §10.2 "Netleşmesi gerekenler" listesi açık bırakılmış. Plan bunları şöyle kapatır (kararlar SECURITY.md'ye de işlenecek):

| # | Soru | Karar | Gerekçe |
|---|---|---|---|
| 1 | Davetli kaç kişiyle gelebilir? | `allowed_party_size`, varsayılan **1**, azami **10** | Çift belirler. 10 üstü düğünlerde zaten aile ağzından davet edilir, uygulama kapsamı dışı |
| 2 | Refakatçi sayısını kim değiştirebilir? | **Yalnızca çift** (OWNER/CO_OWNER) | Davetli kendi kontenjanını büyütemez — yoksa limit anlamsız |
| 3 | Davetli izin verilen sayıyı aşan yanıt verebilir mi? | **Hayır → 422** | Sessizce kırpmak yanlış (çift 4 kişi beklerken 6 gelir). Net hata + çifti ara |
| 4 | Çift yanıtı düzeltebilir mi? | **Evet**, `rsvp_source = GUEST \| COUPLE` ile kim yazdığı saklanır | Telefonla gelen yanıtı çift girmeli. Kaynak ayrımı olmadan çiftin düzeltmesi davetlinin beyanıyla karışır |
| 5 | RSVP kapanışından sonra değişiklik? | `rsvp_deadline` sonrası davetli **410**, çift **yazabilir** | Çift son dakika değişikliğini yönetmeli; davetli için kapanış anlamlı olmalı |
| 6 | Davetli silinirse eski bağlantı? | Token **revoke** + **404** | Silinen davetlinin linki çalışmaya devam ederse "silindi" yalanı olur |

---

## Review Focus

Bu 5 durum en olası kırılma noktaları — her biri belirli bir teste bağlanır:

1. **Limit yarış koşulu** — iki eşzamanlı ekleme ikisi de "29 kayıt var" görüp limiti aşar. Kontrol `SELECT ... FOR UPDATE` ile aynı transaction içinde. (Task 3)
2. **Token enumeration** — davetiye token'ı tahmin edilebilirse tüm davetlilerin adı/telefonu sızar. 256-bit rastgele + hash'lenmiş saklama. (Task 4)
3. **`GET` yan etkisi** — WhatsApp link önizlemesi `GET` atar; eğer `GET` RSVP'yi işaretlerse davetli hiç tıklamadan "geliyorum" der. (Task 6)
4. **RSVP idempotency** — davetli butona iki kez basar / ağ tekrar dener; kopya yanıt veya yanlış sayaç oluşmamalı. (Task 7)
5. **Silinen davetlinin linki çalışır** — soft delete sonrası token hâlâ geçerliyse davetli listesi ile gerçek erişim çelişir. (Task 8)

---

## Dosya Yapısı

```
backend/src/
├── db/
│   └── schema.ts              # + guests, guest_invitations
├── guests/
│   ├── service.ts             # davetli CRUD, limit kontrolü
│   ├── invitation.ts          # token üretimi/doğrulama, RSVP
│   ├── public-view.ts         # davetliye gösterilecek veri (alan seçimi)
│   └── store.ts               # Drizzle implementasyonu
└── routes/
    ├── guests.ts              # çift tarafı (/weddings/:id/guests)
    └── invitations.ts         # davetli tarafı (/invitations/:token)
```

---

## Task 1: Davetli şeması + migration

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/0003_*.sql`
- Test: `backend/tests/db/schema-guests.test.ts`

**Interfaces:**
- Consumes: Aşama 2 `weddings`, Aşama 3 composite FK deseni
- Produces: `guests`, `guest_invitations` tabloları

- [x] **Step 1: Failing test yaz**

```ts
describe('guests şeması', () => {
  it('guests tablosu wedding_id taşır ve composite unique hedefi verir', () => {
    expect(getTableColumns(guests)).toContain('wedding_id')
    // UNIQUE (id, wedding_id) — composite FK hedefi
  })
  it('phone nullable — telefonu olmayan davetli eklenebilir', () => {
    expect(guests.phone.notNull).toBe(false)
  })
  it('side BRIDE | GROOM — SHARED yok (davetli tarafı zorunlu)', () => {
    expect(guests.side.enumValues).toEqual(['BRIDE', 'GROOM'])
  })
  it('rsvp PENDING | ATTENDING | DECLINED', () => {
    expect(guests.rsvp.enumValues).toEqual(['PENDING', 'ATTENDING', 'DECLINED'])
  })
  it('deleted_at soft delete için nullable', () => { ... })
})

describe('guest_invitations şeması', () => {
  it('token_hash UNIQUE — aynı token iki davetliye verilemez', () => { ... })
  it('ham token kolonu YOK (SECURITY §1.2)', () => {
    const cols = getTableColumns(guestInvitations)
    expect(cols).not.toContain('token')
    expect(cols).toContain('token_hash')
  })
  it('allowed_party_size varsayılan 1', () => {
    expect(guestInvitations.allowedPartySize.default).toBe(1)
  })
  it('confirmed_party_size nullable — RSVP öncesi boş', () => { ... })
  it('rsvp_source GUEST | COUPLE — çift düzeltmesi ayrılır', () => { ... })
})
```

- [x] **Step 2: Şema**

```ts
export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),                    // nullable — WhatsApp için, zorunlu değil
  side: text('side').notNull().$type<'BRIDE' | 'GROOM'>(),
  inviteStatus: text('invite_status').notNull().default('NOT_SENT').$type<'NOT_SENT' | 'SENT'>(),
  rsvp: text('rsvp').notNull().default('PENDING').$type<'PENDING' | 'ATTENDING' | 'DECLINED'>(),
  note: text('note'),                      // çiftin kendi notu ("Ayşe'nin kuzeni")
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  weddingIdx: index('guests_wedding_idx').on(t.weddingId),
  idWeddingUnique: unique('guests_id_wedding_unique').on(t.id, t.weddingId),
}))

export const guestInvitations = pgTable('guest_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  guestId: uuid('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),   // ham token ASLA
  allowedPartySize: integer('allowed_party_size').notNull().default(1),
  confirmedPartySize: integer('confirmed_party_size'), // nullable — RSVP öncesi null
  rsvpSource: text('rsvp_source').$type<'GUEST' | 'COUPLE'>(),
  rsvpAt: timestamp('rsvp_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  guestIdx: index('guest_invitations_guest_idx').on(t.guestId),
  // composite FK: davetiye yalnızca kendi düğününün davetlisine bağlanır
  guestFk: foreignKey({
    columns: [t.guestId, t.weddingId],
    foreignColumns: [guests.id, guests.weddingId],
  }).onDelete('cascade'),
}))
```

**Kritik:** composite FK elle migration'a eklenir — Drizzle Kit üretmez (Aşama 3'te aynı sorun yaşandı). İdempotent `DO $$ ... IF NOT EXISTS ... $$` bloğu kullan.

- [x] **Step 3: Migration üret**

```bash
npx drizzle-kit generate
```

Üretilen SQL'e composite FK bloğunu elle ekle. **Aynı `wedding_id`'yi taşımayan davetiye yazılamamalı.**

- [x] **Step 4: Migration doğrulama**

```bash
npm run verify:migrations
```

`scripts/verify-migrations.mjs` 6 kontrol grubuna `guests`/`guest_invitations` ekle: tablo var mı, composite FK var mı, CASCADE çalışıyor mu, `token_hash` UNIQUE mi.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(db): add guests and guest_invitations schema"
```

---

## Task 2: Davetli servisi (oluştur, listele, güncelle, sil)

**Files:**
- Create: `backend/src/guests/service.ts`
- Test: `backend/tests/guests/service.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: `validateGuestInput`, `createGuest`, `listGuests`, `updateGuest`, `deleteGuest`

- [x] **Step 1: Failing test yaz**

```ts
describe('validateGuestInput', () => {
  it('isim zorunlu, boş olamaz')
  it('isim 100 karakteri aşamaz')
  it('telefon E.164 normalize edilir (+905321234567)')
  it('telefon boşluk/tire temizlenir')
  it('geçersiz telefon reddedilir')
  it('telefon opsiyonel — boş davetli kabul edilir')
  it('side BRIDE | GROOM, SHARED reddedilir')
  it('Türkçe karakterler korunur')
})

describe('createGuest', () => {
  it('davetliyi oluşturur, rsvp PENDING başlar')
  it('inviteStatus NOT_SENT başlar')
  it('transaction içinde çalışır')
})

describe('listGuests', () => {
  it('silinmiş davetliler varsayılan gizli')
  it('includeDeleted=true ile gelir')
  it('tarafa göre filtrelenir')
  it('RSVP durumuna göre filtrelenir')
  it('sorgu weddingId + userId ile (IDOR)')
})

describe('updateGuest', () => {
  it('isim/telefon/taraf güncellenir')
  it('üye olunmayan davetli null döner (404)')
  it('boş patch hata fırlatır')
  it('rsvp alanı bu yoldan DEĞİŞTİRİLEMEZ (ayrı yol)')
})

describe('deleteGuest', () => {
  it('soft delete çağırır')
  it('silinince aktif davetiye token\'ları revoke edilir')
})
```

- [x] **Step 2-5: TDD döngüsü** — önce implementasyon olmadan çalıştır, kırmızı gör, sonra yaz.

- [x] **Step 6: Commit**

```bash
git commit -m "feat(guests): add guest CRUD service"
```

---

## Task 3: 30 davetli limiti (transaction-safe)

**Files:**
- Modify: `backend/src/guests/service.ts`
- Test: `backend/tests/guests/limit.test.ts`

**Interfaces:**
- Consumes: Task 2
- Produces: `assertGuestLimit`, `FREE_GUEST_LIMIT = 30`, `GuestLimitError`

- [x] **Step 1: Failing test yaz**

```ts
describe('davetli limiti (Review Focus #1)', () => {
  it('ücretsiz planda 30. davetli eklenir', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(29) })
    await expect(createGuest({...}, d)).resolves.toBeDefined()
  })

  it('31. davetli reddedilir (GuestLimitError)', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(30) })
    await expect(createGuest({...}, d)).rejects.toThrow(GuestLimitError)
  })

  it('premium planda limit yok', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(500), getPlan: vi.fn().mockResolvedValue('PREMIUM') })
    await expect(createGuest({...}, d)).resolves.toBeDefined()
  })

  it('silinmiş davetliler limiti SAYMAZ', async () => {
    // countActiveGuests deleted_at IS NULL filtresi kullanır
  })

  it('limit kontrolü transaction İÇİNDE yapılır (yarış koşulu)', async () => {
    // transaction çağrılmadan limit kontrolü yapılmamalı
    expect(d.transaction).toHaveBeenCalled()
  })

  it('toplu ekleme: 25 kayıt + 10 kişi = limit aşımı → HİÇBİRİ eklenmez', async () => {
    const d = makeDeps({ countActiveGuests: vi.fn().mockResolvedValue(25) })
    await expect(createGuestsBulk({ guests: make(10) }, d)).rejects.toThrow(/limit/i)
    expect(d.insertGuest).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Limit sabiti ve hata tipi**

```ts
export const FREE_GUEST_LIMIT = 30

export class GuestLimitError extends Error {
  constructor(public readonly limit: number, public readonly current: number) {
    super(`Ücretsiz planda en fazla ${limit} davetli eklenebilir (şu an ${current}). Premium'a geçerek sınırsız ekleyebilirsiniz.`)
    this.name = 'GuestLimitError'
  }
}
```

- [x] **Step 3: Transaction-safe kontrol**

```ts
// KRİTİK: sayım ve ekleme AYNI transaction içinde.
// Aksi halde iki eşzamanlı istek ikisi de "29 var" görüp 31'e çıkar.
async function withLimitCheck<T>(weddingId, userId, addCount, deps, fn): Promise<T> {
  return deps.transaction(async (tx) => {
    const plan = await deps.getPlan(tx, weddingId, userId)
    if (plan === 'PREMIUM') return fn(tx)
    const current = await deps.countActiveGuests(tx, weddingId, userId) // FOR UPDATE
    if (current + addCount > FREE_GUEST_LIMIT) {
      throw new GuestLimitError(FREE_GUEST_LIMIT, current)
    }
    return fn(tx)
  })
}
```

- [x] **Step 4: Store'da `FOR UPDATE`**

`countActiveGuests` sorgusu `SELECT ... FOR UPDATE` ile kilitlenir ki eşzamanlı iki transaction sırayla çalışsın.

- [x] **Step 5: Gerçek DB yarış testi (PGlite)**

İki paralel `createGuest` çağrısı → biri başarılı, biri `GuestLimitError`. Toplam 30'u geçmez.

- [x] **Step 6: Commit**

```bash
git commit -m "feat(guests): enforce 30 guest free-tier limit transactionally"
```

---

## Task 4: Davetiye token'ı üretimi ve doğrulama

**Files:**
- Create: `backend/src/guests/invitation.ts`
- Test: `backend/tests/guests/invitation.test.ts`

**Interfaces:**
- Consumes: Aşama 2 `generateToken`, `hashToken` (`lib/crypto.ts`)
- Produces: `createInvitation`, `resolveInvitation`, `INVITATION_TTL_DAYS`

- [x] **Step 1: Failing test yaz**

```ts
describe('createInvitation (Review Focus #2)', () => {
  it('256-bit token üretir, ham token YALNIZCA bir kez döner', async () => {
    const r = await createInvitation({ weddingId, userId, guestId }, d)
    expect(r.token).toHaveLength(64)        // 32 byte hex
    expect(r.token).not.toBe(r.storedHash)  // ham != hash
  })

  it('DB\'ye yalnızca hash yazılır', async () => {
    await createInvitation({...}, d)
    const written = d.insertInvitation.mock.calls[0][0]
    expect(written.tokenHash).toBe(sha256(r.token))
    expect(written).not.toHaveProperty('token')
  })

  it('iki davetiye token\'ı asla aynı olmaz', async () => {
    const a = await createInvitation({...}, d)
    const b = await createInvitation({...}, d)
    expect(a.token).not.toBe(b.token)
  })

  it('TTL varsayılan 90 gün', async () => { ... })

  it('allowed_party_size 1-10 arası, dışı reddedilir', async () => { ... })

  it('silinmiş davetliye davetiye üretilemez', async () => { ... })

  it('üye olunmayan düğüne davetiye üretilemez (IDOR)', async () => { ... })
})

describe('resolveInvitation', () => {
  it('geçerli token → davetiye + davetli + düğün döner')
  it('bilinmeyen token → null')
  it('süresi geçmiş token → null')
  it('revoke edilmiş token → null')
  it('silinmiş davetlinin token\'ı → null (Review Focus #5)')
  it('davetiye sorgusu hash ile yapılır, ham token ile değil')
})
```

- [x] **Step 2: Üretim**

```ts
export const INVITATION_TTL_DAYS = 90
export const MIN_PARTY_SIZE = 1
export const MAX_PARTY_SIZE = 10

export async function createInvitation(params, deps) {
  const token = generateToken()              // 256-bit
  const tokenHash = hashToken(token)         // SHA-256
  const expiresAt = addDays(new Date(), INVITATION_TTL_DAYS)
  await deps.insertInvitation({ weddingId, guestId, tokenHash, allowedPartySize, expiresAt })
  return { token, expiresAt }                // ham token BİR KEZ döner
}
```

- [x] **Step 3: Doğrulama — dört kapı**

```ts
async function resolveInvitation(rawToken, deps) {
  const hash = hashToken(rawToken)
  const row = await deps.findByTokenHash(hash)
  if (!row) return null
  if (row.revokedAt) return null
  if (row.expiresAt <= new Date()) return null
  if (row.guest.deletedAt) return null      // Review Focus #5
  return row
}
```

- [x] **Step 4: Commit**

```bash
git commit -m "feat(guests): add invitation token generation and resolution"
```

---

## Task 5: Davetliye açık görünüm (alan seçimi)

**Files:**
- Create: `backend/src/guests/public-view.ts`
- Test: `backend/tests/guests/public-view.test.ts`

**Interfaces:**
- Consumes: Task 4
- Produces: `toPublicInvitation`

**Neden ayrı görev:** Davetliye dönen gövde **beyaz liste** olmalı. Tüm satırı döndürmek `wedding_id`, davetlinin telefonu, çiftin e-postası gibi gereksiz verileri sızdırır.

- [x] **Step 1: Failing test yaz**

```ts
describe('toPublicInvitation', () => {
  it('çift isimleri, tarih, mekân, program döner')
  it('davetli adı döner (kişiselleştirme)')
  it('allowedPartySize döner, confirmedPartySize döner')
  it('telefon DÖNMEZ')
  it('wedding_id DÖNMEZ')
  it('çiftin e-posta/user id DÖNMEZ')
  it('program boşsa alan null')
  it('rsvpDeadline geçmişse isOpen=false')
  it('davetiye revoke ise null')
})
```

- [x] **Step 2: Beyaz liste**

```ts
export interface PublicInvitation {
  coupleNames: string
  weddingDate: string          // ISO
  timezone: string
  venueName: string | null
  venueAddress: string | null
  mapUrl: string | null
  program: { time: string; title: string; note?: string }[] | null
  giftNote: string | null
  guestName: string
  allowedPartySize: number
  confirmedPartySize: number | null
  rsvp: 'PENDING' | 'ATTENDING' | 'DECLINED'
  rsvpDeadline: string | null
  isOpen: boolean
}
```

- [x] **Step 3: Commit**

```bash
git commit -m "feat(guests): add whitelisted public invitation view"
```

---

## Task 6: RSVP işleme (idempotent)

**Files:**
- Modify: `backend/src/guests/invitation.ts`
- Test: `backend/tests/guests/rsvp.test.ts`

**Interfaces:**
- Consumes: Task 4, 5
- Produces: `submitRsvp`, `RsvpError`

- [x] **Step 1: Failing test yaz**

```ts
describe('submitRsvp (Review Focus #4)', () => {
  it('ATTENDING + kişi sayısı kaydedilir, rsvpAt yazılır')
  it('DECLINED → confirmedPartySize 0 olur')
  it('aynı yanıt iki kez gönderilirse kopya oluşmaz (idempotent)')
  it('ikinci farklı yanıt öncekini GÜNCELLER (davetli fikrini değiştirebilir)')
  it('izin verilen kişi sayısı aşılırsa 422 (Review Focus #3)')
  it('kişi sayısı 0 veya negatif → 422')
  it('ATTENDING\'de kişi sayısı zorunlu')
  it('DECLINED\'de kişi sayısı yok sayılır')
  it('rsvpDeadline geçmişse RsvpClosedError (410)')
  it('revoke edilmiş token → 404')
  it('rsvpSource GUEST olarak yazılır')
  it('silinmiş davetli → 404')
})

describe('submitRsvp — eşzamanlılık', () => {
  it('iki paralel POST tek satır bırakır (unique constraint + upsert)')
})
```

- [x] **Step 2: İş mantığı**

```ts
export class RsvpError extends Error { /* 422 */ }
export class RsvpClosedError extends Error { /* 410 */ }

export async function submitRsvp({ rawToken, rsvp, partySize, source = 'GUEST' }, deps) {
  const inv = await resolveInvitation(rawToken, deps)
  if (!inv) return null                                  // 404

  if (source === 'GUEST' && isPastDeadline(inv)) {
    throw new RsvpClosedError()
  }

  let confirmed: number | null = null
  if (rsvp === 'ATTENDING') {
    if (partySize == null) throw new RsvpError('Kişi sayısı gerekli')
    if (partySize < 1) throw new RsvpError('Kişi sayısı en az 1')
    if (partySize > inv.allowedPartySize) {
      throw new RsvpError(`En fazla ${inv.allowedPartySize} kişi bildirebilirsiniz`)
    }
    confirmed = partySize
  } else if (rsvp === 'DECLINED') {
    confirmed = 0
  }

  // Idempotent: aynı değerler zaten varsa yazma yapma
  if (inv.rsvp === rsvp && inv.confirmedPartySize === confirmed) {
    return inv
  }

  return deps.updateRsvp({ invitationId: inv.id, rsvp, confirmedPartySize: confirmed, source })
}
```

- [x] **Step 3: `guests.rsvp` ve `guest_invitations` birlikte güncellenir**

Tek transaction: davetiyede `confirmedPartySize`/`rsvpAt`, davetlide `rsvp`. İkisi tutarsız kalırsa liste yanlış görünür.

- [x] **Step 4: Commit**

```bash
git commit -m "feat(guests): add idempotent RSVP submission"
```

---

## Task 7: `GET` yan etkisizliği testi

**Files:**
- Test: `backend/tests/guests/no-side-effect.test.ts`

**Interfaces:**
- Consumes: Task 5, 6

**Neden ayrı görev:** Bu, WhatsApp link önizlemesinin davetiyeyi yakmaması için **tek** savunma. Ayrı ve açık bir test olmadan sessizce bozulabilir.

- [x] **Step 1: Failing test yaz**

```ts
describe('GET yan etki yaratmaz (Review Focus #3)', () => {
  it('GET /invitations/:token RSVP\'yi DEĞİŞTİRMEZ', async () => {
    const before = await getRsvpState()
    await request(app).get(`/api/v1/invitations/${token}`)
    const after = await getRsvpState()
    expect(after).toEqual(before)          // rsvpAt değişmemeli
  })

  it('GET çağrısı inviteStatus\'u SENT yapmaz', async () => { ... })

  it('aynı GET 10 kez → durum aynı kalır', async () => {
    for (let i = 0; i < 10; i++) await request(app).get(...)
    expect(await getRsvpState()).toEqual(before)
  })

  it('GET yanıtı Cache-Control: no-store taşır', async () => { ... })
})
```

- [x] **Step 2: Route'un `GET` olduğundan emin ol** — `POST` ayrı handler.

- [x] **Step 3: Commit**

```bash
git commit -m "test(guests): prove GET has no RSVP side effects"
```

---

## Task 8: HTTP route'ları

**Files:**
- Create: `backend/src/routes/guests.ts`, `backend/src/routes/invitations.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/e2e/guests-routes.test.ts`, `backend/tests/e2e/invitations-routes.test.ts`

**Interfaces:**
- Consumes: Task 2-7
- Produces: çift tarafı 6 + davetli tarafı 2 endpoint

- [x] **Step 1: Route tablosu**

**Çift tarafı** (`requireAuth` + `requireWeddingMember`):

| Method | Path | Açıklama |
|---|---|---|
| GET | `/weddings/:weddingId/guests` | Liste (filtre: side, rsvp, includeDeleted) |
| POST | `/weddings/:weddingId/guests` | Tek ekle |
| POST | `/weddings/:weddingId/guests/bulk` | Toplu ekle (transaction) |
| PATCH | `/weddings/:weddingId/guests/:guestId` | Güncelle |
| DELETE | `/weddings/:weddingId/guests/:guestId` | Soft delete |
| POST | `/weddings/:weddingId/guests/:guestId/invitation` | Token üret (ham token bir kez döner) |
| GET | `/weddings/:weddingId/guests/limit` | `{ limit, used, plan }` — UI için |

**Davetli tarafı** (`requireAuth` YOK — token tek yetki):

| Method | Path | Açıklama |
|---|---|---|
| GET | `/invitations/:token` | Davetiyeyi göster (yan etkisiz) |
| POST | `/invitations/:token/rsvp` | RSVP gönder |

- [x] **Step 2: Hata eşlemesi**

| Durum | Kod |
|---|---|
| `GuestLimitError` | 403 + `code: 'GUEST_LIMIT'` + `{ limit, current, plan }` |
| `RsvpError` | 422 |
| `RsvpClosedError` | 410 |
| Token bulunamadı / revoke / süresi geçmiş | 404 |
| Üye olunmayan düğün | 404 |

- [x] **Step 3: Davetli tarafı güvenlik başlıkları**

`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`.

- [x] **Step 4: E2E test**

Token yok → 401 (çift tarafı), üye değil → 404, geçersiz token → 404, limit → 403 + kod.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(api): add guest and invitation routes"
```

---

## Task 9: Drizzle store

**Files:**
- Create: `backend/src/guests/store.ts`
- Test: `backend/tests/guests/store.test.ts` (gerçek Drizzle + PGlite)

**Interfaces:**
- Consumes: Task 2-8

**Dikkat:** Aşama 3'te `store.test.ts` ham SQL çalıştırdığı için Drizzle join'ini test etmiyordu. Bu sefer **gerçek store** test edilir ve negatif kontrol yapılır.

- [x] **Step 1: Store**

Her sorgu `wedding_members` join'i ile. `countActiveGuests` → `FOR UPDATE`. `findByTokenHash` → davetli + düğün join, `deleted_at IS NULL`.

- [x] **Step 2: Gerçek DB testi**

```ts
it('üye olmayan kullanıcı davetli listesini göremez (IDOR)')
it('başka düğünün davetlisine davetiye üretilemez')
it('silinmiş davetlinin token\'ı çözülemez')
it('composite FK yanlış wedding_id reddeder')
it('CASCADE: düğün silinince davetli + davetiye gider')
it('CASCADE: davetli silinince davetiye gider')
it('limit sayımı silinmişleri saymaz')
```

- [x] **Step 3: Negatif kontrol** — üyelik join'ini kaldır, IDOR testinin kırıldığını doğrula, geri koy. Aşama 3'te olduğu gibi **doğru segmenti** hedefle.

- [x] **Step 4: Commit**

```bash
git commit -m "feat(guests): add drizzle store with tenant isolation"
```

---

## Task 10: Migration + limit doğrulama betiği

**Files:**
- Modify: `backend/scripts/verify-migrations.mjs`
- Test: `backend/tests/db/migrate-guests.test.ts`

- [x] **Step 1: Doğrulama grupları**

`guests` / `guest_invitations` için: tablo var, composite FK var, `token_hash` UNIQUE, CASCADE çalışıyor, `guests.id,wedding_id` UNIQUE.

- [x] **Step 2: `npm run verify:migrations` yeşil**

- [x] **Step 3: Commit**

```bash
git commit -m "test(db): verify guest schema constraints"
```

---

## Task 11: Aşama 4 kapanış kontrolü

**Files:**
- Create: `docs/STAGE-4-COMPLETE.md`

- [x] **Step 1: Kabul listesi**

- [x] Ücretsiz limit **30 davetli**, premium sınırsız
- [x] Limit yarış koşulunda aşılamaz (transaction + `FOR UPDATE`)
- [x] Ham token DB'de yok, yalnızca SHA-256 hash
- [x] Token ≥128 bit entropi
- [x] `GET` yan etki yaratmaz (RSVP değişmez)
- [x] RSVP idempotent (aynı yanıt kopya oluşturmaz)
- [x] İzin verilen kişi sayısı aşılamaz (422)
- [x] `allowed_party_size` ≠ `confirmed_party_size` ayrı alanlar
- [x] `rsvp_source` GUEST/COUPLE ayrımı saklanır
- [x] `rsvp_deadline` sonrası davetli 410, çift yazabilir
- [x] Silinen davetlinin token'ı 404
- [x] Davetliye dönen gövde beyaz liste (telefon/wedding_id yok)
- [x] Composite FK yanlış `wedding_id`'yi reddeder
- [x] Tüm testler geçiyor
- [x] Typecheck temiz

- [x] **Step 2: SECURITY.md §10.2'yi güncelle** — 6 açık soru artık kapandı, kararlar tablosu ekle.

- [x] **Step 3: Commit**

```bash
git commit -m "docs: stage 4 completion record"
```

---

## Sonraki Plan

**Aşama 5 — Yardımcı ve görevler** (`stage-5-tasks.md`): yardımcı token'ı, görev ataması, görev sohbeti, sayfalama.

**Aşama 2.5 — Satın alma** Aşama 5'ten sonra: limitler (30 davetli / 1 yardımcı / 1 görev) artık üç yerde de uygulanmış olacak.

---

## Notlar

**Neden limit `guest` kaydına, kişi sayısına değil?**
Bir davetli "4 kişilik aile" olabilir. Kişi sayısına göre saysaydık 30 kişilik bir düğünde 8 kayıt limiti doldururdu ve ürün işe yaramazdı. Kayıt başına saymak, "30 aile davet edebilirsin" demek — gerçek kullanım.

**Neden 30, neden 10 değil?**
10 limiti kullanıcıyı değeri tatmadan duvara çarptırıyordu; tipik Türk düğünü 150-400 kişi, yani 10 kayıt listenin %5'i bile değil. 30 kayıt gerçek bir listenin anlamlı bir bölümünü kurmaya yetiyor, ürünün çalıştığını kanıtlıyor ve sonra duvara çarpıyor. Bedeli: duvar daha geç gelir, yani satın alma kararı da daha geç verilir.

**Neden RSVP'de `GET` yasak?**
WhatsApp link gönderildiğinde önizleme botu linki `GET` ile çeker. Eğer `GET` RSVP yazsaydı, davetli hiçbir şeye tıklamadan "geliyorum" olarak işaretlenirdi. Bu sessiz ve fark edilmesi zor bir veri bozulmasıdır.

**Neden `rsvp_source`?**
Çift, telefonla gelen yanıtı uygulamaya girer. Davetlinin kendi beyanıyla çiftin girdiği yanıt karışırsa, "davetli ne dedi" sorusu cevapsız kalır. Kaynak ayrımı denetim izi sağlar.

**Neden davetiye TTL 90 gün?**
Düğün tarihine kadar geçerli olmalı. 90 gün tipik planlama penceresini kapsar. Süre bitince çift yeni token üretir — eski link ölür.
