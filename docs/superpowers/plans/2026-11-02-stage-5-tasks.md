# Düğünce — Aşama 5: Yardımcı ve Görevler

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çiftin yardımcılara görev verebildiği, yardımcının **uygulama kurmadan ve hesap açmadan** token'lı link ile kendi görevlerini görüp güncelleyebildiği ve o görev üzerinde çift ile sohbet edebildiği bir modül kurmak.

**Architecture:** `helper` tablosu `users`'a **girmez** — yardımcının hesabı yoktur, erişimi yalnızca hash'lenmiş token iledir (SECURITY §1.2). `task` görev başına **tek sorumlu** taşır (`UNIQUE`). `message` hem `wedding_id` hem `task_id` taşır (composite FK) ve erişimi `task.assigned_at` ile sınırlanır — yeniden atamada yeni yardımcı önceki konuşmayı **görmez** (SECURITY §10.3 #4b).

**Tech Stack:** Drizzle ORM, PostgreSQL 16, Zod, Vitest, PGlite.

**Spec:** `docs/SECURITY.md` §1.2 (token), §10.3 (görev sohbeti), §10.4 (ilişkiler) · `docs/superpowers/specs/2026-11-02-dugunce-design.md` §7 (veri modeli), "Yardımcı görünürlüğü", §9 (limitler)

---

## Global Constraints

- **Yardımcı `users` tablosuna GİRMEZ** — hesap yok, giriş yok, sadece token
- **Ham token asla DB'de** — yalnızca SHA-256 hash (SECURITY §1.2)
- **Token ≥128 bit entropi** — `generateToken()` (256 bit)
- **Görev başına TEK sorumlu** (v1) — `UNIQUE (task_id)` atama tablosunda
- **Yeniden atamada geçmiş görünmez** — mesaj erişimi `assigned_at`'ten sonrası
- **Mesaj max 4000 karakter**, HTML çalıştırılmaz
- **Mesaj idempotency** — `idempotency_key` tekrar gönderimde kopya oluşturmaz
- **Sayfalama zorunlu** — mesajlar asla tamamı birden dönmez
- **Yardımcı yalnızca KENDİ görevlerini görür** — diğer yardımcıları görmez
- **Tüm çift tarafı sorgular `wedding_id` + `userId`** (defense in depth)
- **404, 403 değil** — varlık sızdırmaz
- **Ücretsiz limit: 1 yardımcı, 1 görev** (premium: 5 yardımcı, sınırsız görev)
- Test: **Vitest**, her görev testleri geçmeden tamam değil
- Türkçe kullanıcı metni, İngilizce kod

---

## SECURITY §10.3'ün açık bıraktığı noktalar — bu planda karara bağlandı

| # | Soru | Karar | Gerekçe |
|---|---|---|---|
| 1 | Sayfalama yönü | **`before` cursor, geriye doğru** | Sohbet en yeniden eskiye okunur; yeni mesaj eklenince önceki sayfa kaymaz |
| 2 | Sayfa boyutu | Varsayılan **30**, azami **100** | 4000 karakter × 30 = 120 KB üst sınır, serv00 için makul |
| 3 | Görev silinince mesajlar | **CASCADE** | Görev yoksa konuşma bağlamsız; KVKK açısından da temiz |
| 4 | Yardımcı silinince mesajlar | **`sender_helper_id` SET NULL**, mesaj kalır | Çiftin konuşma kaydı bozulmasın; yazar "silinmiş yardımcı" görünür |
| 5 | Okundu bilgisi | `read_at` **sadece çift tarafı** yazar | Yardımcı "okudum" demek zorunda değil; çift takip eder |
| 6 | Yardımcı kendi kendine görev alabilir mi? | **Hayır** | Atama yalnızca çift tarafından. Aksi halde yetki yükseltme |
| 7 | Yardımcı görevi silebilir mi? | **Hayır** — yalnızca `status` değiştirir | Silme geri alınamaz; çift karar verir |
| 8 | Aynı yardımcıya iki görev | **Serbest** | Limit görev sayısına, atama sayısına değil |

---

## Review Focus

Bu 5 durum en olası kırılma noktaları:

1. **Yeniden atamada geçmiş sızıntısı** — görev B yardımcısına geçince B, A'nın konuşmasını görmemeli. `assigned_at` filtresi unutulursa özel konuşma ifşa olur. (Task 7)
2. **Yardımcı başka yardımcının görevini görür** — token ile gelen yardımcı, `task_id` tahmin ederek başkasının görevine erişmemeli. Her sorgu `assignee_helper_id` ile kapsamlı. (Task 6)
3. **Mesaj idempotency** — ağ tekrarında aynı mesaj iki kez yazılmamalı. (Task 8)
4. **Token enumeration** — yardımcı token'ı tahmin edilirse tüm görevler sızar. 256-bit + hash. (Task 4)
5. **Sayfalama olmadan mesaj çekme** — 10.000 mesajlık görevde tek istekte tümü dönerse serv00 boğulur. (Task 9)

---

## Dosya Yapısı

```
backend/src/
├── db/
│   └── schema.ts           # + helpers, tasks, messages
├── helpers/
│   ├── service.ts          # yardımcı CRUD (çift tarafı), limit
│   ├── token.ts            # token üretimi/doğrulama
│   └── store.ts            # Drizzle
├── tasks/
│   ├── service.ts          # görev CRUD, atama
│   ├── helper-view.ts      # yardımcıya açık beyaz liste
│   └── store.ts            # Drizzle
├── messages/
│   ├── service.ts          # mesaj gönder/listele, idempotency
│   └── store.ts            # Drizzle
└── routes/
    ├── helpers.ts          # /weddings/:id/helpers (çift)
    ├── tasks.ts            # /weddings/:id/tasks (çift)
    ├── helper-app.ts       # /helper/:token/* (yardımcı, auth yok)
    └── messages.ts         # görev mesajları (her iki taraf)
```

---

## Task 1: Yardımcı ve görev şeması + migration

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/0004_*.sql`
- Test: `backend/tests/db/schema-tasks.test.ts`

**Interfaces:**
- Consumes: Aşama 2 `weddings`, Aşama 4 composite FK deseni
- Produces: `helpers`, `tasks`, `messages` tabloları

- [ ] **Step 1: Failing test yaz**

```ts
describe('helpers şeması', () => {
  it('wedding_id taşır ve composite unique hedefi verir')
  it('access_token_hash UNIQUE — aynı token iki yardımcıya verilemez')
  it('HAM token kolonu YOK (SECURITY §1.2)')
  it('token_revoked_at nullable')
  it('last_seen_at nullable')
})

describe('tasks şeması', () => {
  it('assignee_helper_id nullable — atanmamış görev olabilir')
  it('status varsayılan TODO')
  it('assigned_at nullable — yeniden atama sınırı')
  it('COMPOSITE FK (assignee_helper_id, wedding_id) → helpers(id, wedding_id)')
  it('COMPOSITE UNIQUE (id, wedding_id) — mesaj FK hedefi')
})

describe('messages şeması', () => {
  it('wedding_id ZORUNLU (composite FK için)')
  it('task_id ZORUNLU')
  it('sender_kind COUPLE | HELPER')
  it('sender_user_id ve sender_helper_id nullable — biri dolu olmalı')
  it('body max 4000 — CHECK kısıtı')
  it('idempotency_key nullable, UNIQUE (task_id, idempotency_key)')
  it('COMPOSITE FK (task_id, wedding_id) → tasks(id, wedding_id) CASCADE')
})
```

- [ ] **Step 2: Şema**

```ts
export const helpers = pgTable('helpers', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  accessTokenHash: text('access_token_hash').notNull().unique(),
  tokenRevokedAt: timestamp('token_revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idWeddingUnique: unique('helpers_id_wedding_unique').on(t.id, t.weddingId),
  weddingIdx: index('helpers_wedding_idx').on(t.weddingId),
}))

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  assigneeHelperId: uuid('assignee_helper_id'),
  status: text('status').notNull().default('TODO'),  // TODO | DOING | DONE
  dueDate: timestamp('due_date', { withTimezone: true }),
  priority: text('priority').notNull().default('NORMAL'), // LOW | NORMAL | HIGH
  /** Yeniden atamada mesaj erişim sınırı (SECURITY §10.3 #4b). */
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  idWeddingUnique: unique('tasks_id_wedding_unique').on(t.id, t.weddingId),
  assigneeFk: foreignKey({
    columns: [t.assigneeHelperId, t.weddingId],
    foreignColumns: [helpers.id, helpers.weddingId],
    name: 'tasks_assignee_fk',
  }).onDelete('set null'),
  weddingIdx: index('tasks_wedding_idx').on(t.weddingId),
  assigneeIdx: index('tasks_assignee_idx').on(t.assigneeHelperId),
}))

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull(),
  taskId: uuid('task_id').notNull(),
  senderKind: text('sender_kind').notNull(),  // COUPLE | HELPER
  senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
  senderHelperId: uuid('sender_helper_id').references(() => helpers.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  idempotencyKey: text('idempotency_key'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  taskFk: foreignKey({
    columns: [t.taskId, t.weddingId],
    foreignColumns: [tasks.id, tasks.weddingId],
    name: 'messages_task_fk',
  }).onDelete('cascade'),
  idemUnique: unique('messages_task_idem_unique').on(t.taskId, t.idempotencyKey),
  taskIdx: index('messages_task_idx').on(t.taskId, t.createdAt),
}))
```

**Kritik:** `body` uzunluk sınırı DB'de de olmalı — uygulama katmanı atlanırsa DB reddetsin. Migration'a `CHECK (char_length(body) <= 4000)` ekle.

- [ ] **Step 3: Migration üret ve composite FK'ları doğrula**

```bash
npx drizzle-kit generate
npm run verify:migrations
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(db): add helpers, tasks and messages schema"
```

---

## Task 2: Yardımcı servisi (çift tarafı)

**Files:**
- Create: `backend/src/helpers/service.ts`
- Test: `backend/tests/helpers/service.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: `validateHelperInput`, `createHelper`, `listHelpers`, `renameHelper`, `revokeHelper`, `deleteHelper`

