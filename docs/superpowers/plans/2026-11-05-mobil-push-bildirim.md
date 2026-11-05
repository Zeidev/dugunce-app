# Mobil push bildirimleri (Android) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çiftin Android telefonuna, düğünle ilgili bir olay olduğunda (RSVP yanıtı, görev ataması, görev mesajı, görev durumu) gerçek push bildirimi göndermek.

**Architecture:** Sunucu, FCM HTTP v1 protokolünü Node yerleşikleriyle konuşur (`node:crypto` ile RS256 JWT → OAuth2 token → `fetch`). Yeni backend bağımlılığı **sıfır** — serv00 paylaşımlı hosting'te `firebase-admin`'in grpc native ikilisi riskli olduğu için bu yol seçildi. Mobil tarafta `firebase-messaging` (FCM zorunlu, alternatifi yok) ve KMP `expect/actual` köprüsü kullanılır.

**Tech Stack:** Node 22 (Express 4, Drizzle ORM, zod), Kotlin 2.4.21 + KMP + Compose Multiplatform, `firebase-messaging`, Vitest / `node:test` / Kotlin `commonTest`.

**Spec:** `docs/superpowers/specs/2026-11-05-mobil-push-bildirim-design.md`

## Global Constraints

- **Kapsam Android-only.** `apns.ts` YOK, iOS'ta gerçek push YOK. iOS hedefleri derlemede kaldığı için `expect` başına `iosMain`'de **no-op `actual`** ZORUNLU (yoksa iOS derlemesi kırılır).
- **Paket adı:** `com.lumibyte.dugunce` — `google-services.json` içindeki `package_name` ile birebir aynı olmalı.
- **Firebase proje kimliği:** `dugunce-app` → FCM uç noktası `https://fcm.googleapis.com/v1/projects/dugunce-app/messages:send`.
- **Backend bağımlılık eklenmeyecek.** `package.json` dependencies listesi bu plan boyunca değişmez.
- **Bildirim gönderimi iş akışını BLOKLAMAZ:** `void notify(...)`, asla `await notify(...)` bir route/servis içinde.
- **Bildirim içeriğinde hassas veri YOK:** davetli adı, tutar, e-posta geçmez. Yalnız "Bir davetli yanıt verdi." gibi nötr metin.
- **Sessiz saat:** 22:00–09:00 `Europe/Istanbul`, düğün tarihinden önceki 7 gün HARİÇ.
- **`device_token` çıkışta silinir** (hem istemci `DELETE` hem `/auth/logout` sunucu tarafı).
- **Token/log güvenliği:** `FCM_SERVICE_ACCOUNT_BASE64` değeri log'a yazılmaz (mevcut `logger.ts` redact listesine eklenecek).
- **Türkçe:** kullanıcıya görünen tüm metinler ve kod yorumları Türkçe.
- **`as` / `any` YOK** backend'de (`check-admin.mjs` kuralı admin'e özgü ama backend deseni de aynı).

## Review Focus

Spec'in sessiz kaldığı ama gerçek kullanımda karşılaşılacak beş durum:

1. **`google-services.json` yokken derleme** — depoyu klonlayan herkes ve CI'da dosya yok. Gradle eklentisi koşulsuz uygulanırsa **her derleme kırılır**. (Task 6 testi)
2. **Aynı kullanıcının iki cihazı** — telefon + tablet. Tek `device_token` sütunu ikincisini ezer; ayrı tablo şart. (Task 2 testi)
3. **FCM 404 `UNREGISTERED` döndüğünde** — uygulama silinmiş/kaldırılmış token. Token **silinmeli**, yoksa her bildirimde boşa istek atılır. (Task 4 testi)
4. **Davetli RSVP'yi 23:00'te verdiğinde** — sessiz saat kuralı devreye girmeli, bildirim gönderilmemeli; ama düğün öncesi haftada gönderilmeli. (Task 3 testi)
5. **Servis hesabı anahtarı bozuk/eksikken sunucu açılışı** — sunucu **çökmemeli**, `PUSH_ENABLED=false` gibi davranıp uyarı loglamalı. (Task 4 testi)

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `backend/src/db/migrations/0011_push_notifications.sql` | `device_tokens` tablosu + `users` tercih sütunları |
| `backend/src/db/schema.ts` (değişiklik) | Drizzle tanımları |
| `backend/src/notifications/quiet-hours.ts` | Sessiz saat + düğün öncesi hafta mantığı (saf fonksiyon) |
| `backend/src/notifications/fcm.ts` | JWT imzalama + OAuth2 token + `messages:send` |
| `backend/src/notifications/store.ts` | `device_tokens` CRUD (Drizzle) |
| `backend/src/notifications/service.ts` | Olay → alıcı → gönderim orkestrasyonu |
| `backend/src/notifications/router.ts` | 4 HTTP ucu |
| `backend/src/config/env.ts` (değişiklik) | `FCM_SERVICE_ACCOUNT_BASE64`, `PUSH_ENABLED` |
| `backend/src/lib/logger.ts` (değişiklik) | redact listesine ekleme |
| `backend/src/app.ts` (değişiklik) | router kaydı |
| `backend/src/routes/admin.ts` benzeri — `/auth/logout` (değişiklik) | çıkışta token silme |
| `mobile/composeApp/src/commonMain/.../push/PushNotifications.kt` | `expect object` |
| `mobile/composeApp/src/androidMain/.../push/PushNotifications.android.kt` | FCM + izin |
| `mobile/composeApp/src/iosMain/.../push/PushNotifications.ios.kt` | no-op `actual` |
| `mobile/composeApp/src/commonMain/.../push/DeviceRegistrar.kt` | token → sunucu kaydı |
| `mobile/gradle/libs.versions.toml` (değişiklik) | `firebase-messaging` |
| `mobile/composeApp/build.gradle.kts` (değişiklik) | koşullu google-services eklentisi |
| `mobile/composeApp/src/androidMain/AndroidManifest.xml` (değişiklik) | `POST_NOTIFICATIONS` + service |
| `mobile/composeApp/src/androidMain/.../push/PushMessagingService.kt` | bildirim gösterimi |
| `mobile/composeApp/src/commonMain/.../ui/screens/SettingsScreen.kt` (değişiklik) | bildirim satırları |
| `docs/PUSH-SETUP.md` (mevcut) | kurulum rehberi — değişmez |

---

### Task 1: Veri modeli — migration + Drizzle şeması

**Files:**
- Create: `backend/src/db/migrations/0011_push_notifications.sql`
- Modify: `backend/src/db/schema.ts` (dosya sonuna `deviceTokens` eklenir)
- Test: `backend/tests/db/device-tokens-schema.test.ts`

**Interfaces:**
- Produces: `deviceTokens` Drizzle tablosu (`userId`, `token`, `platform`, `createdAt`, `lastSeenAt`); `users.notificationsEnabled: boolean`, `users.quietHoursOverride: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/db/device-tokens-schema.test.ts
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIG = join(process.cwd(), 'src/db/migrations')

async function freshDb() {
  const pg = new PGlite()
  for (const f of ['0011_push_notifications.sql']) {
    await pg.exec(readFileSync(join(MIG, f), 'utf8').split('--> statement-breakpoint').join(';'))
  }
  return pg
}

describe('0011 push migration', () => {
  it('device_tokens tablosunu oluşturur', async () => {
    const pg = await freshDb()
    const r = await pg.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='device_tokens' ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual([
      'created_at', 'id', 'last_seen_at', 'platform', 'token', 'user_id',
    ])
  })

  it('aynı token iki kez yazılamaz (unique)', async () => {
    const pg = await freshDb()
    await pg.exec(`INSERT INTO users (email, display_name) VALUES ('a@t.local','A')`)
    const u = await pg.query(`SELECT id FROM users LIMIT 1`)
    const userId = u.rows[0].id
    await pg.query(
      `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,'tok1','ANDROID')`,
      [userId],
    )
    await expect(
      pg.query(`INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,'tok1','ANDROID')`, [userId]),
    ).rejects.toThrow()
  })

  it('kullanıcı silinince token da silinir (cascade)', async () => {
    const pg = await freshDb()
    await pg.exec(`INSERT INTO users (email, display_name) VALUES ('b@t.local','B')`)
    const u = await pg.query(`SELECT id FROM users LIMIT 1`)
    const userId = u.rows[0].id
    await pg.query(
      `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1,'tok2','ANDROID')`, [userId],
    )
    await pg.query(`DELETE FROM users WHERE id = $1`, [userId])
    const left = await pg.query(`SELECT count(*)::int AS n FROM device_tokens`)
    expect(left.rows[0].n).toBe(0)
  })

  it('users tablosunda bildirim tercihleri varsayılanlı gelir', async () => {
    const pg = await freshDb()
    await pg.exec(`INSERT INTO users (email, display_name) VALUES ('c@t.local','C')`)
    const r = await pg.query(`SELECT notifications_enabled, quiet_hours_override FROM users`)
    expect(r.rows[0].notifications_enabled).toBe(true)
    expect(r.rows[0].quiet_hours_override).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/db/device-tokens-schema.test.ts`
