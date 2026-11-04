# Davetli Ayarları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Davetli sayfasına ayarlar düğmesi eklemek ve arkasında davetiye görünümü, kişi sayısı özelliği aç/kapa, varsayılan ve azami kişi sayısını yöneten tek bir sayfa açmak.

**Architecture:** Üç sütun `weddings` tablosuna eklenir (`party_size_enabled`, `default_party_size`, `max_party_size`); varsayılanları bugünkü davranışı birebir korur. Davetlinin etkin azamisi sunucuda `min(davetlinin izni, düğünün max)` olarak türetilir ve `PUBLIC_FIELDS` içinde `allowedPartySize` olarak döner — istemci iki değeri birleştirmez. Mobil tarafta yeni `Screen.GUEST_SETTINGS` ekranı yerel durum tutar ve tek `PATCH` ile kaydeder.

**Tech Stack:** TypeScript + Express + Drizzle ORM + Zod + PGlite (backend); Kotlin Multiplatform + Compose (mobil); vanilla HTML/JS (davetiye sayfası); Vitest, kotlin.test, Node kontrol scriptleri.

**Spec:** `docs/superpowers/specs/2026-11-05-davetli-ayarlari-design.md`

## Global Constraints

- `PUBLIC_FIELDS` tam beyaz listedir — `...row` ASLA kullanılmaz; `backend/tests/guests/public-view.test.ts` tam anahtar kümesini doğrular.
- Davetiye sayfası (`frontend/public/d/index.html`) yüklenirken **asla POST atmaz** (WhatsApp önizleme botu).
- Davetiye token'ı `#fragment`'te kalır; Open Graph etiketi eklenmez.
- Migration elle yazılır ve `IF NOT EXISTS` kullanır (`0007` deseni); `meta/_journal.json` güncellenir.
- Backend deploy **manuel**: `gh workflow run deploy-backend.yml -f confirm=deploy`.
- `android.builtInKotlin=false` ve `android.newDsl=false` `mobile/gradle.properties` içinde **load-bearing** — dokunulmaz.
- Yerel makinede Android SDK yok ve Linux'ta iOS testleri **SKIPPED** olur (yanlış yeşil): mobil doğrulama yalnız `:composeApp:compileCommonMainKotlinMetadata` + `:composeApp:compileTestKotlinIosSimulatorArm64`. Gerçek test koşumu yalnız CI'da (`mobile-ci` → `:composeApp:allTests`, macOS runner).
- `JAVA_HOME=/tmp/jdk/jdk-21.0.13+9`, `PATH=$JAVA_HOME/bin:$PATH`.
- Tasarım değerleri merkezi tokenlardan (`Spacing`, `Radius`, `DugunceTheme.colors`); ham renk/ölçü yazılmaz.
- Durum yalnız renkle anlatılmaz; metin veya ikon eşlik eder.
- `onClick = { }` boş lambda yasak — `scripts/check-dead-buttons.mjs` yakalar; devre dışı için `enabled = false`.
- Türkçe kullanıcı metni; commit mesajları Türkçe, `fix:`/`feat:` öneki.
- Kişi sayısı aralığı: `1 ≤ defaultPartySize ≤ maxPartySize ≤ 10`.

## Review Focus

- **Özellik kapalıyken "Geliyorum"a basmak.** `rsvp.ts` bugün ATTENDING için `partySize`'ı zorunlu tutuyor ve `> allowedPartySize` reddediyor. Özellik kapalıyken davetiye `partySize` göndermeyecek; bunun 422 değil başarılı olması gerekir. Test: Task 4.
- **Azami düşürüldüğünde eski geniş izinli davetiyeler.** 10 kişi izinli davetli, çift azamiyi 4'e indirince 4 görmeli. Test: Task 2.
- **Kaydedilmemiş değişiklikle geri tuşu.** Kullanıcı ayarı değiştirip geri basınca sessizce kaybolmamalı. Test: Task 8.
- **`default > max` gönderen kıvrımlı istemci.** API doğrudan çağrılabilir; sunucu 400 dönmeli, veritabanına tutarsız değer yazılmamalı. Test: Task 1.
- **Özellik kapalıyken davetli detayındaki kişi sayısı bloğu.** Blok gizlenince `createInvitation` yine de geçerli bir değer göndermeli; `undefined` gidip backend varsayılanına düşmemeli. Test: Task 7.

---

## File Structure

**Backend**
- `src/db/schema.ts` — `weddings` tablosuna 3 sütun (mevcut dosya, 3 satır eklenir)
- `src/db/migrations/0008_party_size_settings.sql` — yeni
- `src/db/migrations/meta/_journal.json` — `idx: 8` kaydı
- `src/weddings/service.ts` — şema alanları + çapraz doğrulama
- `src/weddings/store.ts` — `select` listelerine 3 alan
- `src/guests/invitation.ts` — `InvitationRow.wedding` genişler, `effectiveMax` yardımcısı
- `src/guests/store.ts` — `findByTokenHash` join'ine 3 alan
- `src/guests/public-view.ts` — beyaz liste + etkin değer
- `src/guests/rsvp.ts` — özellik kapalıyken `partySize` yok sayılır

**Mobil**
- `ui/nav/Screen.kt` — `GUEST_SETTINGS`
- `App.kt` — yeni dal, `GuestListScreen`/`GuestDetailScreen` parametreleri
- `ui/screens/GuestScreens.kt` — başlıkta ayarlar ikonu, görünüm kartı kalkar
- `ui/screens/GuestSettingsScreen.kt` — yeni
- `ui/screens/GuestDetailScreen.kt` — aralık düğünden
- `ui/components/Structure.kt` — `TopBar.actionEnabled`
- `data/Models.kt` — DTO alanları

**Frontend**
- `public/d/index.html` — koşullu stepper
- `scripts/check-frontend.mjs` — regresyon kontrolü

---

### Task 1: Düğün kişi sayısı ayarları — şema, migration, doğrulama

**Files:**
- Modify: `backend/src/db/schema.ts:112-122` (template/fontKey bloğunun hemen altı)
- Create: `backend/src/db/migrations/0008_party_size_settings.sql`
- Modify: `backend/src/db/migrations/meta/_journal.json`
- Modify: `backend/src/weddings/service.ts:14-77` (`weddingInputSchema`), `:180-215` (`updateWedding`)
- Modify: `backend/src/weddings/store.ts:44-70` (`listByUser` select), `:78-112` (`findById` select)
- Test: `backend/tests/weddings/party-settings.test.ts`

**Interfaces:**
- Consumes: yok (ilk görev).
- Produces: `weddingInputSchema` içinde `partySizeEnabled: boolean`, `defaultPartySize: number` (1..10), `maxPartySize: number` (1..10); `AppError.badRequest(..., 'PARTY_SIZE_INCONSISTENT')`; DB sütunları `party_size_enabled`, `default_party_size`, `max_party_size`.

- [ ] **Step 1: Write the failing test**