- [ ] **Step 1: Failing test yaz**

```ts
describe('validateHelperInput', () => {
  it('isim zorunlu, boş olamaz')
  it('isim 60 karakteri aşamaz')
  it('Türkçe karakterler korunur')
  it('baş/son boşluk kırpılır')
})

describe('createHelper', () => {
  it('yardımcı oluşturur, ham token BİR KEZ döner')
  it('DB\'ye yalnızca hash yazılır')
  it('token 43 karakter base64url (256 bit)')
  it('ücretsiz planda 1 yardımcı sınırı')
  it('premium planda 5 yardımcı')
  it('limit aşımında HelperLimitError')
  it('transaction içinde çalışır')
})

describe('listHelpers', () => {
  it('sorgu weddingId + userId ile (IDOR)')
  it('revoke edilmişleri de döner (geçmiş için)')
})

describe('revokeHelper', () => {
  it('token_revoked_at yazar')
  it('revoke sonrası token çözülemez')
  it('görevler kalır (atama SET NULL)')
})
```

- [ ] **Step 2: Limit sabitleri**

```ts
export const FREE_HELPER_LIMIT = 1
export const PREMIUM_HELPER_LIMIT = 5

export class HelperLimitError extends Error {
  constructor(public readonly limit: number, public readonly current: number) {
    super(`Planınızda en fazla ${limit} yardımcı ekleyebilirsiniz (şu an ${current}).`)
    this.name = 'HelperLimitError'
  }
}
```