Expected: FAIL — `ENOENT` (0011 dosyası yok)

- [ ] **Step 3: Write the migration**

`backend/src/db/migrations/0011_push_notifications.sql`:

```sql
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "platform" text NOT NULL DEFAULT 'ANDROID',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "device_tokens_token_unique" UNIQUE("token"),
  CONSTRAINT "device_tokens_user_fk" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_tokens_user_idx" ON "device_tokens" ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quiet_hours_override" boolean NOT NULL DEFAULT false;
```

Not: `users` tablosu 0000'da oluşturulmuş; `IF NOT EXISTS` ile güvenli.

- [ ] **Step 4: Add Drizzle definitions**

`backend/src/db/schema.ts` — dosya sonuna `deviceTokens` tablosu:

```ts
export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull().default('ANDROID'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ userIdx: index('device_tokens_user_idx').on(table.userId) }))
```

Ve `users` pgTable tanımına (`updatedAt`'ten önce) iki alan:

```ts
    notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
    quietHoursOverride: boolean('quiet_hours_override').notNull().default(false),
```

`boolean` importu `drizzle-orm/pg-core`'den eklenmeli.

NEDEN AYRI TABLO, `users.device_token` DEĞİL: bir kullanıcının birden çok
cihazı olabilir (telefon + tablet). Tek sütun ikincisini ezer ve kullanıcı
yalnız son giriş yaptığı cihazda bildirim alır.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/db/device-tokens-schema.test.ts`
Expected: PASS (4 test)

- [ ] **Step 6: Run full backend typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/migrations/0011_push_notifications.sql backend/src/db/schema.ts backend/tests/db/device-tokens-schema.test.ts
git commit -m "feat(db): device_tokens tablosu + bildirim tercihleri (migration 0011)"
```

---

### Task 2: Token deposu — upsert, silme, listeleme

**Files:**
- Create: `backend/src/notifications/store.ts`
- Test: `backend/tests/notifications/store.test.ts`

**Interfaces:**
- Consumes: Task 1 `deviceTokens` şeması.
- Produces:
  - `interface DeviceTokenDeps` — `upsertDeviceToken(input)`, `deleteDeviceToken(token)`, `deleteAllForUser(userId)`, `listTokensForUser(userId)`, `listTokensForWeddingMembers(weddingId, excludeUserId)`.
  - `drizzleDeviceTokenDeps(db)` → `DeviceTokenDeps`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/store.test.ts
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '../../src/db/schema.js'
import { drizzleDeviceTokenDeps } from '../../src/notifications/store.js'

const MIG = join(process.cwd(), 'src/db/migrations')

async function setup() {
  const pg = new PGlite()
  for (const f of ['0000_free_genesis.sql', '0011_push_notifications.sql']) {
    await pg.exec(readFileSync(join(MIG, f), 'utf8').split('--> statement-breakpoint').join(';'))
  }
  return { pg, deps: drizzleDeviceTokenDeps(drizzle(pg, { schema })) }
}

async function makeUser(pg: PGlite, email: string): Promise<string> {
  await pg.query(`INSERT INTO users (email, display_name) VALUES ($1,'X')`, [email])
  const r = await pg.query(`SELECT id FROM users WHERE email = $1`, [email])
  return r.rows[0].id as string
}

describe('device token store', () => {
  it('upsert: aynı token ikinci kez yazılınca sahibi değişir', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    const b = await makeUser(pg, 'b@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 'tok1', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: b, token: 'tok1', platform: 'ANDROID' })
    const rows = await deps.listTokensForUser(b)
    expect(rows).toHaveLength(1)
    expect(await deps.listTokensForUser(a)).toHaveLength(0)
  })

  it('bir kullanıcının İKİ cihazı birlikte durur', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 'tel', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: a, token: 'tablet', platform: 'ANDROID' })
    expect(await deps.listTokensForUser(a)).toHaveLength(2)
  })

  it('deleteDeviceToken yalnız o token'ı siler', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 't1', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: a, token: 't2', platform: 'ANDROID' })
    await deps.deleteDeviceToken('t1')
    const left = await deps.listTokensForUser(a)
    expect(left.map((r) => r.token)).toEqual(['t2'])
  })

  it('deleteAllForUser çıkışta hepsini siler', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 't1', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: a, token: 't2', platform: 'ANDROID' })
    await deps.deleteAllForUser(a)
    expect(await deps.listTokensForUser(a)).toHaveLength(0)
  })

  it('listTokensForWeddingMembers göndereni HARİÇ tutar', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    const b = await makeUser(pg, 'b@t.local')
    await pg.query(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & B', now())`)
    const w = await pg.query(`SELECT id FROM weddings LIMIT 1`)
    const wid = w.rows[0].id as string
    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER'), ($1,$3,'CO_OWNER')`,
      [wid, a, b],
    )
    await deps.upsertDeviceToken({ userId: a, token: 'ta', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: b, token: 'tb', platform: 'ANDROID' })

    const tokens = await deps.listTokensForWeddingMembers(wid, a)
    expect(tokens.map((t) => t.token)).toEqual(['tb'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/store.test.ts`
Expected: FAIL — `Cannot find module '../../src/notifications/store.js'`

- [ ] **Step 3: Implement the store**

`backend/src/notifications/store.ts` — dışa açık yüzey:

```ts
export interface DeviceTokenRow {
  id: string
  userId: string
  token: string
  platform: string
}

export interface DeviceTokenDeps {
  upsertDeviceToken(input: { userId: string; token: string; platform: string }): Promise<void>
  deleteDeviceToken(token: string): Promise<void>
  deleteAllForUser(userId: string): Promise<void>
  listTokensForUser(userId: string): Promise<DeviceTokenRow[]>
  /** `excludeUserId` = bildirimi tetikleyen; kendine bildirim gitmez. */
  listTokensForWeddingMembers(
    weddingId: string,
    excludeUserId: string | null,
  ): Promise<DeviceTokenRow[]>
}

export function drizzleDeviceTokenDeps(db: AnyDb): DeviceTokenDeps
```

Gövdeleri yazarken uyulacak kararlar:

- **`upsertDeviceToken`** — `onConflictDoUpdate({ target: deviceTokens.token,
  set: { userId, lastSeenAt: new Date() } })`. Aynı token başka kullanıcıya
  geçerse SAHİBİ değişir (cihaz el değiştirdi).
- **`listTokensForWeddingMembers`** — `weddingMembers` INNER JOIN
  `deviceTokens`; `excludeUserId` null değilse `ne(weddingMembers.userId, …)`.
  Tek sorgu — kullanıcı başına ayrı sorgu N+1 üretirdi.
- **`AnyDb`** — PGlite ve node-postgres ikisi de kabul edilsin diye gevşek
  tip; testler PGlite kullanıyor.


- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/notifications/store.test.ts`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/store.ts backend/tests/notifications/store.test.ts
git commit -m "feat(push): device token deposu — upsert, silme, üye listesi"
```

---

### Task 3: Sessiz saat — saf fonksiyon

**Files:**
- Create: `backend/src/notifications/quiet-hours.ts`
- Test: `backend/tests/notifications/quiet-hours.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_TIMEZONE` from `../lib/month.js`.
- Produces: `shouldSendNow(now: Date, weddingDate: Date | null, override: boolean, timezone?: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/quiet-hours.test.ts
import { describe, it, expect } from 'vitest'
import { shouldSendNow } from '../../src/notifications/quiet-hours.js'

/** İstanbul saatiyle verilen an (UTC+3, yaz saati yok). */
function istanbul(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 10, 5, hour - 3, minute))
}

describe('shouldSendNow', () => {
  const wedding = new Date('2026-12-01T18:00:00Z')

  it('gündüz gönderir (14:00)', () => {
    expect(shouldSendNow(istanbul(14), wedding, false)).toBe(true)
  })

  it('21:59 gönderir — sessiz saat henüz başlamadı', () => {
    expect(shouldSendNow(istanbul(21, 59), wedding, false)).toBe(true)
  })

  it('22:00 sessiz saat BAŞLAR — göndermez', () => {
    expect(shouldSendNow(istanbul(22, 0), wedding, false)).toBe(false)
  })

  it('23:00 göndermez', () => {
    expect(shouldSendNow(istanbul(23), wedding, false)).toBe(false)
  })

  it('03:00 göndermez', () => {
    expect(shouldSendNow(istanbul(3), wedding, false)).toBe(false)
  })

  it('08:59 hâlâ sessiz — göndermez', () => {
    expect(shouldSendNow(istanbul(8, 59), wedding, false)).toBe(false)
  })

  it('09:00 sessizlik BİTER — gönderir', () => {
    expect(shouldSendNow(istanbul(9, 0), wedding, false)).toBe(true)
  })

  it('düğün öncesi hafta istisnası: 23:00 gönderir', () => {
    const now = istanbul(23)
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 gün sonra
    expect(shouldSendNow(now, soon, false)).toBe(true)
  })

  it('düğün 8 gün sonraysa istisna YOK — 23:00 göndermez', () => {
    const now = istanbul(23)
    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(shouldSendNow(now, later, false)).toBe(false)
  })

  it('düğün geçmişse istisna YOK — 23:00 göndermez', () => {
    const now = istanbul(23)
    const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    expect(shouldSendNow(now, past, false)).toBe(false)
  })

  it('quietHoursOverride sessiz saati tamamen kapatır', () => {
    expect(shouldSendNow(istanbul(3), wedding, true)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/quiet-hours.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`backend/src/notifications/quiet-hours.ts`:

```ts
import { DEFAULT_TIMEZONE } from '../lib/month.js'

/** Sessiz saat aralığı — spec §6b.3. */
const QUIET_START_HOUR = 22
const QUIET_END_HOUR = 9

/** Düğün öncesi istisna penceresi (gün). */
const PRE_WEDDING_DAYS = 7

/**
 * Şu an bildirim gönderilmeli mi?
 *
 * KURALLAR (spec §6b.3):
 *  - 22:00–09:00 arası GÖNDERİLMEZ (Europe/Istanbul).
 *  - Düğüne 7 günden az kalmışsa istisna: son hafta RSVP/görev trafiği
 *    zirvede, gece gelen yanıt sabaha kadar beklememeli.
 *  - Düğün GEÇMİŞSE istisna yok — arşivlenmiş düğün için gece bildirimi
 *    anlamsız.
 *  - `quietHoursOverride` kullanıcı tercihi her şeyi ezer.
 *
 * NEDEN SAF FONKSİYON: `Date.now()` çağırmıyor. Zaman testte
 * enjekte edilebilir olmalı; `new Date()` çağıran bir fonksiyon
 * "gece 03:00" senaryosunu ancak saat değiştirerek sınar (kırılgan).
 */
export function shouldSendNow(
  now: Date,
  weddingDate: Date | null,
  quietHoursOverride: boolean,
  timezone: string = DEFAULT_TIMEZONE,
): boolean {
  if (quietHoursOverride) return true

  // Düğün öncesi hafta: 0 < kalan gün <= 7
  if (weddingDate !== null) {
    const msLeft = weddingDate.getTime() - now.getTime()
    const daysLeft = msLeft / (24 * 60 * 60 * 1000)
    if (daysLeft > 0 && daysLeft <= PRE_WEDDING_DAYS) return true
  }

  const hour = hourIn(timezone, now)
  // Aralık günü aşar: [22, 24) ∪ [0, 9)
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return false
  return true
}

/**
 * Verilen anın saat dilimindeki saatini (0–23) döner.
 *
 * `Intl.DateTimeFormat` kullanılıyor: `Europe/Istanbul` sabit UTC+3
 * DEĞİLDİR (tarihsel yaz saati uygulaması vardı). Sabit ofset varsaymak,
 * 2015 öncesi bir tarihle test edilirse yanlış sonuç verir.
 */
function hourIn(timezone: string, at: Date): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(at)
  // 'en-GB' + hour12:false → "14" veya gece yarısı "00"
  return Number.parseInt(formatted, 10) % 24
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/notifications/quiet-hours.test.ts`
Expected: PASS (11 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/quiet-hours.ts backend/tests/notifications/quiet-hours.test.ts
git commit -m "feat(push): sessiz saat + düğün öncesi hafta istisnası"
```

---

### Task 4: FCM istemcisi — JWT, OAuth2, gönderim

**Files:**
- Create: `backend/src/notifications/fcm.ts`
- Test: `backend/tests/notifications/fcm.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/lib/logger.ts`

**Interfaces:**
- Consumes: `env.FCM_SERVICE_ACCOUNT_BASE64`, `env.PUSH_ENABLED`.
- Produces:
  - `interface ServiceAccount { project_id: string; client_email: string; private_key: string }`
  - `parseServiceAccount(base64: string): ServiceAccount | null`
  - `interface FcmSender { send(token: string, title: string, body: string, data: Record<string,string>): Promise<FcmResult> }`
  - `type FcmResult = { ok: true } | { ok: false; unregistered: boolean; reason: string }`
  - `createFcmSender(account: ServiceAccount, fetchImpl?: typeof fetch): FcmSender`
  - `createFcmSenderFromEnv(env, fetchImpl?): FcmSender | null`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/fcm.test.ts
import { describe, it, expect, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import {
  parseServiceAccount,
  createFcmSender,
  createFcmSenderFromEnv,
} from '../../src/notifications/fcm.js'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const ACCOUNT = {
  project_id: 'dugunce-app',
  client_email: 'firebase-adminsdk-fbsvc@dugunce-app.iam.gserviceaccount.com',
  private_key: privateKey,
}

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

describe('parseServiceAccount', () => {
  it('geçerli base64 JSON ayrıştırır', () => {
    const acc = parseServiceAccount(b64(ACCOUNT))
    expect(acc?.project_id).toBe('dugunce-app')
  })

  it('boş değerde null döner (sunucu çökmemeli)', () => {
    expect(parseServiceAccount('')).toBeNull()
  })

  it('bozuk base64te null döner', () => {
    expect(parseServiceAccount('!!!bozuk!!!')).toBeNull()
  })

  it('eksik alanlı JSON null döner', () => {
    expect(parseServiceAccount(b64({ project_id: 'x' }))).toBeNull()
  })
})

describe('createFcmSender', () => {
  it('gönderimde doğru URL ve Bearer token kullanır', async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = []
    const fakeFetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      })
      return new Response('{"name":"projects/dugunce-app/messages/1"}', { status: 200 })
    })

    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('DEVICE_TOKEN', 'Başlık', 'Gövde', { type: 'RSVP_RECEIVED' })

    expect(r.ok).toBe(true)
    // İlk çağrı OAuth2 token, ikincisi gönderim
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token')
    expect(calls[1].url).toBe(
      'https://fcm.googleapis.com/v1/projects/dugunce-app/messages:send',
    )
    expect(calls[1].headers['Authorization']).toMatch(/^Bearer /)
    const parsed = JSON.parse(calls[1].body)
    expect(parsed.message.token).toBe('DEVICE_TOKEN')
    expect(parsed.message.notification.title).toBe('Başlık')
    expect(parsed.message.data.type).toBe('RSVP_RECEIVED')
  })

  it('404 UNREGISTERED → unregistered:true', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      return new Response(
        '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}',
        { status: 404 },
      )
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('tok', 'B', 'G', {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.unregistered).toBe(true)
  })

  it('500 → unregistered:false, sunucu ÇÖKMEZ', async () => {
    let n = 0
    const fakeFetch = vi.fn(async () => {
      n += 1
      if (n === 1) return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      return new Response('boom', { status: 500 })
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    const r = await sender.send('tok', 'B', 'G', {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.unregistered).toBe(false)
  })

  it('OAuth2 token 1 saat önbelleklenir (ikinci gönderimde yeniden alınmaz)', async () => {
    let tokenCalls = 0
    const fakeFetch = vi.fn(async (url: string) => {
      if (String(url).includes('oauth2')) {
        tokenCalls += 1
        return new Response('{"access_token":"t","expires_in":3600}', { status: 200 })
      }
      return new Response('{"name":"ok"}', { status: 200 })
    })
    const sender = createFcmSender(ACCOUNT, fakeFetch as unknown as typeof fetch)
    await sender.send('a', 'B', 'G', {})
    await sender.send('b', 'B', 'G', {})
    expect(tokenCalls).toBe(1)
  })
})

describe('createFcmSenderFromEnv', () => {
  it('PUSH_ENABLED=false iken null döner', () => {
    expect(
      createFcmSenderFromEnv({ PUSH_ENABLED: false, FCM_SERVICE_ACCOUNT_BASE64: '' }),
    ).toBeNull()
  })

  it('anahtar yokken null döner, ÇÖKMEZ', () => {
    expect(
      createFcmSenderFromEnv({ PUSH_ENABLED: true, FCM_SERVICE_ACCOUNT_BASE64: '' }),
    ).toBeNull()
  })

  it('ikisi de varsa gönderici üretir', () => {
    const s = createFcmSenderFromEnv({
      PUSH_ENABLED: true,
      FCM_SERVICE_ACCOUNT_BASE64: b64(ACCOUNT),
    })
    expect(s).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/fcm.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add env vars**

`backend/src/config/env.ts`, `VAPID_SUBJECT` satırından sonra:

```ts
  // --- Mobil push (FCM) ---
  /** Service account JSON'ının base64'ü. Boşsa push kapalı sayılır. */
  FCM_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  /** 'true' değilse gönderim yapılmaz (uçlar çalışır). */
  PUSH_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
```

`backend/src/lib/logger.ts` redact listesine ekle:

```ts
  'FCM_SERVICE_ACCOUNT_BASE64',
```

- [ ] **Step 4: Implement the sender**

`backend/src/notifications/fcm.ts` — dışa açık yüzey:

```ts
export interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

export type FcmResult =
  | { ok: true }
  | { ok: false; unregistered: boolean; reason: string }

export interface FcmSender {
  send(token: string, title: string, body: string, data: Record<string, string>): Promise<FcmResult>
}

export function parseServiceAccount(base64: string): ServiceAccount | null
export function createFcmSender(account: ServiceAccount, fetchImpl?: typeof fetch): FcmSender
export function createFcmSenderFromEnv(
  env: { PUSH_ENABLED: boolean; FCM_SERVICE_ACCOUNT_BASE64?: string | undefined },
  fetchImpl?: typeof fetch,
): FcmSender | null
```

Gövdeleri yazarken uyulacak kararlar (testler bunları çiviliyor):

- **`parseServiceAccount`** — `Buffer.from(b64,'base64')` → `JSON.parse`;
  her hata ve eksik alan `null` döner (sunucu çökmemeli).
- **JWT** — başlık `{alg:'RS256',typ:'JWT'}`, claim
  `{iss: client_email, scope:'https://www.googleapis.com/auth/firebase.messaging',
  aud:'https://oauth2.googleapis.com/token', iat, exp: iat+3600}`.
  İmza: `createSign('RSA-SHA256')` + `base64url` kodlama.
- **OAuth2 takası** — `POST https://oauth2.googleapis.com/token`,
  `application/x-www-form-urlencoded`, gövde
  `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`.
- **Token önbelleği** — modül kapanışında `{value, expiresAt}`; süre
  dolmadan **60 sn önce** yenile (saat kayması payı). Test ikinci
  gönderimde OAuth çağrısı olmadığını doğruluyor.
- **Gönderim** — `POST https://fcm.googleapis.com/v1/projects/<project_id>/messages:send`,
  gövde `{message:{token, notification:{title, body}, data}}`.
- **`UNREGISTERED` tespiti** — yanıt `404` **ve** gövde `UNREGISTERED`
  içeriyorsa `unregistered:true`. Diğer tüm hatalar `unregistered:false`.
- **`createFcmSenderFromEnv`** — `PUSH_ENABLED` false veya anahtar
  ayrıştırılamıyorsa `null` (hata değil; push opsiyonel).


- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/notifications/fcm.test.ts`
Expected: PASS (9 test)

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add backend/src/notifications/fcm.ts backend/tests/notifications/fcm.test.ts backend/src/config/env.ts backend/src/lib/logger.ts
git commit -m "feat(push): FCM HTTP v1 istemcisi — JWT imzalama, token önbelleği"
```

---

### Task 5: Bildirim servisi — olay orkestrasyonu

**Files:**
- Create: `backend/src/notifications/service.ts`
- Test: `backend/tests/notifications/service.test.ts`

**Interfaces:**
- Consumes: Task 2 `DeviceTokenDeps`, Task 3 `shouldSendNow`, Task 4 `FcmSender`.
- Produces:
  - `type NotifyEvent = 'RSVP_RECEIVED' | 'TASK_ASSIGNED' | 'TASK_MESSAGE' | 'TASK_STATUS_CHANGED'`
  - `interface NotifyDeps { tokens: DeviceTokenDeps; sender: FcmSender | null; findWedding(weddingId): Promise<{ weddingDate: Date | null } | null>; isQuietHoursOverride(userId): Promise<boolean>; isEnabled(userId): Promise<boolean> }`
  - `notifyWeddingMembers(deps, params: { weddingId; event; actorUserId: string | null; data?: Record<string,string> }): Promise<void>`
  - `NOTIFICATION_COPY: Record<NotifyEvent, { title: string; body: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { notifyWeddingMembers, NOTIFICATION_COPY } from '../../src/notifications/service.js'
import type { DeviceTokenDeps, DeviceTokenRow } from '../../src/notifications/store.js'
import type { FcmSender } from '../../src/notifications/fcm.js'

function tokensDeps(rows: DeviceTokenRow[]): DeviceTokenDeps {
  return {
    upsertDeviceToken: vi.fn(),
    deleteDeviceToken: vi.fn(async () => undefined),
    deleteAllForUser: vi.fn(),
    listTokensForUser: vi.fn(async () => []),
    listTokensForWeddingMembers: vi.fn(async () => rows),
  }
}

const ROW = (t: string): DeviceTokenRow => ({ id: 'i' + t, userId: 'u' + t, token: t, platform: 'ANDROID' })

describe('notifyWeddingMembers', () => {
  it('sessiz saatte HİÇ göndermez', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    // 23:00 İstanbul
    const now = new Date(Date.UTC(2026, 10, 5, 20, 0))
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a')]),
        sender,
        findWedding: async () => ({ weddingDate: new Date('2026-12-01T18:00:00Z') }),
        isQuietHoursOverride: async () => false,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now },
    )
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('gündüz tüm tokenlara gönderir', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    const now = new Date(Date.UTC(2026, 10, 5, 11, 0)) // 14:00 İstanbul
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a'), ROW('b')]),
        sender,
        findWedding: async () => ({ weddingDate: new Date('2026-12-01T18:00:00Z') }),
        isQuietHoursOverride: async () => false,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now },
    )
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('sender null ise (push kapalı) sessizce döner', async () => {
    const tokens = tokensDeps([ROW('a')])
    await notifyWeddingMembers(
      {
        tokens,
        sender: null,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: new Date() },
    )
    expect(tokens.listTokensForWeddingMembers).not.toHaveBeenCalled()
  })

  it('UNREGISTERED dönen token DB den SİLİNİR', async () => {
    const tokens = tokensDeps([ROW('olu')])
    const sender = {
      send: vi.fn(async () => ({ ok: false as const, unregistered: true, reason: 'FCM 404' })),
    }
    await notifyWeddingMembers(
      {
        tokens,
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: new Date() },
    )
    expect(tokens.deleteDeviceToken).toHaveBeenCalledWith('olu')
  })

  it('bir token hata verse diğerlerine gönderim DEVAM eder', async () => {
    const tokens = tokensDeps([ROW('kotu'), ROW('iyi')])
    const sender = {
      send: vi.fn(async (t: string) =>
        t === 'kotu'
          ? { ok: false as const, unregistered: false, reason: 'FCM 500' }
          : { ok: true as const },
      ),
    }
    await notifyWeddingMembers(
      {
        tokens,
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: new Date() },
    )
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('kullanıcı bildirimleri KAPATMIŞSA göndermez', async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) }
    await notifyWeddingMembers(
      {
        tokens: tokensDeps([ROW('a')]),
        sender,
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => false,
      },
      { weddingId: 'w1', event: 'RSVP_RECEIVED', actorUserId: null, now: new Date() },
    )
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('bildirim metni hassas veri İÇERMEZ', () => {
    for (const copy of Object.values(NOTIFICATION_COPY)) {
      expect(copy.title).not.toMatch(/\d/)
      expect(copy.body).not.toMatch(/\d/)
    }
    expect(NOTIFICATION_COPY.RSVP_RECEIVED.body).toBe('Bir davetli yanıt verdi.')
  })

  it('actorUserId kendine bildirim göndermez', async () => {
    const tokens = tokensDeps([])
    await notifyWeddingMembers(
      {
        tokens,
        sender: { send: vi.fn(async () => ({ ok: true as const })) },
        findWedding: async () => ({ weddingDate: null }),
        isQuietHoursOverride: async () => true,
        isEnabled: async () => true,
      },
      { weddingId: 'w1', event: 'TASK_MESSAGE', actorUserId: 'u1', now: new Date() },
    )
    expect(tokens.listTokensForWeddingMembers).toHaveBeenCalledWith('w1', 'u1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`backend/src/notifications/service.ts` — dışa açık yüzey:

```ts
export type NotifyEvent =
  | 'RSVP_RECEIVED' | 'TASK_ASSIGNED' | 'TASK_MESSAGE' | 'TASK_STATUS_CHANGED'

export const NOTIFICATION_COPY: Record<NotifyEvent, { title: string; body: string }>

export interface NotifyDeps {
  tokens: DeviceTokenDeps
  /** `null` = push yapılandırılmamış; gönderim atlanır. */
  sender: FcmSender | null
  findWedding(weddingId: string): Promise<{ weddingDate: Date | null } | null>
  isQuietHoursOverride(userId: string): Promise<boolean>
  isEnabled(userId: string): Promise<boolean>
}

export interface NotifyParams {
  weddingId: string
  event: NotifyEvent
  actorUserId: string | null
  data?: Record<string, string>
  /** Test enjeksiyonu; verilmezse `new Date()`. */
  now?: Date
}

export async function notifyWeddingMembers(deps: NotifyDeps, params: NotifyParams): Promise<void>
```

Gövdeleri yazarken uyulacak kararlar (testler bunları çiviliyor):

- **`NOTIFICATION_COPY`** — sabit metinler; içinde RAKAM ve İSİM yok
  (kilit ekranında görünür). Test bunu doğruluyor.
- **Erken çıkışlar sırayla:** `sender === null` → dön; `findWedding`
  null → dön; alıcı yok → dön; `isEnabled(firstUserId) === false` → dön;
  `shouldSendNow(...)` false → dön.
- **Alıcı listesi** — `tokens.listTokensForWeddingMembers(weddingId, actorUserId)`;
  tetikleyen kullanıcıya bildirim GİTMEZ.
- **`data` yükü** — `{type: event, weddingId, ...params.data}`.
- **Sıralı gönderim** (paralel değil): FCM'e eşzamanlı 100 istek hız
  sınırına takılır.
- **`result.unregistered` → `deleteDeviceToken(token)`**; diğer hata →
  `logger.warn`. Tek token'ın hatası döngüyü DURDURMAZ (try/catch her
  yinelemede).
- **Çağıran `await` ETMEZ** — `void notifyWeddingMembers(...)`.


- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/notifications/service.test.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/service.ts backend/tests/notifications/service.test.ts
git commit -m "feat(push): bildirim servisi — sessiz saat, ölü token temizliği"
```

---

### Task 6: HTTP uçları — cihaz kaydı ve tercihler

**Files:**
- Create: `backend/src/notifications/preferences.ts`
- Create: `backend/src/notifications/router.ts`
- Test: `backend/tests/notifications/router.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: Task 2 `DeviceTokenDeps`.
- Produces:
  - `createNotificationsRouter(deps: { requireAuth; tokens: DeviceTokenDeps; preferences: PreferencesDeps }): Router`
  - `interface PreferencesDeps { get(userId): Promise<{ enabled: boolean; quietHoursOverride: boolean }>; set(userId, patch: { enabled?: boolean; quietHoursOverride?: boolean }): Promise<void> }`
  - 4 uç: `POST /device`, `DELETE /device`, `GET /preferences`, `PATCH /preferences`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createNotificationsRouter } from '../../src/notifications/router.js'
import type { DeviceTokenDeps } from '../../src/notifications/store.js'
import type { PreferencesDeps } from '../../src/notifications/preferences.js'

function app(deps: DeviceTokenDeps) {
  const a = express()
  a.use(express.json())
  a.use(
    '/api/v1/notifications',
    createNotificationsRouter({
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'u1' }
        next()
      },
      tokens: deps,
    }),
  )
  return a
}

function prefs(): PreferencesDeps & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => ({ enabled: true, quietHoursOverride: false })),
    set: vi.fn(async () => undefined),
  } as never
}

function appWithPrefs(tokens: DeviceTokenDeps, preferences: PreferencesDeps) {
  const a = express()
  a.use(express.json())
  a.use(
    '/api/v1/notifications',
    createNotificationsRouter({
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'u1' }
        next()
      },
      tokens,
      preferences,
    }),
  )
  return a
}

function deps(): DeviceTokenDeps {
  return {
    upsertDeviceToken: vi.fn(async () => undefined),
    deleteDeviceToken: vi.fn(async () => undefined),
    deleteAllForUser: vi.fn(async () => undefined),
    listTokensForUser: vi.fn(async () => []),
    listTokensForWeddingMembers: vi.fn(async () => []),
  }
}

describe('notifications router', () => {
  it('POST /device kaydeder', async () => {
    const d = deps()
    const res = await request(app(d))
      .post('/api/v1/notifications/device')
      .send({ token: 'tok', platform: 'ANDROID' })
    expect(res.status).toBe(204)
    expect(d.upsertDeviceToken).toHaveBeenCalledWith({
      userId: 'u1', token: 'tok', platform: 'ANDROID',
    })
  })

  it('POST /device boş token → 400', async () => {
    const res = await request(app(deps()))
      .post('/api/v1/notifications/device')
      .send({ token: '' })
    expect(res.status).toBe(400)
  })

  it('POST /device geçersiz platform → 400', async () => {
    const res = await request(app(deps()))
      .post('/api/v1/notifications/device')
      .send({ token: 'tok', platform: 'WINDOWS' })
    expect(res.status).toBe(400)
  })

  it('DELETE /device siler', async () => {
    const d = deps()
    const res = await request(app(d))
      .delete('/api/v1/notifications/device')
      .send({ token: 'tok' })
    expect(res.status).toBe(204)
    expect(d.deleteDeviceToken).toHaveBeenCalledWith('tok')
  })

  it('DELETE /device boş token → 400', async () => {
    const res = await request(app(deps()))
      .delete('/api/v1/notifications/device')
      .send({})
    expect(res.status).toBe(400)
  })

  it('GET /preferences mevcut tercihleri döner', async () => {
    const res = await request(appWithPrefs(deps(), prefs()))
      .get('/api/v1/notifications/preferences')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: true, quietHoursOverride: false })
  })

  it('PATCH /preferences yalnız gönderilen alanı değiştirir', async () => {
    const p = prefs()
    const res = await request(appWithPrefs(deps(), p))
      .patch('/api/v1/notifications/preferences')
      .send({ enabled: false })
    expect(res.status).toBe(200)
    expect(p.set).toHaveBeenCalledWith('u1', { enabled: false })
  })

  it('PATCH /preferences boş gövde → 400 (sessiz no-op yok)', async () => {
    const res = await request(appWithPrefs(deps(), prefs()))
      .patch('/api/v1/notifications/preferences')
      .send({})
    expect(res.status).toBe(400)
  })

  it('PATCH /preferences bilinmeyen alan → 400', async () => {
    const res = await request(appWithPrefs(deps(), prefs()))
      .patch('/api/v1/notifications/preferences')
      .send({ enabled: true, admin: true })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement router**

Önce tercih deposu — `backend/src/notifications/preferences.ts`:

```ts
export interface Preferences {
  enabled: boolean
  quietHoursOverride: boolean
}

export interface PreferencesDeps {
  get(userId: string): Promise<Preferences>
  set(userId: string, patch: Partial<Preferences>): Promise<void>
}

export function drizzlePreferencesDeps(db: AnyDb): PreferencesDeps
```

Kararlar: `get` → `users` tablosundan `notifications_enabled` +
`quiet_hours_override`; kullanıcı bulunamazsa `{enabled:false,
quietHoursOverride:false}` (güvenli varsayılan). `set` → yalnız
`patch`'te tanımlı alanları `update` eder; boş patch `update` ÇAĞIRMAZ.

Sonra router — `backend/src/notifications/router.ts`:

```ts
export function createNotificationsRouter(deps: {
  requireAuth: import('express').RequestHandler
  tokens: DeviceTokenDeps
  preferences: PreferencesDeps
}): Router
```

Dört uç ve kararları:

| Uç | Davranış |
|---|---|
| `POST /device` | Gövde `{token, platform}`. Boş token → 400 `INVALID_TOKEN`. `platform` yalnız `'ANDROID'` (iOS sonraki iş) → değilse 400 `INVALID_PLATFORM`. Başarı → **204**. |
| `DELETE /device` | Gövde `{token}`. Token **gövdede**, sorgu parametresinde DEĞİL — URL'ye yazılan token erişim/proxy loglarına düşer. Boş → 400. Başarı → **204**. |
| `GET /preferences` | `preferences.get(userId)` → **200** `{enabled, quietHoursOverride}`. |
| `PATCH /preferences` | Boş gövde → 400 `EMPTY_PATCH` (sessiz no-op istemci hatasını gizler). Bilinmeyen alan → 400 `INVALID_PATCH`. Başarı → **200** güncel tercihler. |

Hepsi `deps.requireAuth` arkasında; `req.auth?.userId` yoksa 401.


- [ ] **Step 4: Register in app.ts**

`backend/src/app.ts`, diğer `app.use` satırlarının yanına:

```ts
  app.use(
    '/api/v1/notifications',
    createNotificationsRouter({ requireAuth, tokens: deviceTokenDeps }),
  )
```

`deviceTokenDeps` uygulama kurulumunda bir kez üretilir:

```ts
  const deviceTokenDeps = drizzleDeviceTokenDeps(db)
```

(`db` o dosyada zaten mevcut; import satırları eklenir.)

- [ ] **Step 5: Run tests**

Run: `cd backend && npx vitest run tests/notifications/router.test.ts`
Expected: PASS (5 test)

- [ ] **Step 6: Full backend suite**

Run: `cd backend && npx vitest run`
Expected: tüm testler PASS (yeni 5 dahil)

- [ ] **Step 7: Commit**

```bash
git add backend/src/notifications/preferences.ts backend/src/notifications/router.ts backend/tests/notifications/router.test.ts backend/src/app.ts
git commit -m "feat(push): cihaz kaydı, silme ve tercih uçları"
```

---

### Task 7: Olay tetikleyicilerini bağla

**Files:**
- Modify: `backend/src/routes/guests.ts` (RSVP)
- Modify: `backend/src/routes/tasks.ts` (atama, durum, mesaj)
- Modify: `backend/src/routes/helper-app.ts` (yardımcı mesajı)
- Test: `backend/tests/notifications/triggers.test.ts`

**Interfaces:**
- Consumes: Task 5 `notifyWeddingMembers`, `NotifyDeps`.
- Produces: hiçbir yeni imza — yalnız çağrı noktaları.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/triggers.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/**
 * Tetikleyici bağlantıları DAVRANIŞ testiyle sınanamaz (route'lar DB
 * ister). Burada yapısal doğrulama yapılıyor: her çağrı `void` ile
 * yapılmalı — `await` edilirse ana iş akışı FCM'e bağlanır.
 */
describe('push tetikleyicileri', () => {
  it('guests.ts RSVP sonrası notify çağırır ve await ETMEZ', () => {
    const src = read('src/routes/guests.ts')
    expect(src).toMatch(/void notifyWeddingMembers\(/)
    expect(src).not.toMatch(/await notifyWeddingMembers\(/)
  })

  it('tasks.ts görev atama/durum/mesaj için notify çağırır', () => {
    const src = read('src/routes/tasks.ts')
    expect(src.match(/void notifyWeddingMembers\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(src).not.toMatch(/await notifyWeddingMembers\(/)
  })

  it('helper-app.ts yardımcı mesajında notify çağırır', () => {
    const src = read('src/routes/helper-app.ts')
    expect(src).toMatch(/void notifyWeddingMembers\(/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/triggers.test.ts`
Expected: FAIL — `notifyWeddingMembers` hiç geçmiyor

- [ ] **Step 3: Wire RSVP trigger**

`backend/src/routes/guests.ts` — public RSVP route'unda `submitRsvp` başarılı döndükten **sonra**:

```ts
        /*
          RSVP bildirimi — `void` ile ARKA PLANDA.
          NEDEN await YOK: FCM yavaşlarsa davetli yanıt ekranında 20 sn
          bekler. Bildirim ikincil; kayıt çoktan yazıldı.
        */
        if (result !== null) {
          void notifyWeddingMembers(notifyDeps, {
            weddingId: req.params['weddingId'] ?? '',
            event: 'RSVP_RECEIVED',
            actorUserId: null,
          })
        }
```

`createGuestsRouter` imzasına `notifyDeps: NotifyDeps` eklenir ve `app.ts`'te geçirilir.

- [ ] **Step 4: Wire task triggers**

`backend/src/routes/tasks.ts`:

Atama sonrası (`assignTask` döndükten sonra):
```ts
      if (task !== null) {
        void notifyWeddingMembers(notifyDeps, {
          weddingId, event: 'TASK_ASSIGNED', actorUserId: req.auth?.userId ?? null,
        })
      }
```

Durum değişikliği sonrası (`updateTask` döndükten sonra):
```ts
      if (updated !== null) {
        void notifyWeddingMembers(notifyDeps, {
          weddingId, event: 'TASK_STATUS_CHANGED', actorUserId: req.auth?.userId ?? null,
        })
      }
```

- [ ] **Step 5: Wire helper message trigger**

`backend/src/routes/helper-app.ts` — `sendMessage` başarılıysa:

```ts
        if (message !== null) {
          /*
            Yalnız YARDIMCI yazdığında bildirim gider. Çift kendi
            yazdığı mesajın bildirimini almamalı; yardımcının hesabı
            olmadığı için ona push gönderilemez (spec §5.3 notu).
          */
          void notifyWeddingMembers(notifyDeps, {
            weddingId, event: 'TASK_MESSAGE', actorUserId: null,
          })
        }
```

`tasks.ts` içindeki çift mesaj yolunda da aynı blok, ama `sender.kind === 'HELPER'` koşuluyla (çift yazınca bildirim yok).

- [ ] **Step 6: Run tests**

Run: `cd backend && npx vitest run tests/notifications/triggers.test.ts`
Expected: PASS (3 test)

- [ ] **Step 7: Full backend suite**

Run: `cd backend && npx vitest run && npx tsc --noEmit`
Expected: hepsi PASS, exit 0

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/guests.ts backend/src/routes/tasks.ts backend/src/routes/helper-app.ts backend/src/app.ts backend/tests/notifications/triggers.test.ts
git commit -m "feat(push): dört olay tetikleyicisi — RSVP, atama, mesaj, durum"
```

---

### Task 8: Çıkışta token temizliği

**Files:**
- Modify: `backend/src/routes/admin.ts` — HAYIR, bu dosya admin içindir.
- Modify: `backend/src/routes/auth.ts` (`/auth/logout`)
- Test: `backend/tests/notifications/logout.test.ts`

**Interfaces:**
- Consumes: Task 2 `deleteAllForUser`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/notifications/logout.test.ts
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAuthRouter } from '../../src/routes/auth.js'

describe('logout push token temizliği', () => {
  it('çıkışta kullanıcının TÜM tokenları silinir', async () => {
    const deleteAllForUser = vi.fn(async () => undefined)
    const a = express()
    a.use(express.json())
    a.use(
      '/api/v1/auth',
      createAuthRouter({
        requireAuth: (req, _res, next) => { req.auth = { userId: 'u1' }; next() },
        deviceTokenDeps: { deleteAllForUser } as never,
        // ... diğer deps mevcut test kurulumundan
      } as never),
    )
    await request(a).post('/api/v1/auth/logout').send({})
    expect(deleteAllForUser).toHaveBeenCalledWith('u1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notifications/logout.test.ts`
Expected: FAIL — `deleteAllForUser` çağrılmıyor

- [ ] **Step 3: Wire logout cleanup**

`backend/src/routes/auth.ts` logout handler'ında, refresh token silindikten sonra:

```ts
      /*
        Push token'ları da silinir (spec: "çıkışta silinir").
        NEDEN SUNUCU TARAFINDA DA: istemci `DELETE /device` çağrısını
        unutsa (ağ hatası, uygulama kapanması) token DB'de kalır ve
        sonraki kullanıcıya bildirim gitmeye devam eder — o cihazda
        oturum açan başka biri bildirimleri alır.
      */
      await deps.deviceTokenDeps.deleteAllForUser(userId)
```

`createAuthRouter` imzasına `deviceTokenDeps: Pick<DeviceTokenDeps, 'deleteAllForUser'>` eklenir; `app.ts`'te geçirilir.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx vitest run tests/notifications/logout.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite**

Run: `cd backend && npx vitest run && npx tsc --noEmit`
Expected: PASS, exit 0

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/app.ts backend/tests/notifications/logout.test.ts
git commit -m "feat(push): çıkışta tüm cihaz tokenları silinir"
```

---

### Task 9: Mobil — KMP köprüsü ve no-op iOS

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/push/PushNotifications.kt`
- Create: `mobile/composeApp/src/androidMain/kotlin/com/lumibyte/dugunce/push/PushNotifications.android.kt`
- Create: `mobile/composeApp/src/iosMain/kotlin/com/lumibyte/dugunce/push/PushNotifications.ios.kt`
- Test: `mobile/composeApp/src/commonTest/kotlin/com/lumibyte/dugunce/push/PushNotificationsTest.kt`

**Interfaces:**
- Produces: `expect object PushNotifications { suspend fun requestPermission(): Boolean; suspend fun currentToken(): String? }`

- [ ] **Step 1: Write the failing test**

```kotlin
// commonTest/.../push/PushNotificationsTest.kt
package com.lumibyte.dugunce.push

import kotlin.test.Test
import kotlin.test.assertNotNull

class PushNotificationsTest {
    @Test
    fun `push koprusu tanimli`() {
        // Derleme kanıtı: `expect object` her hedefte `actual` bulmalı.
        // iOS'ta no-op olduğu için `currentToken()` null döner — bu
        // beklenen (spec §0: iOS push sonraki iş).
        assertNotNull(PushNotifications)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && ./gradlew :composeApp:allTests`
Expected: FAIL — `PushNotifications` unresolved

- [ ] **Step 3: Write the expect declaration**

`commonMain/.../push/PushNotifications.kt`:

```kotlin
package com.lumibyte.dugunce.push

/**
 * Platformdan bağımsız push köprüsü.
 *
 * `expect object` seçildi (top-level fonksiyon değil): izin durumu ve
 * token önbelleği platform tarafında tutuluyor; nesne kimliği bunu
 * taşımaya uygun.
 *
 * HER HEDEFTE `actual` ZORUNLU — `mobile/` iosArm64 ve iosSimulatorArm64
 * hedefliyor. iOS tarafında no-op yazılıyor (spec §0: Android-first),
 * yoksa iOS derlemesi kırılır.
 */
expect object PushNotifications {
    /** Kullanıcıdan bildirim izni ister. Verildiyse `true`. */
    suspend fun requestPermission(): Boolean

    /** FCM registration token. İzin yoksa / yapılandırma eksikse `null`. */
    suspend fun currentToken(): String?
}
```

- [ ] **Step 4: Write the iOS no-op**

`iosMain/.../push/PushNotifications.ios.kt`:

```kotlin
package com.lumibyte.dugunce.push

/**
 * iOS — NO-OP.
 *
 * Kapsam kararı (spec §0, 2026-11-05): önce yalnız Android. iOS push
 * ayrı bir iş (Apple Developer hesabı, APNs .p8, Xcode capability ve
 * serv00'da HTTP/2 çıkışının ölçülmesi gerekiyor).
 *
 * NEDEN YİNE DE YAZILIYOR: `expect object` tanımı TÜM hedeflerde
 * `actual` ister. Bu dosya olmadan iOS derlemesi kırılır — uygulama
 * iOS'ta çalışmaya devam etmeli, sadece push olmamalı.
 */
actual object PushNotifications {
    actual suspend fun requestPermission(): Boolean = false

    actual suspend fun currentToken(): String? = null
}
```

- [ ] **Step 5: Write the Android actual**

`androidMain/.../push/PushNotifications.android.kt` — `actual object`, iki iş:

```kotlin
actual suspend fun requestPermission(): Boolean
actual suspend fun currentToken(): String?
```

Kararlar:

- **`requestPermission`** — `Build.VERSION.SDK_INT < TIRAMISU` (API 33) ise
  `true` döner (izin yok). Üstündeyse `ContextCompat.checkSelfPermission`
  ile mevcut durumu okur; verilmemişse `ActivityResultContracts.RequestPermission`
  ile ister. `AppContextHolder.activity` null ise `false`.
- **`currentToken`** — `runCatching { suspendCancellableCoroutine { …
  FirebaseMessaging.getInstance().token … } }.getOrNull()`.
  `google-services.json` yoksa `getInstance()` FIRLATIR; `runCatching`
  bunu `null`'a çevirir → push sessizce kapalı, uygulama çalışır.
  Bu, dosyanın gizli olmasının doğal sonucu (depoyu klonlayan herkesde yok).

`PermissionRequester`, `androidMain/.../push/PermissionRequester.kt` içinde
`ActivityResultContracts.RequestPermission` kullanan küçük yardımcı
(Activity'ye bağlanır; ~25 satır).

- [ ] **Step 6: Run tests**

Run: `cd mobile && ./gradlew :composeApp:allTests`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/push/ mobile/composeApp/src/androidMain/kotlin/com/lumibyte/dugunce/push/ mobile/composeApp/src/iosMain/kotlin/com/lumibyte/dugunce/push/ mobile/composeApp/src/commonTest/kotlin/com/lumibyte/dugunce/push/
git commit -m "feat(mobile): push köprüsü — Android FCM, iOS no-op"
```

---

### Task 10: Gradle — koşullu google-services eklentisi

**Files:**
- Modify: `mobile/gradle/libs.versions.toml`
- Modify: `mobile/composeApp/build.gradle.kts`
- Modify: `mobile/composeApp/src/androidMain/AndroidManifest.xml`
- Test: `scripts/check-push-gradle.mjs` (yeni kontrol script'i)

**Interfaces:**
- Produces: `firebase-messaging` bağımlılığı; `google-services` eklentisi YALNIZ dosya varsa uygulanır.

- [ ] **Step 1: Write the failing check script**

`scripts/check-push-gradle.mjs`:

```js
#!/usr/bin/env node
/**
 * Push Gradle yapılandırma kontrolü.
 *
 * NEDEN: `google-services.json` GİZLİ bir dosya; depoda yok. Eklenti
 * koşulsuz uygulanırsa depoyu klonlayan herkesde ve CI'da DERLEME
 * KIRILIR. Bu kontrol o regresyonu yakalar.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const gradle = readFileSync(join(root, 'mobile/composeApp/build.gradle.kts'), 'utf8')
const manifest = readFileSync(
  join(root, 'mobile/composeApp/src/androidMain/AndroidManifest.xml'),
  'utf8',
)

let bad = 0
const fail = (m) => { console.error(`❌ ${m}`); bad += 1 }

// 1. Eklenti KOŞULLU olmalı
if (!/if\s*\(\s*file\("google-services\.json"\)\.exists\(\)\s*\)/.test(gradle)) {
  fail('google-services eklentisi KOŞULLU değil — dosya yokken derleme kırılır')
}

// 2. firebase-messaging bağımlılığı var mı
if (!/firebase-messaging/.test(gradle) && !/firebase\.messaging/.test(gradle)) {
  fail('firebase-messaging bağımlılığı yok')
}

// 3. POST_NOTIFICATIONS izni
if (!/android\.permission\.POST_NOTIFICATIONS/.test(manifest)) {
  fail('AndroidManifest.xml içinde POST_NOTIFICATIONS izni yok (Android 13+)')
}

if (bad === 0) {
  console.log('✅ Push Gradle yapılandırması doğru')
  process.exit(0)
}
console.error(`\n${bad} sorun`)
process.exit(1)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-push-gradle.mjs`
Expected: FAIL — 3 sorun

- [ ] **Step 3: Add versions**

`mobile/gradle/libs.versions.toml` — `[versions]` altına:

```toml
firebaseMessaging = "24.1.0"
googleServices = "4.4.2"
```

`[libraries]` altına:

```toml
firebase-messaging = { module = "com.google.firebase:firebase-messaging", version.ref = "firebaseMessaging" }
```

`[plugins]` altına:

```toml
googleServices = { id = "com.google.gms.google-services", version.ref = "googleServices" }
```

- [ ] **Step 4: Wire the plugin conditionally**

`mobile/composeApp/build.gradle.kts` — `plugins { }` bloğunun **hemen altına**:

```kotlin
/**
 * Google Services eklentisi YALNIZ `google-services.json` varsa.
 *
 * NEDEN KOŞULLU: dosya `.gitignore`'da (proje kimliği taşır). Depoyu
 * klonlayan herkesde ve CI'da dosya YOKTUR; eklenti koşulsuz uygulanırsa
 * `processDebugGoogleServices` görevi dosyayı bulamayıp derlemeyi
 * kırar. Push o zaman sessizce kapalı kalır — uygulama çalışır.
 */
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
```

`androidMain` bağımlılıklarına (mevcut `dependencies` bloğu içine):

```kotlin
    androidMain.dependencies {
        implementation(libs.firebase.messaging)
    }
```

- [ ] **Step 5: Add manifest permission**

`mobile/composeApp/src/androidMain/AndroidManifest.xml` — `INTERNET` izninin yanına:

```xml
    <!--
      Android 13+ (API 33) bildirim göstermek için ÇALIŞMA ZAMANI izni.
      İzin verilmezse uygulama çalışır, yalnız bildirim gösterilmez.
      `minSdk` 26 olduğu için kodda sürüm kontrolü yapılıyor.
    -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

- [ ] **Step 6: Run check to verify it passes**

Run: `node scripts/check-push-gradle.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/check-push-gradle.mjs mobile/gradle/libs.versions.toml mobile/composeApp/build.gradle.kts mobile/composeApp/src/androidMain/AndroidManifest.xml
git commit -m "feat(mobile): firebase-messaging + koşullu google-services eklentisi"
```

---

### Task 11: Token kaydı ve ayarlar ekranı

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/push/DeviceRegistrar.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/data/Repository.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/ui/screens/SettingsScreen.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/App.kt`
- Test: `mobile/composeApp/src/commonTest/kotlin/com/lumibyte/dugunce/push/DeviceRegistrarTest.kt`

**Interfaces:**
- Consumes: Task 9 `PushNotifications`; `Repository` mevcut `api` istemcisi.
- Produces: `DeviceRegistrar.register(repo): Unit`, `DeviceRegistrar.unregister(repo, token): Unit`

- [ ] **Step 1: Write the failing test**

```kotlin
// commonTest/.../push/DeviceRegistrarTest.kt
package com.lumibyte.dugunce.push

import kotlin.test.Test
import kotlin.test.assertNull

class DeviceRegistrarTest {
    @Test
    fun `token yoksa kayit denemesi yapilmaz`() = runTest {
        // iOS'ta `currentToken()` null döner (no-op). Kayıt ucu
        // ÇAĞRILMAMALI — boş token göndermek 400 üretir.
        var called = false
        val fake = FakeApi(onRegister = { called = true })
        DeviceRegistrar.registerWith(tokenProvider = { null }, api = fake)
        assertNull(null)
        kotlin.test.assertEquals(false, called)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && ./gradlew :composeApp:allTests --tests "*DeviceRegistrar*"`
Expected: FAIL — `DeviceRegistrar` unresolved

- [ ] **Step 3: Implement**

`commonMain/.../push/DeviceRegistrar.kt`:

```kotlin
package com.lumibyte.dugunce.push

/**
 * Cihaz token'ını sunucuya kaydeder.
 *
 * ÇAĞRI NOKTALARI:
 *  - Giriş sonrası (izin istenir, token alınır, kaydedilir)
 *  - Uygulama açılışı (token zaten varsa `last_seen_at` tazelenir)
 *  - Çıkış (silme)
 *
 * HATA YUTULUR: kayıt başarısız olursa uygulama çalışmaya devam eder;
 * push bir sonraki açılışta yeniden denenir. Kullanıcıya hata
 * göstermek anlamsız — yapabileceği bir şey yok.
 */
object DeviceRegistrar {
    suspend fun register(token: String?, api: PushApi): String? {
        if (token.isNullOrBlank()) return null
        return runCatching { api.registerDevice(token, "ANDROID"); token }.getOrNull()
    }

    suspend fun unregister(token: String?, api: PushApi) {
        if (token.isNullOrBlank()) return
        runCatching { api.deleteDevice(token) }
    }
}

/** Repository'nin push ile ilgili dar yüzeyi — test sahtelemesi kolay olsun. */
interface PushApi {
    suspend fun registerDevice(token: String, platform: String)
    suspend fun deleteDevice(token: String)
}
```

`Repository` bu arayüzü uygular (mevcut `api` istemcisini kullanarak `POST/DELETE /notifications/device`).

- [ ] **Step 4: Wire in App.kt — İZİN İLK AÇILIŞTA İSTENMEZ**

**Spec §6.3 kuralı:** "İlk açılışta DEĞİL. Kullanıcı dashboard'u ilk kez
gördükten sonra, ayarlarda açık bir 'Bildirimleri aç' satırı + bir kez
sorulan nazik istem."

NEDEN: ne olduğunu anlamadan sorulan izin reddediliyor; Android'de iki
kez reddedilirse bir daha SORULAMIYOR (kullanıcı ayarlara gitmeli).

```kotlin
    // SADECE TOKEN TAZELEME — izin İSTEMEZ.
    // Kullanıcı izin vermişse token vardır; vermemişse null döner ve
    // sessizce atlanır. İzin akışı ayarlar ekranından yürür.
    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            val token = PushNotifications.currentToken()
            DeviceRegistrar.register(token, repository)
        }
    }
```

İzin yalnız **ayarlar ekranındaki "Bildirimleri aç"** satırından istenir
(Step 5).

Çıkışta:

```kotlin
    onLogout = {
        scope.launch {
            DeviceRegistrar.unregister(PushNotifications.currentToken(), repository)
            // ... mevcut çıkış akışı
        }
    }
```

- [ ] **Step 5: Add settings rows**

`SettingsScreen.kt` — mevcut tema satırlarının deseniyle iki satır:

```kotlin
        SettingsRow(
            title = "Bildirimler",
            subtitle = "Düğün hareketlerinde telefonuna bildirim gelsin",
            trailing = { Switch(checked = notificationsOn, onCheckedChange = { ... }) },
        )
```

`notificationsOn` başlangıçta `PushNotifications.currentToken() != null`
ile belirlenir (izin DURUMU, izin İSTEMEDEN okunur). Kullanıcı anahtarı
açınca:
1. `PushNotifications.requestPermission()` — izin istenir (tek sefer)
2. izin verildiyse `PushNotifications.currentToken()` → `DeviceRegistrar.register(...)`
3. `PATCH /preferences { enabled: true }`

Kapatınca:
1. `PATCH /preferences { enabled: false }`
2. `DeviceRegistrar.unregister(...)` — token silinir

NEDEN İZİN BURADA: spec §6.3. İlk açılışta sormak, reddedilme oranını
yükseltir ve Android'de kalıcı redde yol açar.

- [ ] **Step 6: Run tests**

Run: `cd mobile && ./gradlew :composeApp:allTests`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/push/DeviceRegistrar.kt mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/data/Repository.kt mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/ui/screens/SettingsScreen.kt mobile/composeApp/src/commonMain/kotlin/com/lumibyte/dugunce/App.kt mobile/composeApp/src/commonTest/kotlin/com/lumibyte/dugunce/push/DeviceRegistrarTest.kt
git commit -m "feat(mobile): cihaz token kaydı ve bildirim ayarları"
```

---

### Task 12: Bildirim gösterimi — FirebaseMessagingService

**Files:**
- Create: `mobile/composeApp/src/androidMain/kotlin/com/lumibyte/dugunce/push/PushMessagingService.kt`
- Modify: `mobile/composeApp/src/androidMain/AndroidManifest.xml`
- Test: `mobile/composeApp/src/commonTest/kotlin/com/lumibyte/dugunce/push/NotificationPayloadTest.kt`

**Interfaces:**
- Consumes: `data.weddingId`, `data.type` (Task 5'ten gelir).
- Produces: `extractWeddingId(data: Map<String, String>): String?` — saf fonksiyon, test edilebilir.

- [ ] **Step 1: Write the failing test**

```kotlin
// commonTest/.../push/NotificationPayloadTest.kt
package com.lumibyte.dugunce.push

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NotificationPayloadTest {
    @Test
    fun `weddingId veriden okunur`() {
        assertEquals("w1", extractWeddingId(mapOf("weddingId" to "w1")))
    }

    @Test
    fun `weddingId yoksa null`() {
        assertNull(extractWeddingId(emptyMap()))
    }

    @Test
    fun `bos weddingId null sayilir`() {
        assertNull(extractWeddingId(mapOf("weddingId" to "")))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && ./gradlew :composeApp:allTests --tests "*NotificationPayload*"`
Expected: FAIL — `extractWeddingId` unresolved

- [ ] **Step 3: Implement**

`androidMain/.../push/PushMessagingService.kt`:

```kotlin
package com.lumibyte.dugunce.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Bildirim gösterimi.
 *
 * NEDEN GEREKLİ: FCM `notification` yükünü uygulama ARKA PLANDAYKEN
 * sistem kendisi gösterir; ÖN PLANDAYKEN göstermez. Ayrıca bildirime
 * dokunulduğunda doğru düğüne gitmek için `data` yükünü işlemek
 * gerekiyor. Bu servis ikisini de yapar.
 *
 * `onNewToken`: FCM token'ı yenilendiğinde sunucuya yeni token
 * gönderilmeli, yoksa eski token'a gönderim başarısız olur.
 */
class PushMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Sunucuya kayıt — uygulama açılışında da tekrar denenir.
        PushTokenBus.publish(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val weddingId = extractWeddingId(message.data)
        PushNotificationDisplayer.show(
            context = this,
            title = message.notification?.title ?: "Düğünce",
            body = message.notification?.body ?: "Yeni bir hareket var.",
            weddingId = weddingId,
        )
    }
}

/**
 * FCM `data` yükünden düğün kimliğini çıkarır.
 *
 * SAF FONKSİYON — `commonMain`'de değil ama test edilebilir: Android
 * tiplerine bağlı değil.
 *
 * Boş string `null` sayılır: sunucu `data.weddingId` göndermezse
 * `""` gelebilir ve boş bir kimlikle gezinme denemesi beyaz ekran
 * üretirdi.
 */
fun extractWeddingId(data: Map<String, String>): String? =
    data["weddingId"]?.takeIf { it.isNotBlank() }
```

`PushNotificationDisplayer` (~40 satır): `NotificationChannel` oluşturur (Android 8+), `PendingIntent` ile deep link üretir, bildirimi gösterir. İzin kontrolü (`POST_NOTIFICATIONS`) içerir.

- [ ] **Step 4: Register service in manifest**

`AndroidManifest.xml`, `<application>` içine:

```xml
        <service
            android:name=".push.PushMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
```

- [ ] **Step 5: Run tests**

Run: `cd mobile && ./gradlew :composeApp:allTests`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mobile/composeApp/src/androidMain/kotlin/com/lumibyte/dugunce/push/ mobile/composeApp/src/androidMain/AndroidManifest.xml mobile/composeApp/src/commonTest/kotlin/com/lumibyte/dugunce/push/NotificationPayloadTest.kt
git commit -m "feat(mobile): bildirim gösterimi + token yenileme"
```

---

### Task 13: Uçtan uca doğrulama ve rapor

**Files:**
- Modify: `.github/workflows/mobile-ci.yml` (yeni kontrol script'i ekle)
- Create: `.superpowers/sdd/2026-11-05-mobil-push/report.md`

- [ ] **Step 1: Add check script to CI**

`.github/workflows/mobile-ci.yml` — mevcut "Kotlin import kontrolü" adımının yanına:

```yaml
      - name: Push Gradle yapılandırması
        run: node scripts/check-push-gradle.mjs
```

`paths` filtresine de ekle:

```yaml
      - 'scripts/check-push-gradle.mjs'
```

- [ ] **Step 2: Run full local verification**

```bash
cd backend && npx vitest run && npx tsc --noEmit
cd ../mobile && ./gradlew :composeApp:allTests
cd .. && node scripts/check-push-gradle.mjs && node scripts/check-kotlin-imports.mjs
```
Expected: hepsi PASS

- [ ] **Step 3: Push and watch CI**

```bash
git add .github/workflows/mobile-ci.yml
git commit -m "ci: push gradle kontrolü"
git push origin master
gh run watch
```
Expected: `mobile-ci` ve `backend-ci` **success**

- [ ] **Step 4: Deploy backend**

```bash
gh workflow run deploy-backend.yml -f confirm=deploy
gh run list --workflow=deploy-backend.yml --limit 1
```
Expected: success

- [ ] **Step 5: Write report**

`.superpowers/sdd/2026-11-05-mobil-push/report.md` — gerçek çıktılarla:
- Test sayıları
- CI run ID'leri
- Deploy sonucu
- **Gerçek cihaz testi** (aşağıdaki adım yapıldıysa)

- [ ] **Step 6: Manual device verification (kullanıcıyla)**

Bu adım **CI'da yapılamaz**; gerçek telefon gerekir:

1. Uygulamayı kur, giriş yap
2. Bildirim iznini ver
3. Firebase konsolu → Cloud Messaging → test bildirimi gönder
4. Telefona düştüğünü doğrula
5. Bir davetli linkini aç, RSVP ver → çiftin telefonuna "Yeni RSVP yanıtı" düşmeli

Rapora **"elle doğrulandı"** veya **"doğrulanmadı"** olarak yaz — abartma.

- [ ] **Step 7: Final commit**

```bash
git add .superpowers/sdd/2026-11-05-mobil-push/report.md
git commit -m "docs: push bildirimleri uygulama raporu"
```