`backend/tests/weddings/party-settings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { updateWedding, weddingInputSchema } from '../../src/weddings/service.js'

function makeDeps(existing: Record<string, unknown> = {}) {
  const record = {
    id: 'w1', coupleNames: 'A & B', weddingDate: new Date('2026-09-12T19:00:00Z'),
    partySizeEnabled: true, defaultPartySize: 2, maxPartySize: 10,
    ...existing,
  }
  return {
    findById: vi.fn().mockResolvedValue(record),
    updateWedding: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ ...record, ...patch })),
  } as any
}

describe('kisi sayisi ayarlari — dogrulama', () => {
  it('uc alan birlikte kaydedilir', async () => {
    const d = makeDeps()
    await updateWedding(
      { weddingId: 'w1', userId: 'u1', patch: { partySizeEnabled: false, defaultPartySize: 3, maxPartySize: 6 } },
      d,
    )
    expect(d.updateWedding).toHaveBeenCalledWith('w1', expect.objectContaining({
      partySizeEnabled: false, defaultPartySize: 3, maxPartySize: 6,
    }))
  })

  it('varsayilan azamiyi gecerse 400 PARTY_SIZE_INCONSISTENT', async () => {
    const d = makeDeps({ defaultPartySize: 2, maxPartySize: 10 })
    await expect(
      updateWedding({ weddingId: 'w1', userId: 'u1', patch: { defaultPartySize: 8, maxPartySize: 4 } }, d),
    ).rejects.toMatchObject({ code: 'PARTY_SIZE_INCONSISTENT' })
    expect(d.updateWedding).not.toHaveBeenCalled()
  })

  it('yalniz max dusurulurse mevcut default ile karsilastirilir', async () => {
    const d = makeDeps({ defaultPartySize: 5, maxPartySize: 10 })
    await expect(
      updateWedding({ weddingId: 'w1', userId: 'u1', patch: { maxPartySize: 3 } }, d),
    ).rejects.toMatchObject({ code: 'PARTY_SIZE_INCONSISTENT' })
  })

  it('0 ve 11 reddedilir', () => {
    expect(() => weddingInputSchema.parse({ coupleNames: 'A', weddingDate: '2026-09-12', defaultPartySize: 0 })).toThrow()
    expect(() => weddingInputSchema.parse({ coupleNames: 'A', weddingDate: '2026-09-12', maxPartySize: 11 })).toThrow()
  })

  it('1 ve 10 sinirlari kabul edilir', () => {
    const r = weddingInputSchema.parse({ coupleNames: 'A', weddingDate: '2026-09-12', defaultPartySize: 1, maxPartySize: 10 })
    expect(r.defaultPartySize).toBe(1)
    expect(r.maxPartySize).toBe(10)
  })

  it('kesirli sayi reddedilir', () => {
    expect(() => weddingInputSchema.parse({ coupleNames: 'A', weddingDate: '2026-09-12', defaultPartySize: 2.5 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/weddings/party-settings.test.ts`
Expected: FAIL — `partySizeEnabled` şemada yok, alanlar sessizce atılıyor; `PARTY_SIZE_INCONSISTENT` hiç fırlatılmıyor.

- [ ] **Step 3: Add DB columns and migration**

`backend/src/db/schema.ts` — `fontKey` satırının hemen altına:

```ts
    /**
     * Davetliye "kaç kişi geleceksiniz" sorusu sorulsun mu.
     *
     * Kapalıyken davetiye yalnız "Geliyorum"/"Gelemeyeceğim" gösterir ve
     * `rsvp.ts` kişi sayısını yok sayar. Varsayılan `true` — mevcut
     * davranış korunur.
     */
    partySizeEnabled: boolean('party_size_enabled').notNull().default(true),
    /** Yeni davetiyenin başlangıç izni (davetli + refakatçi). */
    defaultPartySize: integer('default_party_size').notNull().default(2),
    /** Çiftin izin verdiği üst sınır — davetlinin iznini de sınırlar. */
    maxPartySize: integer('max_party_size').notNull().default(10),
```

`boolean` ve `integer` importlarını `drizzle-orm/pg-core`'dan ekle (dosyada `integer` zaten varsa yalnız `boolean`).

`backend/src/db/migrations/0008_party_size_settings.sql`:

```sql
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "party_size_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "default_party_size" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "max_party_size" integer DEFAULT 10 NOT NULL;
```

`backend/src/db/migrations/meta/_journal.json` — `entries` dizisinin sonuna:

```json
    {
      "idx": 8,
      "version": "7",
      "when": 1793800000000,
      "tag": "0008_party_size_settings",
      "breakpoints": true
    }
```

Ayrıca `meta/0008_snapshot.json` gerekli. `drizzle-kit generate` **çalıştırma** — şema dosyası zaten değiştiği için mevcut migration'larla çakışan yeni bir dosya üretir. Bunun yerine `0007_snapshot.json`'ı kopyala ve `weddings` tablosunun `columns` bloğuna üç alanı ekle:

```json
      "party_size_enabled": { "name": "party_size_enabled", "type": "boolean", "primaryKey": false, "notNull": true, "default": true },
      "default_party_size": { "name": "default_party_size", "type": "integer", "primaryKey": false, "notNull": true, "default": 2 },
      "max_party_size": { "name": "max_party_size", "type": "integer", "primaryKey": false, "notNull": true, "default": 10 }
```

Snapshot'ın çalışma zamanında okunmadığı doğrulandı (`migrate-cli.ts` yalnız `.sql` dosyalarını okur); yine de tutarlılık için güncellenir.

- [ ] **Step 4: Add schema fields and cross-field validation**

`backend/src/weddings/service.ts` — `weddingInputSchema` içine `fontKey` bloğunun altına:

```ts
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
```

`updateWedding` içinde, `const existing = await deps.findById(...)` ve `if (!existing) return null` satırlarından **sonra**, tarih normalizasyonundan **önce**:

```ts
  // Çapraz kural: varsayılan azamiyi geçemez.
  //
  // Şemada doğrulanamaz çünkü PATCH kısmi — yalnız `maxPartySize`
  // gönderildiğinde `defaultPartySize` şemada yoktur. Birleşik sonuç
  // üzerinden kontrol edilir. İstemciye güvenmek `allowed_party_size`
  // hatasının tekrarı olurdu.
  const nextDefault = (patch.defaultPartySize ?? existing['defaultPartySize']) as number
  const nextMax = (patch.maxPartySize ?? existing['maxPartySize']) as number
  if (typeof nextDefault === 'number' && typeof nextMax === 'number' && nextDefault > nextMax) {
    throw AppError.badRequest(
      'Varsayılan kişi sayısı azamiyi geçemez',
      'PARTY_SIZE_INCONSISTENT',
    )
  }
```

`store.ts` — `listByUser` ve `findById` select bloklarında `fontKey: weddings.fontKey,` satırının altına:

```ts
          partySizeEnabled: weddings.partySizeEnabled,
          defaultPartySize: weddings.defaultPartySize,
          maxPartySize: weddings.maxPartySize,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/weddings/party-settings.test.ts`
Expected: PASS (6 test).

- [ ] **Step 6: Verify migration applies cleanly**

Run: `cd backend && node scripts/verify-migrations.mjs`
Expected: `0008_party_size_settings.sql` ✅ — hata yok.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: tüm testler PASS (964 + 6 yeni).

- [ ] **Step 8: Commit**

```bash
git add backend/src/db backend/src/weddings backend/tests/weddings/party-settings.test.ts
git commit -m "feat: dugun kisi sayisi ayarlari — sema, migration, dogrulama"
```

---

### Task 2: Etkin azami türetmesi ve beyaz liste

**Files:**
- Modify: `backend/src/guests/invitation.ts:60-83` (`InvitationRow.wedding`)
- Modify: `backend/src/guests/store.ts:334-375` (`findByTokenHash` join)
- Modify: `backend/src/guests/public-view.ts:19-36` (`PUBLIC_FIELDS`), `:46-66` (interface), `:104-113` (return)
- Test: `backend/tests/guests/public-view.test.ts` (ek testler)

**Interfaces:**
- Consumes: Task 1'in DB sütunları.
- Produces: `InvitationRow.wedding` içinde `partySizeEnabled?: boolean | null`, `defaultPartySize?: number | null`, `maxPartySize?: number | null`; `effectiveAllowedPartySize(row: InvitationRow): number` (invitation.ts'ten export); `PublicInvitation` içinde `partySizeEnabled: boolean`, `defaultPartySize: number`, `maxPartySize: number`; `PUBLIC_FIELDS` 19 elemana çıkar.

- [ ] **Step 1: Write the failing test**

`backend/tests/guests/public-view.test.ts` — dosya sonuna yeni `describe` ekle. `makeRow`'un `wedding` bloğuna `partySizeEnabled: true, defaultPartySize: 2, maxPartySize: 10,` ekle.

```ts
describe('kisi sayisi — etkin azami', () => {
  it('uc ayar alani beyaz listede doner', () => {
    const v = toPublicInvitation(makeRow() as never)!
    expect(v.partySizeEnabled).toBe(true)
    expect(v.defaultPartySize).toBe(2)
    expect(v.maxPartySize).toBe(10)
  })

  it('davetlinin izni dugunun azamisini asamaz', () => {
    const row = makeRow({ allowedPartySize: 10 })
    ;(row.wedding as any).maxPartySize = 4
    const v = toPublicInvitation(row as never)!
    expect(v.allowedPartySize).toBe(4)
  })

  it('davetlinin izni azamiden kucukse korunur', () => {
    const row = makeRow({ allowedPartySize: 2 })
    ;(row.wedding as any).maxPartySize = 10
    const v = toPublicInvitation(row as never)!
    expect(v.allowedPartySize).toBe(2)
  })

  it('eski dugun satirinda alanlar yoksa varsayilanlar kullanilir', () => {
    const row = makeRow()
    delete (row.wedding as any).partySizeEnabled
    delete (row.wedding as any).defaultPartySize
    delete (row.wedding as any).maxPartySize
    const v = toPublicInvitation(row as never)!
    expect(v.partySizeEnabled).toBe(true)
    expect(v.defaultPartySize).toBe(2)
    expect(v.maxPartySize).toBe(10)
  })

  it('PUBLIC_FIELDS tam kumeyi listeler', () => {
    expect([...PUBLIC_FIELDS].sort()).toEqual([
      'allowedPartySize', 'confirmedPartySize', 'coupleNames', 'defaultPartySize',
      'fontKey', 'giftNote', 'guestName', 'isOpen', 'mapUrl', 'maxPartySize',
      'partySizeEnabled', 'program', 'rsvp', 'rsvpDeadline', 'template',
      'timezone', 'venueAddress', 'venueName', 'weddingDate',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/guests/public-view.test.ts`
Expected: FAIL — `partySizeEnabled` undefined, `PUBLIC_FIELDS` 16 eleman.

- [ ] **Step 3: Extend `InvitationRow` and add `effectiveAllowedPartySize`**

`backend/src/guests/invitation.ts` — `wedding` tipine `fontKey` satırının altına:

```ts
    /** Kişi sayısı özelliği açık mı. */
    partySizeEnabled?: boolean | null
    /** Yeni davetiyenin başlangıç izni. */
    defaultPartySize?: number | null
    /** Çiftin izin verdiği üst sınır. */
    maxPartySize?: number | null
```

Dosya sonuna:

```ts
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
```

- [ ] **Step 4: Extend the store join**

`backend/src/guests/store.ts` — `findByTokenHash` select'inde `wedding` bloğunda `fontKey: weddings.fontKey,` altına:

```ts
            partySizeEnabled: weddings.partySizeEnabled,
            defaultPartySize: weddings.defaultPartySize,
            maxPartySize: weddings.maxPartySize,
```

- [ ] **Step 5: Extend `PUBLIC_FIELDS` and `toPublicInvitation`**

`backend/src/guests/public-view.ts`:

`PUBLIC_FIELDS` dizisinde `'allowedPartySize',` satırının **üstüne**:

```ts
  'partySizeEnabled',
  'defaultPartySize',
  'maxPartySize',
```

`PublicInvitation` interface'inde `allowedPartySize: number` üstüne:

```ts
  /** Davetliye "kaç kişi" sorusu sorulsun mu. */
  partySizeEnabled: boolean
  /** Yeni davetiyenin başlangıç izni. */
  defaultPartySize: number
  /** Çiftin izin verdiği üst sınır. */
  maxPartySize: number
```

`toPublicInvitation` return'ünde `allowedPartySize: row.allowedPartySize,` satırını **değiştir**:

```ts
    partySizeEnabled: w.partySizeEnabled ?? true,
    defaultPartySize: w.defaultPartySize ?? DEFAULT_PARTY_SIZE,
    maxPartySize: w.maxPartySize ?? MAX_PARTY_SIZE,
    allowedPartySize: effectiveAllowedPartySize(row),
```

Import satırını güncelle:

```ts
import { effectiveAllowedPartySize, MAX_PARTY_SIZE, MIN_PARTY_SIZE, DEFAULT_PARTY_SIZE, type InvitationRow } from './invitation.js'
```

(`MIN_PARTY_SIZE` kullanılmıyorsa importtan çıkar — `tsc` unused import hatası vermez ama temiz tut.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/guests/public-view.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS — `public-view.test.ts`'teki mevcut "tam anahtar kümesi" testi de yeni alanlarla güncellendiği için yeşil.

- [ ] **Step 8: Commit**

```bash
git add backend/src/guests backend/tests/guests/public-view.test.ts
git commit -m "feat: davetli icin etkin azami kisi sayisi — min(davetli, dugun)"
```

---

### Task 3: Özellik kapalıyken RSVP'nin çalışması

**Files:**
- Modify: `backend/src/guests/rsvp.ts:126-152` (`resolvePartySize`)
- Test: `backend/tests/guests/rsvp.test.ts` (ek testler)

**Interfaces:**
- Consumes: Task 2'nin `InvitationRow.wedding.partySizeEnabled` alanı.
- Produces: `resolvePartySize` imzası değişmez (`(params: SubmitRsvpParams, invitation: InvitationRow) => number`); davranışı değişir.

- [ ] **Step 1: Write the failing test**

`backend/tests/guests/rsvp.test.ts` — dosya sonuna ekle (mevcut `makeRow`/`makeDeps` yardımcılarını kullan; `wedding` bloğuna `partySizeEnabled` eklenebiliyorsa ekle):

```ts
describe('kisi sayisi ozelligi kapali', () => {
  it('partySize gonderilmese de ATTENDING kabul edilir', async () => {
    const d = makeDeps()
    const row = makeRow({ allowedPartySize: 4 })
    ;(row.wedding as any).partySizeEnabled = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING' }, d)
    expect(r!.confirmedPartySize).toBe(1)
  })

  it('gonderilen partySize yok sayilir, 1 yazilir', async () => {
    const d = makeDeps()
    const row = makeRow({ allowedPartySize: 4 })
    ;(row.wedding as any).partySizeEnabled = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING', partySize: 4 }, d)
    expect(r!.confirmedPartySize).toBe(1)
  })

  it('ozellik acikken partySize zorunlu kalir', async () => {
    const d = makeDeps()
    const row = makeRow({ allowedPartySize: 4 })
    ;(row.wedding as any).partySizeEnabled = true
    d.findByTokenHash.mockResolvedValue(row)

    await expect(submitRsvp({ rawToken: 'tok', rsvp: 'ATTENDING' }, d)).rejects.toThrow(
      'Katılım için kişi sayısı gerekli',
    )
  })

  it('DECLINED her iki durumda da 0 yazar', async () => {
    const d = makeDeps()
    const row = makeRow({ allowedPartySize: 4 })
    ;(row.wedding as any).partySizeEnabled = false
    d.findByTokenHash.mockResolvedValue(row)

    const r = await submitRsvp({ rawToken: 'tok', rsvp: 'DECLINED' }, d)
    expect(r!.confirmedPartySize).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/guests/rsvp.test.ts`
Expected: FAIL — "Katılım için kişi sayısı gerekli" fırlatılıyor; `partySize: 4` yok sayılmıyor.

- [ ] **Step 3: Implement the guard**

`backend/src/guests/rsvp.ts` — `resolvePartySize` gövdesinde `if (params.rsvp === 'DECLINED') return 0` satırının **hemen altına**:

```ts
  // Özellik kapalıyken davetiye kişi sayısı SORMAZ ve göndermez.
  // Burada `partySize`'ı yok sayıp 1 yazıyoruz: aksi hâlde
  // "Katılım için kişi sayısı gerekli" 422'si döner ve davetli
  // "Geliyorum"a basamaz — özelliği kapatan çift, davetlilerin
  // katılım bildirmesini engellemiş olur.
  if (invitation.wedding.partySizeEnabled === false) return 1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/guests/rsvp.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/guests/rsvp.ts backend/tests/guests/rsvp.test.ts
git commit -m "fix: kisi sayisi ozelligi kapaliyken Geliyorum 422 vermesin"
```

---

### Task 4: Uçtan uca HTTP testi

**Files:**
- Test: `backend/tests/e2e/wedding-party-settings.test.ts`

**Interfaces:**
- Consumes: Task 1 (PATCH alanları), Task 2 (`GET /invitations/:token` beyaz listesi), Task 3 (RSVP davranışı).
- Produces: yalnız test.

- [ ] **Step 1: Write the failing test**

`backend/tests/e2e/wedding-party-settings.test.ts` — `tests/e2e/weddings-patch.test.ts` kurulumunu birebir kopyala (PGlite, migration döngüsü, `createApp`, `signAccessToken`), şu testlerle:

```ts
describe('PATCH /weddings/:id — kisi sayisi ayarlari', () => {
  it('uc alan kaydedilir ve GET yanitinda gorunur', async () => {
    const res = await request(app)
      .patch(`/api/v1/weddings/${weddingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partySizeEnabled: false, defaultPartySize: 3, maxPartySize: 6 })
    expect(res.status).toBe(200)
    expect(res.body.wedding).toMatchObject({
      partySizeEnabled: false, defaultPartySize: 3, maxPartySize: 6,
    })

    const list = await request(app)
      .get('/api/v1/weddings')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.weddings[0]).toMatchObject({
      partySizeEnabled: false, defaultPartySize: 3, maxPartySize: 6,
    })
  })

  it('tutarsiz deger 400 doner ve DB degismez', async () => {
    await request(app).patch(`/api/v1/weddings/${weddingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultPartySize: 2, maxPartySize: 10 })

    const bad = await request(app).patch(`/api/v1/weddings/${weddingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultPartySize: 8, maxPartySize: 4 })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('PARTY_SIZE_INCONSISTENT')

    const after = await request(app).get('/api/v1/weddings')
      .set('Authorization', `Bearer ${token}`)
    expect(after.body.weddings[0]).toMatchObject({ defaultPartySize: 2, maxPartySize: 10 })
  })

  it('davetiye yaniti ozellik kapaliyken stepper bilgisini dogru verir', async () => {
    await request(app).patch(`/api/v1/weddings/${weddingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partySizeEnabled: false, defaultPartySize: 2, maxPartySize: 10 })

    // Davetli + davetiye üret
    const g = await request(app).post(`/api/v1/weddings/${weddingId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ayşe', side: 'BRIDE' })
    const guestId = g.body.guest.id

    const inv = await request(app).post(`/api/v1/weddings/${weddingId}/guests/${guestId}/invitation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ allowedPartySize: 8 })
    const rawToken = inv.body.invitation.token

    const pub = await request(app).get(`/api/v1/invitations/${rawToken}`)
    expect(pub.status).toBe(200)
    expect(pub.body.invitation).toMatchObject({
      partySizeEnabled: false, defaultPartySize: 2, maxPartySize: 10,
      allowedPartySize: 8,
    })

    // Özellik kapalı: partySize göndermeden "Geliyorum" çalışmalı
    const rsvp = await request(app)
      .post(`/api/v1/invitations/${rawToken}/rsvp`)
      .send({ rsvp: 'ATTENDING' })
    expect(rsvp.status).toBe(200)
    expect(rsvp.body.invitation.confirmedPartySize).toBe(1)
  })

  it('azami dusurulunce eski genis izinli davetiye de iner', async () => {
    const g = await request(app).post(`/api/v1/weddings/${weddingId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mehmet', side: 'GROOM' })
    const inv = await request(app).post(`/api/v1/weddings/${weddingId}/guests/${g.body.guest.id}/invitation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ allowedPartySize: 10 })

    await request(app).patch(`/api/v1/weddings/${weddingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultPartySize: 2, maxPartySize: 4 })

    const pub = await request(app).get(`/api/v1/invitations/${inv.body.invitation.token}`)
    expect(pub.body.invitation.allowedPartySize).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/e2e/wedding-party-settings.test.ts`
Expected: FAIL — route henüz alanları kabul etmiyor / yanıt şekli farklı. (Task 1–3 bitmişse bazıları geçebilir; o zaman bu adımı "mevcut davranışı doğrula" olarak işaretle ve yalnız gerçekten eksik olan testi kırmızı gördüğünde ilerle.)

- [ ] **Step 3: Fix whatever the test exposes**

Beklenen eksik: `routes/weddings.ts` `PATCH` gövdesini doğrudan `updateWedding`'e geçiriyorsa ek iş yok. `AppError` kodu yanıtta `error.code` altında dönmüyorsa `backend/src/lib/errors.ts` mevcut desenini izle (diğer kodlar `error.code` kullanıyor).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/e2e/wedding-party-settings.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/e2e/wedding-party-settings.test.ts
git commit -m "test: kisi sayisi ayarlari uctan uca — PATCH, davetiye, RSVP"
```

---

### Task 5: Davetiye sayfası — koşullu stepper

**Files:**
- Modify: `frontend/public/d/index.html:441-449` (stepper markup), `:630-662` (`render` RSVP bloğu), `:710-716` (`sendRsvp`), `:786-816` (olaylar)
- Modify: `scripts/check-frontend.mjs` (yeni kontrol)

**Interfaces:**
- Consumes: Task 2'nin `partySizeEnabled` alanı (`GET /invitations/:token` yanıtında).
- Produces: yalnız davranış.

- [ ] **Step 1: Add the regression check to `scripts/check-frontend.mjs`**

`// 8. ...` başlığıyla yeni bölüm ekle (rapor bölümünden önce):

```js
// ---------------------------------------------------------------------------
// 8. Davetiye — kişi sayısı özelliği iki yerde de kontrol edilmeli
// ---------------------------------------------------------------------------

/**
 * `partySizeEnabled` yalnız `render()` içinde kontrol edilirse stepper
 * gizlenir ama `sendRsvp` yine `partySize` gönderir → backend 422 →
 * davetli "Geliyorum"a basamaz. İki kullanım da zorunlu.
 */
{
  const invitePath = join(PUBLIC, 'd/index.html')
  if (existsSync(invitePath)) {
    const src = readFileSync(invitePath, 'utf8')
    const count = (src.match(/partySizeEnabled/g) || []).length
    if (count < 2) {
      fail('frontend/public/d/index.html', 0,
        `partySizeEnabled yalnız ${count} kez geçiyor — hem render() hem sendRsvp() içinde kontrol edilmeli`)
    }
  }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-frontend.mjs`
Expected: FAIL — `partySizeEnabled yalnız 0 kez geçiyor`.

- [ ] **Step 3: Guard the stepper in `render()`**

`render()` içinde, `const max = Math.max(1, data.allowedPartySize || 1)` satırını **değiştir**:

```js
    // Özellik kapalıyken davetiye kişi sayısı SORMAZ: stepper hiç
    // görünmez ve "Geliyorum" tek kişi olarak bildirilir.
    const max = Math.max(1, data.allowedPartySize || 1)
    state.size = Math.min(Math.max(1, state.size), max)
    $('sizeLabel').textContent = 'Kaç kişi geleceksiniz?'
    if (data.partySizeEnabled === false) {
      $('sizeBox').hidden = true
      state.size = 1
    } else {
      $('sizeBox').hidden = false
      updateStepper(max)
    }
```

`paintChoice()` içindeki `$('sizeBox').classList.toggle('show', ...)` satırını **değiştir**:

```js
  // `hidden` özelliği kapatma kararı `render()`'da verilir; burada yalnız
  // "Geliyorum" seçiliyken görünürlüğünü yönetiyoruz.
  $('sizeBox').classList.toggle('show', state.choice === 'ATTENDING')
```

CSS tarafında ek iş **yok**: `d/index.html:354` zaten `[hidden]{display:none !important}` içeriyor — `hidden` attribute'u `.size.show{display:block}` tarafından ezilmez. Doğrulandı.

- [ ] **Step 4: Guard `sendRsvp`**

`sendRsvp` içinde:

```js
  const max = Math.max(1, state.data.allowedPartySize || 1)
  const payload = { rsvp }
  // Özellik kapalıyken `partySize` GÖNDERİLMEZ — backend kişi sayısını
  // yok sayar ve 1 yazar.
  if (rsvp === 'ATTENDING' && state.data.partySizeEnabled !== false) {
    payload.partySize = Math.min(state.size, max)
  }
```

- [ ] **Step 5: Guard the stepper event handlers**

`btnMinus` ve `btnPlus` dinleyicilerinin başına:

```js
  if (state.data?.partySizeEnabled === false) return
```

- [ ] **Step 6: Run the check to verify it passes**

Run: `node scripts/check-frontend.mjs`
Expected: PASS — `✅ Frontend kontrolleri temiz`.

- [ ] **Step 7: Verify in a real browser**

Backend'i PGlite ile ayağa kaldır (`backend/tests/e2e` kurulumundaki gibi bir `serve-*.mjs` betiği yaz veya mevcut desen), `d/index.html`'in yerel API'ye bakan bir kopyasını `sed` ile üret, `ego_navigate` ile aç:

1. `partySizeEnabled: false` olan davetiye → stepper **yok**, "Geliyorum" çalışıyor, pill "Geliyorum" yazıyor (kişi eki yok).
2. `partySizeEnabled: true`, `maxPartySize: 4` → stepper var, `+` 4'te duruyor.

Expected: iki senaryo da gözle doğrulanır. Ekran görüntüsü al.

- [ ] **Step 8: Commit**

```bash
git add frontend/public/d/index.html scripts/check-frontend.mjs
git commit -m "feat: davetiye — kisi sayisi ozelligi kapaliyken stepper gizlensin"
```

---

### Task 6: Mobil DTO ve TopBar aksiyon etkinliği

**Files:**
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/data/Models.kt:64-85` (`WeddingDto`), `:123-134` (`WeddingPatchRequest`)
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/components/Structure.kt:91-131` (`TopBar`)
- Test: `mobile/composeApp/src/commonTest/kotlin/com/dugunce/app/data/PartySizeSettingsTest.kt` (yeni)

**Interfaces:**
- Consumes: Task 1'in JSON alan adları (`partySizeEnabled`, `defaultPartySize`, `maxPartySize`).
- Produces: `WeddingDto.partySizeEnabled: Boolean = true`, `.defaultPartySize: Int = 2`, `.maxPartySize: Int = 10`; `WeddingPatchRequest.partySizeEnabled: Boolean? = null`, `.defaultPartySize: Int? = null`, `.maxPartySize: Int? = null`; `TopBar(..., actionEnabled: Boolean = true)`.

- [ ] **Step 1: Write the failing test**

`mobile/composeApp/src/commonTest/kotlin/com/dugunce/app/data/PartySizeSettingsTest.kt`:

```kotlin
package com.dugunce.app.data

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Kişi sayısı ayarları — DTO sözleşmesi.
 *
 * Eski backend (alanlar yok) ve yeni backend (alanlar var) ikisi de
 * çözülebilmeli; aksi hâlde migration deploy edilmeden çıkan mobil
 * sürüm çöker.
 */
class PartySizeSettingsTest {

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    @Test
    fun `yeni alanlar json'dan okunur`() {
        val src = """
            {"id":"w1","coupleNames":"A & B","partySizeEnabled":false,
             "defaultPartySize":3,"maxPartySize":6}
        """.trimIndent()
        val dto = json.decodeFromString<WeddingDto>(src)
        assertFalse(dto.partySizeEnabled)
        assertEquals(3, dto.defaultPartySize)
        assertEquals(6, dto.maxPartySize)
    }

    @Test
    fun `alanlar yoksa varsayilanlar kullanilir`() {
        val src = """{"id":"w1","coupleNames":"A & B"}"""
        val dto = json.decodeFromString<WeddingDto>(src)
        assertTrue(dto.partySizeEnabled)
        assertEquals(2, dto.defaultPartySize)
        assertEquals(10, dto.maxPartySize)
    }

    @Test
    fun `yama yalniz degisen alanlari tasir`() {
        val patch = WeddingPatchRequest(partySizeEnabled = false, defaultPartySize = 3, maxPartySize = 6)
        val out = json.encodeToString(WeddingPatchRequest.serializer(), patch)
        assertTrue(out.contains("\"partySizeEnabled\":false"))
        assertTrue(out.contains("\"defaultPartySize\":3"))
        assertTrue(out.contains("\"maxPartySize\":6"))
        assertFalse(out.contains("coupleNames"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd mobile && JAVA_HOME=/tmp/jdk/jdk-21.0.13+9 PATH=/tmp/jdk/jdk-21.0.13+9/bin:$PATH \
  ./gradlew :composeApp:compileTestKotlinIosSimulatorArm64 --no-daemon
```
Expected: FAIL — `partySizeEnabled` unresolved reference.
- [ ] **Step 3: Add the DTO fields**

`Models.kt` — `WeddingDto` içinde `fontKey` satırının altına:

```kotlin
    /** Davetliye "kaç kişi" sorusu sorulsun mu. */
    val partySizeEnabled: Boolean = true,
    /** Yeni davetiyenin başlangıç izni. */
    val defaultPartySize: Int = 2,
    /** Çiftin izin verdiği üst sınır. */
    val maxPartySize: Int = 10,
```

`WeddingPatchRequest` içinde `fontKey` satırının altına:

```kotlin
    val partySizeEnabled: Boolean? = null,
    val defaultPartySize: Int? = null,
    val maxPartySize: Int? = null,
```

- [ ] **Step 4: Add `actionEnabled` to `TopBar`**

`Structure.kt` — imzaya `actionLabel`'dan sonra:

```kotlin
    actionEnabled: Boolean = true,
```

Aksiyon bloğunu değiştir:

```kotlin
        if (actionLabel != null && onAction != null) {
            if (actionEnabled) {
                TextAction(actionLabel, onClick = onAction)
            } else {
                // Kaydet gibi "henüz yapılacak bir şey yok" aksiyonları
                // soluk gösterilir. `enabled = false` deseni: tıklanabilir
                // ama işlevsiz buton gösterme kuralı
                // (`check-dead-buttons.mjs`).
                Text(
                    actionLabel.uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.2.sp),
                    color = c.muted,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = Spacing.sm),
                )
            }
        } else {
```

`Structure.kt`'ye **iki import ekle** — dosyada şu an yok, doğrulandı:

```kotlin
import androidx.compose.ui.unit.sp
```

`FontWeight` zaten import edilmiş (satır 16). `sp` yok — eklenmezse derleme kırılır.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && JAVA_HOME=/tmp/jdk/jdk-21.0.13+9 PATH=/tmp/jdk/jdk-21.0.13+9/bin:$PATH ./gradlew :composeApp:compileTestKotlinIosSimulatorArm64 --no-daemon`
Expected: BUILD SUCCESSFUL — test kodu derleniyor.

**DİKKAT — yerelde test KOŞMAZ.** Bu makinede Android SDK yok ve Linux'ta `iosSimulatorArm64Test` **SKIPPED** oluyor (yanlış yeşil). Doğrulandı:

```
> Task :composeApp:linkDebugTestIosSimulatorArm64 SKIPPED
> Task :composeApp:iosSimulatorArm64Test SKIPPED
BUILD SUCCESSFUL
```

`:composeApp:allTests` ise `SDK location not found` ile **FAILED** oluyor. Yani yerelde yapabileceğin tek şey **derleme**. Testlerin gerçekten koştuğu tek yer CI (`mobile-ci` → `:composeApp:allTests` macOS runner'da + `summarize-test-results.mjs`). "Testler geçti" deme — "derlendi, testler CI'da" de.

- [ ] **Step 7: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/data/Models.kt \
        mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/components/Structure.kt \
        mobile/composeApp/src/commonTest/kotlin/com/dugunce/app/data/PartySizeSettingsTest.kt
git commit -m "feat(mobile): kisi sayisi ayarlari DTO + TopBar actionEnabled"
```

---

### Task 7: Davetli ayarları ekranı

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/screens/GuestSettingsScreen.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/nav/Screen.kt:44-46`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/App.kt:381-392` (`Screen.GUESTS`), `:565-575` (`Screen.TEMPLATE` yanına yeni dal)

**Interfaces:**
- Consumes: Task 6'nın `WeddingDto` alanları, `WeddingPatchRequest` alanları, `TopBar(actionEnabled=)`; `Repository.patchWedding(weddingId, body)` (mevcut).
- Produces: `Screen.GUEST_SETTINGS`; `GuestSettingsScreen(wedding: WeddingDto, repository: Repository, onBack: () -> Unit, onOpenTemplates: () -> Unit, onSaved: (WeddingDto) -> Unit)`; `GuestListScreen(..., onOpenSettings: () -> Unit = {})`.

- [ ] **Step 1: Add the screen enum value**

`Screen.kt` — `BULK_SEND` satırının altına:

```kotlin
    /** Davetli ayarları — davetiye görünümü + kişi sayısı. */
    GUEST_SETTINGS,
```

- [ ] **Step 2: Write `GuestSettingsScreen`**

`ui/screens/GuestSettingsScreen.kt` — iskelet:

```kotlin
@Composable
fun GuestSettingsScreen(
    wedding: WeddingDto,
    repository: Repository,
    onBack: () -> Unit,
    onOpenTemplates: () -> Unit,
    onSaved: (WeddingDto) -> Unit = {},
) {
    val c = DugunceTheme.colors
    val scope = rememberCoroutineScope()

    // Yerel taslak — Kaydet'e basılana kadar sunucuya gitmez.
    var enabled by remember(wedding.id) { mutableStateOf(wedding.partySizeEnabled) }
    var defaultSize by remember(wedding.id) {
        mutableStateOf(wedding.defaultPartySize.coerceIn(MIN_PARTY, MAX_PARTY))
    }
    var maxSize by remember(wedding.id) {
        mutableStateOf(wedding.maxPartySize.coerceIn(MIN_PARTY, MAX_PARTY))
    }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDiscard by remember { mutableStateOf(false) }

    val dirty = enabled != wedding.partySizeEnabled ||
        defaultSize != wedding.defaultPartySize ||
        maxSize != wedding.maxPartySize

    // Kaydedilmemiş değişiklikle çıkış — sessiz kayıp olmasın.
    PlatformBackHandler(enabled = dirty && !saving) { confirmDiscard = true }

    fun save(thenBack: Boolean) { /* adım 3 */ }
    ...
}
```

`MIN_PARTY = 1`, `MAX_PARTY = 10` dosya üstünde `private const val`.

- [ ] **Step 3: Implement `save`**

```kotlin
    fun save(thenBack: Boolean) {
        if (saving) return
        saving = true
        error = null
        scope.launch {
            // Azami düşürülürken varsayılan da aynı istekte iner — sunucu
            // `default > max` görüp 400 dönmesin.
            val safeDefault = minOf(defaultSize, maxSize)
            if (safeDefault != defaultSize) defaultSize = safeDefault

            repository.patchWedding(
                wedding.id,
                WeddingPatchRequest(
                    partySizeEnabled = enabled,
                    defaultPartySize = safeDefault,
                    maxPartySize = maxSize,
                ),
            ).fold(
                onSuccess = {
                    saving = false
                    onSaved(it)
                    if (thenBack) onBack()
                },
                onFailure = {
                    saving = false
                    error = it.message ?: "Ayarlar kaydedilemedi"
                },
            )
        }
    }
```

- [ ] **Step 4: Build the UI**

`Column` → `TopBar("Davetli ayarları", onBack = { if (dirty) confirmDiscard = true else onBack() }, actionLabel = "Kaydet", actionEnabled = dirty && !saving, onAction = { save(false) })` → `LazyColumn`:

1. `SectionHeader("Davetiye")` + `Surface(onClick = onOpenTemplates, ...)` kart: başlık "Davetiye görünümü", alt satır `"${templateLabel(wedding.template)} · ${fontLabel(normalizeFontKey(wedding.template, wedding.fontKey))}"`, sağda `Text("›")`. (Kart düzeni `GuestScreens.kt`'deki mevcut karttan **taşınır**.)
2. `SectionHeader("Kişi sayısı")` + `CheckRow(label = "Davetliye \"kaç kişi\" sorusu sorulsun", checked = enabled, onCheckedChange = { enabled = it }, description = "Kapalıyken davetiye yalnız \"Geliyorum\" / \"Gelemeyeceğim\" gösterir.")`.
3. `SizeStepper` yerel composable — `label`, `value`, `min`, `max`, `enabled`, `onChange`, `hint`. `DugunceButton("−", enabled = enabled && value > min)`, `Text("$value kişi")`, `DugunceButton("+", enabled = enabled && value < max)`. Soluk göstermek için `enabled=false` yeterli (kural: tıklanabilir ama işlevsiz gösterme).
4. Varsayılan stepper: `max = maxSize` (varsayılan azamiyi geçemez), `hint = "Yeni davetliler bu sayıyla başlar"`.
5. Azami stepper: `min = MIN_PARTY`, `max = MAX_PARTY`, `onChange = { maxSize = it; if (defaultSize > it) defaultSize = it }`, `hint = "Davetli en fazla bu kadar kişi getirebilir"`.
6. `error?.let { InfoBanner(it, isError = true, onDismiss = { error = null }) }`
7. Bilgi notu: `"Azamiyi düşürürsen daha önce geniş izin verdiğin davetliler de bu sınıra iner."` — `InfoBanner` (isError=false) veya `Text` + `c.muted`.
8. `Spacer(Modifier.height(Spacing.xxl))`

`confirmDiscard` dialog'u:

```kotlin
    if (confirmDiscard) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Kaydedilmemiş değişiklikler var") },
            text = { Text("Değişiklikleri kaydetmek ister misin?") },
            confirmButton = {
                // DİKKAT: `TextAction("Kaydet") { ... }` YAZMA. İkinci
                // parametre `Modifier`; trailing lambda yanlış yuvaya
                // bağlanır ve `check-compose-conventions.mjs` CI'da
                // yakalar.
                TextAction("Kaydet", onClick = {
                    confirmDiscard = false
                    save(thenBack = true)
                })
            },
            dismissButton = {
                TextAction("Vazgeç", onClick = {
                    confirmDiscard = false
                    onBack()
                })
            },
        )
    }
```

- [ ] **Step 5: Wire the guest list button and remove the old card**

`GuestScreens.kt`:
- İmzaya `onOpenSettings: () -> Unit = {}` ekle (mevcut `onOpenTemplates` parametresini **kaldır**).
- LazyColumn'daki "Davetiye görünümü" `item { Surface(...) }` bloğunu (satır ~230-262) **sil**.
- `TopBar` ekle. **Yapı önemli:** mevcut kod `Box(Modifier.fillMaxSize())` içinde `when { ... }` ve `Box` kapsamındaki `Modifier.align(Alignment.BottomEnd)` yüzen düğmeleri var. `TopBar`'ı `Box`'un *içine* koymak yanlış olur — düğmeler yine `Box` kapsamında kalmalı. Doğru sarmalama:

```kotlin
    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar(
            "Davetliler",
            actionLabel = "Ayarlar",
            onAction = onOpenSettings,
        )
        Box(Modifier.weight(1f)) {
            when {
                loading -> LoadingState(Modifier.fillMaxSize(), "Davetliler yükleniyor…")
                error != null -> ErrorState(...)
                else -> LazyColumn(...) { ... }
            }
            // yüzen düğmeler burada kalır (align Box kapsamı gerektirir)
            if (!loading && error == null && guests.isNotEmpty()) { Row(Modifier.align(Alignment.BottomEnd)...) { ... } }
        }
    }
```

`TopBar`'ın `actionLabel` + `onAction` ikilisi `TextAction`'ı çağırır; `TextAction` zaten `heightIn(min = Spacing.minTouchTarget)` sağlıyor, ek dokunma hedefi gerekmez.

- [ ] **Step 6: Wire navigation in `App.kt`**

`Screen.GUESTS` bloğunda `onOpenTemplates = { state.go(Screen.TEMPLATE) }` satırını `onOpenSettings = { state.go(Screen.GUEST_SETTINGS) }` ile değiştir.

`Screen.TEMPLATE` bloğunun **üstüne**:

```kotlin
                        Screen.GUEST_SETTINGS -> wedding?.let { w ->
                            GuestSettingsScreen(
                                wedding = w,
                                repository = repository,
                                onBack = { state.back() },
                                onOpenTemplates = { state.go(Screen.TEMPLATE) },
                                onSaved = { updated -> state.wedding = updated },
                            )
                        } ?: Unit
```

- [ ] **Step 7: Compile**

Run: `cd mobile && JAVA_HOME=/tmp/jdk/jdk-21.0.13+9 PATH=/tmp/jdk/jdk-21.0.13+9/bin:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --no-daemon`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Run the dead-button check**

Run: `node scripts/check-dead-buttons.mjs`
Expected: PASS — boş lambda yok.

- [ ] **Step 9: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/dugunce/app
git commit -m "feat(mobile): davetli ayarlari ekrani — gorunum, kisi sayisi, kaydet"
```

---

### Task 8: Davetli detayında aralık düğünden gelsin

**Files:**
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/screens/GuestDetailScreen.kt:58-88` (imza + state), `:290-350` (kişi sayısı bloğu)
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/App.kt:468-480` (`GuestDetailScreen` çağrısı)

**Interfaces:**
- Consumes: Task 6'nın `WeddingDto` alanları, Task 7'nin ekranı.
- Produces: `GuestDetailScreen(..., partySizeEnabled: Boolean = true, defaultPartySize: Int = 2, maxPartySize: Int = 10)`.

- [ ] **Step 1: Add parameters and derive state**

`GuestDetailScreen` imzasına (`onDeleted` altına):

```kotlin
    /** Düğünün kişi sayısı ayarları — aralık buradan gelir. */
    partySizeEnabled: Boolean = true,
    defaultPartySize: Int = 2,
    maxPartySize: Int = 10,
```

`var partySize by remember { mutableStateOf(2) }` satırını değiştir:

```kotlin
    // Aralık düğün ayarlarından: varsayılan değerle başla, düğünün
    // azamisini geçme. Sabit 2/10 yazmak ayarı yalan söyler hâle getirirdi.
    var partySize by remember(guestId, defaultPartySize, maxPartySize) {
        mutableStateOf(defaultPartySize.coerceIn(1, maxPartySize))
    }
```

- [ ] **Step 2: Guard the UI block**

`inviteUrl == null` bloğundaki kişi sayısı bölümünü (satır ~291-324, "En fazla kaç kişi gelebilir?" başlığından `Spacer(Modifier.height(Spacing.xs))` satırına kadar) şu koşula sar:

```kotlin
                                    if (partySizeEnabled) {
                                        Text(
                                            "En fazla kaç kişi gelebilir?",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = c.muted,
                                        )
                                        Row(...) {
                                            DugunceButton(
                                                label = "−",
                                                enabled = partySize > 1 && !generating,
                                                onClick = { if (partySize > 1) partySize-- },
                                            )
                                            Text("$partySize kişi", ...)
                                            DugunceButton(
                                                label = "+",
                                                enabled = partySize < maxPartySize && !generating,
                                                onClick = { if (partySize < maxPartySize) partySize++ },
                                            )
                                        }
                                        Spacer(Modifier.height(Spacing.xs))
                                    }
```

`createInvitation` çağrısını değiştir:

```kotlin
                                                repository.createInvitation(
                                                    weddingId,
                                                    guestId,
                                                    // Özellik kapalıyken 1 gönder: `null`
                                                    // göndermek backend varsayılanına (2)
                                                    // düşer ve özellik "kapalı" görünmez.
                                                    if (partySizeEnabled) partySize else 1,
                                                ).fold(
```

- [ ] **Step 3: Pass the wedding values at the call site**

`App.kt` — `GuestDetailScreen` çağrısına:

```kotlin
                                    partySizeEnabled = w.partySizeEnabled,
                                    defaultPartySize = w.defaultPartySize,
                                    maxPartySize = w.maxPartySize,
```

- [ ] **Step 4: Compile**

Run: `cd mobile && JAVA_HOME=/tmp/jdk/jdk-21.0.13+9 PATH=/tmp/jdk/jdk-21.0.13+9/bin:$PATH ./gradlew :composeApp:compileCommonMainKotlinMetadata --no-daemon`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Verify compilation**

Run: `cd mobile && JAVA_HOME=/tmp/jdk/jdk-21.0.13+9 PATH=/tmp/jdk/jdk-21.0.13+9/bin:$PATH ./gradlew :composeApp:compileTestKotlinIosSimulatorArm64 --no-daemon`
Expected: BUILD SUCCESSFUL.

(Yerelde test koşmaz — Task 6 Step 5'teki nota bak. Testler CI'da doğrulanacak.)

- [ ] **Step 6: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/dugunce/app
git commit -m "feat(mobile): davetli detayinda kisi sayisi araligi dugun ayarlarindan"
```

---

### Task 9: Deploy ve canlı doğrulama

**Files:** yok (operasyon).

- [ ] **Step 1: Push**

```bash
git push origin master
```

- [ ] **Step 2: Watch all three CI workflows**

Run: `gh run list --limit 5`
Expected: `frontend-ci`, `backend-ci`, `mobile-ci` üçü de tetiklenmiş. Bekle ve doğrula:

```bash
gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
```

Her biri için `gh run list --workflow=<ad>.yml --limit 1` ile **sonuç `success`** olduğunu teyit et. Yeşil olmadan ilerlemek yok.

- [ ] **Step 3: Deploy the backend (migration dahil)**

```bash
gh workflow run deploy-backend.yml -f confirm=deploy
```

Bekle, `success` doğrula. Migration `0008` bu adımda uygulanır.

- [ ] **Step 4: Verify production health and the new columns**

```bash
curl -s https://api.dugunce.com.tr/health
```

Expected: `{"status":"ok"}` benzeri sağlıklı yanıt.

Ardından üretimde bir düğünün `PATCH` ile ayar kaydettiğini doğrula (test hesabıyla) veya en azından deploy log'unda migration hatası olmadığını kontrol et:

```bash
gh run view $(gh run list --workflow=deploy-backend.yml --limit 1 --json databaseId -q '.[0].databaseId') --log | grep -i "0008\|migrat"
```

Expected: `0008_party_size_settings` uygulandı, hata yok.

- [ ] **Step 5: Note the frontend deploy**

Cloudflare Pages `frontend/**` değişikliğini otomatik yayınlar. `https://dugunce.com.tr/d/` sayfasının yeni sürümü servis ettiğini doğrula (sayfa kaynağında `partySizeEnabled` geçmeli):

```bash
curl -s https://dugunce.com.tr/d/ | grep -c partySizeEnabled
```

Expected: `≥ 2`.