- [ ] **Step 3: Token üretimi — Aşama 4 desenini izle**

```ts
const token = generateToken()          // 256 bit, 43 karakter base64url
const accessTokenHash = hashToken(token)
// ham token YALNIZCA dönüşte görünür
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(helpers): add helper CRUD with token and limit"
```

---

## Task 3: Görev servisi (çift tarafı)

**Files:**
- Create: `backend/src/tasks/service.ts`
- Test: `backend/tests/tasks/service.test.ts`

**Interfaces:**
- Consumes: Task 1, 2
- Produces: `validateTaskInput`, `createTask`, `listTasks`, `updateTask`, `assignTask`, `deleteTask`

- [ ] **Step 1: Failing test yaz**

```ts
describe('createTask', () => {
  it('görev oluşturur, status TODO başlar')
  it('ücretsiz planda 1 görev sınırı')
  it('premium planda sınırsız')
  it('atanmış görev oluşturulabilir (assigned_at yazılır)')
})

describe('assignTask (Review Focus #1 hazırlığı)', () => {
  it('atama yapılınca assigned_at YAZILIR')
  it('yeniden atamada assigned_at GÜNCELLENİR')
  it('atama kaldırılınca assigned_at NULL olur')
  it('başka düğünün yardımcısına atanamaz (composite FK)')
  it('revoke edilmiş yardımcıya atanamaz')
})

describe('updateTask', () => {
  it('status TODO→DOING→DONE geçişleri')
  it('geçersiz status reddedilir')
  it('üye olunmayan görev null döner (404)')
  it('boş patch hata fırlatır')
})

describe('deleteTask', () => {
  it('soft delete')
  it('mesajlar CASCADE ile gider (DB testi)')
})
```

- [ ] **Step 2: `assignTask` — `assigned_at` kritik**

```ts
/**
 * Görevi yardımcıya atar.
 *
 * `assigned_at` HER atamada güncellenir — mesaj erişimi bu andan
 * sonrasıyla sınırlıdır (SECURITY §10.3 #4b). Güncellenmezse yeni
 * yardımcı önceki yardımcının konuşmasını görür.
 */
export async function assignTask(params, deps) {
  const task = await deps.findById(params.taskId, params.weddingId, params.userId)
  if (!task) return null

  if (params.helperId === null) {
    return deps.updateTask(params.taskId, { assigneeHelperId: null, assignedAt: null })
  }

  const helper = await deps.findHelper(params.helperId, params.weddingId)
  if (!helper) throw new Error('Yardımcı bulunamadı')
  if (helper.tokenRevokedAt) throw new Error('Erişimi kapatılmış yardımcıya görev atanamaz')

  return deps.updateTask(params.taskId, {
    assigneeHelperId: params.helperId,
    assignedAt: new Date(),   // ← HER atamada
  })
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(tasks): add task CRUD with assignment and assigned_at tracking"
```

---

## Task 4: Yardımcı token'ı — üretim ve doğrulama

**Files:**
- Create: `backend/src/helpers/token.ts`
- Test: `backend/tests/helpers/token.test.ts`

**Interfaces:**
- Consumes: Aşama 2 `lib/crypto.ts`
- Produces: `resolveHelperToken`

- [ ] **Step 1: Failing test yaz**

```ts
describe('resolveHelperToken (Review Focus #4)', () => {
  it('geçerli token yardımcıyı döner')
  it('sorgu HASH ile yapılır, ham token ile değil')
  it('bilinmeyen token null')
  it('revoke edilmiş token null')
  it('silinmiş düğünün yardımcısı null')
  it('boş token null, sorgu yapılmaz')
  it('last_seen_at güncellenir (yan etki KAYIT, okuma değil)')
})
```

- [ ] **Step 2: Doğrulama — üç kapı**

```ts
export async function resolveHelperToken(rawToken, deps) {
  if (!rawToken) return null
  const hash = hashToken(rawToken)
  const row = await deps.findByTokenHash(hash)
  if (!row) return null
  if (row.tokenRevokedAt) return null
  if (row.wedding.deletedAt) return null
  return row
}
```

- [ ] **Step 3: `last_seen_at` — dikkatli**

`last_seen_at` her istekte yazılırsa gereksiz DB yükü olur. **5 dakikada bir** güncelle:

```ts
if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
  await deps.touchLastSeen(row.id)   // await etme — yan etki kritik değil
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(helpers): add helper token resolution"
```

---

## Task 5: Yardımcıya açık görev görünümü (beyaz liste)

**Files:**
- Create: `backend/src/tasks/helper-view.ts`
- Test: `backend/tests/tasks/helper-view.test.ts`

**Neden ayrı görev:** Yardımcıya dönen gövde beyaz liste olmalı. Tüm satırı döndürmek `wedding_id`, `created_by`, diğer yardımcıların id'lerini sızdırır.

- [ ] **Step 1: Failing test yaz**

```ts
describe('toHelperTaskView', () => {
  it('başlık, açıklama, durum, öncelik, tarih döner')
  it('çift isimleri döner (kim için çalıştığını bilsin)')
  it('wedding_id DÖNMEZ')
  it('created_by DÖNMEZ')
  it('assignee_helper_id DÖNMEZ (kendisi olduğunu bilmesi yeter)')
  it('diğer yardımcıların bilgisi DÖNMEZ')
  it('yalnızca beyaz listedeki alanlar döner')
})
```

- [ ] **Step 2: Beyaz liste**

```ts
export const HELPER_TASK_FIELDS = [
  'id', 'title', 'description', 'status', 'priority',
  'dueDate', 'coupleNames', 'weddingDate', 'venueName',
  'createdAt', 'updatedAt',
] as const
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(tasks): add whitelisted helper task view"
```

---

## Task 6: Yardımcı uçları — kendi görevleri (Review Focus #2)

**Files:**
- Create: `backend/src/routes/helper-app.ts`
- Test: `backend/tests/e2e/helper-app.test.ts`

**Interfaces:**
- Consumes: Task 4, 5
- Produces: `GET /helper/:token/tasks`, `PATCH /helper/:token/tasks/:taskId`

- [ ] **Step 1: Failing test yaz**

```ts
describe('GET /helper/:token/tasks (Review Focus #2)', () => {
  it('yalnızca KENDİ görevlerini döner')
  it('başka yardımcının görevi listede YOK')
  it('atanmamış görevler görünmez')
  it('silinmiş görevler görünmez')
  it('bilinmeyen token 404')
  it('revoke token 404')
})

describe('PATCH /helper/:token/tasks/:taskId', () => {
  it('kendi görevinin status\'unu değiştirir')
  it('BAŞKASININ görevini değiştiremez → 404')
  it('başlık/açıklama DEĞİŞTİREMEZ → 400')
  it('atanmamış görevi değiştiremez → 404')
  it('silinemez (DELETE yok)')
})
```

- [ ] **Step 2: Yetki sınırı — kritik**

```ts
// Yardımcı YALNIZCA status değiştirebilir.
// Başlık, açıklama, atama, tarih → çift karar verir.
const ALLOWED_HELPER_PATCH = ['status'] as const

if (Object.keys(body).some((k) => !ALLOWED_HELPER_PATCH.includes(k))) {
  throw new AppError(400, 'BAD_REQUEST', 'Yardımcı yalnızca görev durumunu değiştirebilir')
}
```

- [ ] **Step 3: Her sorgu `assignee_helper_id` ile kapsamlı**

```ts
// task_id tahmin edilse bile başkasının görevi dönmez
WHERE task.id = $taskId
  AND task.wedding_id = $weddingId
  AND task.assignee_helper_id = $helperId   // ← ZORUNLU
  AND task.deleted_at IS NULL
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add helper-scoped task endpoints"
```

---

## Task 7: Mesajlaşma + yeniden atama sınırı (Review Focus #1)

**Files:**
- Create: `backend/src/messages/service.ts`
- Test: `backend/tests/messages/service.test.ts`

**Interfaces:**
- Consumes: Task 1, 3
- Produces: `validateMessageBody`, `sendMessage`, `listMessages`

- [ ] **Step 1: Failing test yaz**

```ts
describe('sendMessage — idempotency (Review Focus #3)', () => {
  it('aynı idempotency_key ile iki kez → TEK satır')
  it('farklı key ile iki kez → İKİ satır')
  it('key yoksa her seferinde yeni satır')
  it('idempotent tekrar mevcut mesajı döner')
})

describe('sendMessage — doğrulama', () => {
  it('boş gövde reddedilir')
  it('4001 karakter reddedilir')
  it('4000 karakter kabul edilir')
  it('HTML escape edilir (çalıştırılmaz)')
})

describe('listMessages — yeniden atama sınırı (Review Focus #1)', () => {
  it('yardımcı YALNIZCA assigned_at SONRASI mesajları görür')
  it('yeniden atamada yeni yardımcı önceki konuşmayı GÖRMEZ')
  it('çift TÜM mesajları görür (sınır yok)')
  it('sayfalama olmadan tam liste DÖNMEZ')
})

describe('listMessages — sayfalama (Review Focus #5)', () => {
  it('varsayılan 30 mesaj döner')
  it('before cursor ile geriye gider')
  it('100\'den fazla istenirse 100 döner')
  it('sıralama yeniden eskiye')
})
```

- [ ] **Step 2: `assigned_at` filtresi — bu aşamanın en kritik satırı**

```ts
/**
 * Mesajları listeler.
 *
 * KRİTİK (SECURITY §10.3 #4b): Yardımcı YALNIZCA kendi atama anından
 * sonraki mesajları görür. Görev el değiştirdiyse yeni yardımcı önceki
 * yardımcının özel konuşmasını GÖRMEZ.
 *
 * Bu filtre unutulursa mahremiyet ihlali olur — sessiz ve fark edilmesi
 * zor bir sızıntı.
 */
const since = viewer.kind === 'HELPER' ? task.assignedAt : null
if (viewer.kind === 'HELPER' && !since) {
  return []   // atanmamış görevin mesajı yardımcıya görünmez
}
```

- [ ] **Step 3: Sayfalama**

```ts
export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 100

// before cursor: bu id'den ÖNCEKİ mesajlar (yeniden eskiye)
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(messages): add task messaging with idempotency and assignment boundary"
```

---

## Task 8: Mesaj uçları (her iki taraf)

**Files:**
- Modify: `backend/src/routes/tasks.ts`, `backend/src/routes/helper-app.ts`
- Test: `backend/tests/e2e/messages-routes.test.ts`

- [ ] **Step 1: Route tablosu**

**Çift tarafı:**
| Method | Path | Açıklama |
|---|---|---|
| GET | `/weddings/:id/tasks/:taskId/messages` | Sayfalı liste |
| POST | `/weddings/:id/tasks/:taskId/messages` | Gönder |

**Yardımcı tarafı:**
| Method | Path | Açıklama |
|---|---|---|
| GET | `/helper/:token/tasks/:taskId/messages` | Sayfalı liste (sınırlı) |
| POST | `/helper/:token/tasks/:taskId/messages` | Gönder |

- [ ] **Step 2: `sender_kind` sunucuda belirlenir, istemciden ALINMAZ**

```ts
// Çift uçlarında: senderKind='COUPLE', senderUserId=req.auth.userId
// Yardımcı uçlarında: senderKind='HELPER', senderHelperId=helper.id
// İstemci bu alanları gönderemez — gönderse de yok sayılır.
```

- [ ] **Step 3: Rate limit**

`RATE_LIMITS`'a ekle:
- `messageSendByUser`: 60/dk (çift)
- `messageSendByHelper`: 30/dk (yardımcı)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add message routes for couple and helper"
```

---

## Task 9: Drizzle store (gerçek Drizzle testi)

**Files:**
- Create: `backend/src/helpers/store.ts`, `backend/src/tasks/store.ts`, `backend/src/messages/store.ts`
- Test: `backend/tests/tasks/store.test.ts`, `backend/tests/messages/store.test.ts`

**Dikkat (Aşama 3-4 dersi):** Ham SQL çalıştıran testler Drizzle join'ini kanıtlamaz. Gerçek store test edilir, negatif kontrol yapılır.

- [ ] **Step 1: Her store metodu `tx` alıyorsa onu kullanır**

Aşama 4'te 5 kez aynı hata çıktı: `tx` alınıp dış `db` kullanılıyor → PGlite'ta kilitlenme. Store yazılırken her metot kontrol edilir.

- [ ] **Step 2: Gerçek DB testleri**

```ts
it('yardımcı yalnızca kendi görevlerini görür (IDOR)')
it('yeniden atamada mesaj sınırı DB seviyesinde çalışır')
it('composite FK yanlış wedding_id reddeder')
it('CASCADE: görev silinince mesajlar gider')
it('SET NULL: yardımcı silinince mesaj kalır, yazar null olur')
it('idempotency UNIQUE kısıtı çalışır')
it('body CHECK kısıtı 4001 karakteri reddeder')
```

- [ ] **Step 3: Negatif kontrol** — `assigned_at` filtresini kaldır, testin kırıldığını doğrula.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(tasks): add drizzle stores with tenant isolation"
```

---

## Task 10: Yardımcı web sayfası (PWA)

**Files:**
- Create: `frontend/public/h/index.html`
- Modify: `frontend/public/_headers`

**Neden ayrı görev:** Yardımcı **uygulama kurmaz** (design "Yardımcı web sayfası"). Token'lı link ile açılır, görevleri görür, durum değiştirir, sohbet eder.

- [ ] **Step 1: Sayfa**

Aşama 4'teki davetiye sayfası desenini izle:
- Token `#fragment`'te
- `noindex`, `no-referrer`
- Open Graph yok
- Türkçe arayüz

- [ ] **Step 2: İşlevler**

| Bölüm | İçerik |
|---|---|
| Başlık | "Merhaba {yardımcı adı}" + çift isimleri |
| Görev listesi | Kendi görevleri, durum rozetleri |
| Görev detayı | Açıklama, tarih, durum değiştirme |
| Sohbet | Sayfalı mesajlar, gönderme |

- [ ] **Step 3: `_headers`**

```
/h/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): add helper task PWA page"
```

---

## Task 11: Aşama 5 kapanış kontrolü

**Files:**
- Create: `docs/STAGE-5-COMPLETE.md`

- [ ] **Step 1: Kabul listesi**

- [ ] Yardımcı `users` tablosuna girmiyor (hesap yok)
- [ ] Ham token DB'de yok, yalnızca SHA-256 hash
- [ ] Token ≥128 bit entropi
- [ ] Görev başına tek sorumlu (`UNIQUE`)
- [ ] **Yeniden atamada yeni yardımcı önceki konuşmayı görmüyor**
- [ ] Yardımcı yalnızca kendi görevlerini görüyor
- [ ] Yardımcı yalnızca `status` değiştirebiliyor
- [ ] Mesaj idempotency çalışıyor
- [ ] Mesaj max 4000 karakter (uygulama + DB CHECK)
- [ ] Sayfalama zorunlu, varsayılan 30
- [ ] Görev silinince mesajlar CASCADE
- [ ] Yardımcı silinince mesaj kalır, yazar null
- [ ] Ücretsiz limit: 1 yardımcı + 1 görev
- [ ] Tüm testler geçiyor
- [ ] Typecheck temiz

- [ ] **Step 2: Canlıda doğrula**

- Yardımcı oluştur, token al
- `/h#token` sayfasını aç
- Görev ata, durum değiştir, mesaj gönder
- Yeniden ata, eski konuşmanın görünmediğini doğrula

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: stage 5 completion record"
```

---

## Sonraki Plan

**Aşama 2.5 — Satın alma** (`stage-2.5-purchase.md`): Play Billing + StoreKit 2, makbuz doğrulama, `wedding.plan` güncelleme. Limitler artık **üç yerde** uygulanmış olacak (30 davetli / 1 yardımcı / 1 görev) — satın almanın kapısı hazır.

**Aşama 6 — Görev fotoğrafları** (`stage-6-photos.md`): R2 presigned URL, 50 MB/500 MB kota.

---

## Notlar

**Neden yardımcı `users`'a girmiyor?**
Hesap = parola = sıfırlama = MFA = destek yükü. Yardımcı zaten WhatsApp'tan link alıyor; o link yeterli kimlik. `users`'a girseydi her yardımcı için tam auth akışı gerekirdi (magic link, refresh token, oturum yönetimi) ve bu, ürünün en basit parçasını en karmaşık hâle getirirdi.

**Neden `assigned_at` bu kadar kritik?**
Yeniden atamada görev B'ye geçtiğinde, B önceki konuşmayı görürse A'nın özel konuşması ifşa olur. Örnek: A "bu aileyle uğraşmak zor" yazmış, görev B'ye geçmiş, B bunu okuyor. `assigned_at` filtresi bunu engeller — ve unutulursa **sessiz** bir mahremiyet ihlali olur, hata vermez.

**Neden tek sorumlu (v1)?**
Çoklu atama join table ister, "kim ne zaman gördü" karmaşıklaşır, `assigned_at` sınırı anlamsızlaşır (her atama için ayrı sınır). v1'de tek sorumlu; çoklu atama v1.1'de kendi tasarımıyla gelir.

**Neden sayfalama zorunlu, "opsiyonel" değil?**
Bir görevde 6 ay boyunca 5.000 mesaj birikebilir. Sayfalama olmadan tek istek 20 MB JSON üretir, serv00'ın 10 bağlantılık havuzunu tıkar. Zorunlu kılmak, "unutulunca çalışır ama yavaş" durumunu imkânsız kılar.

**Neden `last_seen_at` 5 dakikada bir?**
Her istekte yazmak, okuma ağırlıklı bir uçta gereksiz yazma yükü demek. 5 dakika, "çift yardımcının uygulamayı açıp açmadığını görsün" için yeterli hassasiyet.
