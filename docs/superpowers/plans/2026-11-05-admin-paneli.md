# Admin Paneli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ürün sahibinin tek başına kullanacağı bir admin paneli kurmak — parola girişi, dashboard, kullanıcı/düğün listeleri, **premium aktivasyonu** ve değiştirilemez denetim kaydı — `dugunce.com.tr/spa/` altında.

**Architecture:** Üç yeni tablo (`admin_accounts`, `admin_sessions`, `audit_logs`) + Argon2id parola + HttpOnly cookie oturumu (mevcut yardımcı oturumu deseninin kopyası) + `/api/v1/admin/*` uçları. SPA `admin/` kaynak dizininde Vite + React 19; build çıktısı `frontend/public/spa/` (commit edilmez, CI üretir).

**Tech Stack:** TypeScript + Express + Drizzle ORM + Zod + Argon2id (`@node-rs/argon2`, kurulu) + PostgreSQL; React 19 + Vite + TypeScript; Vitest, PGlite, Node kontrol scriptleri.

**Spec:** `docs/superpowers/specs/2026-11-05-admin-paneli-design.md`

## Global Constraints

- **SPA adresi** `https://dugunce.com.tr/spa/`; Vite `base: '/spa/'`, `build.outDir: '../frontend/public/spa'`.
- **Build çıktısı commit edilmez** — `.gitignore`'a `frontend/public/spa/` girer; CI build eder.
- **CORS zorunlu**: SPA `dugunce.com.tr`, API `api.dugunce.com.tr` — farklı origin. `corsForAdmin` beyaz listesi: `https://dugunce.com.tr`, `https://www.dugunce.com.tr`, `http://localhost:5173`.
- **Cookie**: `a_session` (HttpOnly), `a_csrf` (JS okur). `SameSite=None; Secure` üretimde, `Lax` yerelde — mevcut `helpers/session.ts:cookieString` deseni.
- **Oturum süreleri (2FA yok)**: boşta kalma **30 dk**, mutlak tavan **8 saat**, kayan eşik **25 dk**.
- **Parola en az 16 karakter**, en az 1 harf + 1 rakam. Argon2id.
- **5 başarısız denemede hesap kilitlenir** (15 dk).
- **İlk admin yalnız CLI ile** — web'den admin oluşturma ucu YOK.
- **2FA v1'de yok**; `totp_secret`, `totp_enabled_at`, `recovery_codes` sütunları **eklenir ama kullanılmaz**.
- **Audit değiştirilemez** — store'da `update`/`delete` fonksiyonu yok.
- **Beyaz liste yanıtlar**: `...row` ASLA; parola hash'i, TOTP secret, `purchaseToken` asla dönmez.
- **Admin cookie'si kullanıcı token'ından ayrı evren** — kullanıcı bearer'ı admin ucuna yetmez, tersi de.
- Migration elle + `IF NOT EXISTS` (`0007`/`0008` deseni); `meta/_journal.json` + `meta/0010_snapshot.json`.
- Tasarım tokenları `admin/src/styles/tokens.css` içinde; gövde metni WCAG AA (≥4.5:1).
- Durum **asla yalnız renkle** anlatılmaz — `Badge` her zaman metin taşır.
- UI kütüphanesi YOK; React Query YOK.
- Türkçe kullanıcı metni; commit mesajları Türkçe, `feat:`/`fix:` öneki.
- Backend deploy **manuel**: `gh workflow run deploy-backend.yml -f confirm=deploy`.

## Review Focus

- **Kullanıcı bearer token'ıyla admin ucuna erişim.** İki ayrı kimlik evreni; karışırsa tam yetki sızıntısı. Test: Task 4.
- **Askıya alınmış admin'in mevcut oturumu.** Hesap `SUSPENDED` yapıldıktan sonra eski cookie hâlâ çalışmamalı. Test: Task 4.
- **5 hatalı giriş sonrası kilit.** Kilitliyken **doğru parola** da reddedilmeli; kilit süresi dolunca açılmalı. Test: Task 3.
- **Audit `metadata`'sına sızan gizli değer.** Parola/token/TOTP secret yazılırsa log kalıcı sızıntı olur. Test: Task 6.
- **SPA derin bağlantıda 404.** `/spa/weddings/<id>` yenilemede `index.html` dönmeli. Test: Task 11.

---

## File Structure

**Backend**
- `src/db/schema.ts` — 3 tablo (mevcut dosya, sonuna eklenir)
- `src/db/migrations/0010_admin_panel.sql` — yeni
- `src/db/migrations/meta/_journal.json`, `meta/0010_snapshot.json` — güncellenir/eklenir
- `src/admin/service.ts` — iş mantığı (parola doğrulama, kilit, plan değiştirme)
- `src/admin/store.ts` — Drizzle implementasyonu
- `src/admin/session.ts` — oturum aç/oku/kapat (yardımcı deseninin kopyası, `a_*` cookie)
- `src/admin/middleware.ts` — `createRequireAdmin`, `requireRole`
- `src/admin/view.ts` — beyaz liste dönüşümleri
- `src/routes/admin.ts` — uçlar
- `src/middleware/cors.ts` — `corsForAdmin` eklenir
- `src/middleware/rate-limit.ts` — `adminLogin` limiti eklenir
- `src/app.ts` — `/api/v1/admin` mount + CORS + `adminStore` enjeksiyonu
- `scripts/create-admin.ts` — CLI provisioning

**Frontend**
- `admin/package.json`, `admin/vite.config.ts`, `admin/tsconfig.json`, `admin/index.html`
- `admin/src/main.tsx`, `admin/src/App.tsx`, `admin/src/api.ts`
- `admin/src/styles/tokens.css`, `admin/src/styles/app.css`
- `admin/src/components/*.tsx` — StatCard, DataTable, Badge, SearchInput, Pagination, ConfirmDialog, Toast, EmptyState, Skeleton, Layout
- `admin/src/pages/*.tsx` — Login, Dashboard, Users, UserDetail, Weddings, WeddingDetail, Audit
- `frontend/public/_redirects`, `frontend/public/_headers` — `/spa/*` kuralları
- `.gitignore` — `frontend/public/spa/`
- `.github/workflows/frontend-ci.yml` — admin build adımı
- `scripts/check-admin.mjs` — SPA güvenlik kontrolü

---

### Task 1: Admin tabloları ve migration

**Files:**
- Modify: `backend/src/db/schema.ts` (dosya sonu, `messages` tablosundan sonra)
- Create: `backend/src/db/migrations/0010_admin_panel.sql`
- Modify: `backend/src/db/migrations/meta/_journal.json`
- Create: `backend/src/db/migrations/meta/0010_snapshot.json`
- Test: `backend/tests/admin/schema.test.ts`

**Interfaces:**
- Consumes: yok (ilk görev).
- Produces: Drizzle tabloları `adminAccounts`, `adminSessions`, `auditLogs`; sütun adları spec §5 ile birebir.

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
}, 120_000)

afterAll(async () => { await pg?.close() })

describe('admin tablolari', () => {
  it('admin_accounts sutunlari dogru', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'admin_accounts' ORDER BY column_name`,
    )
    const cols = r.rows.map((x) => x.column_name)
    expect(cols).toEqual([
      'created_at', 'display_name', 'email', 'failed_attempts', 'id',
      'last_login_at', 'locked_until', 'password_hash', 'recovery_codes',
      'role', 'status', 'totp_enabled_at', 'totp_secret', 'updated_at',
    ])
  })

  it('admin_sessions sutunlari dogru', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'admin_sessions' ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual([
      'admin_id', 'created_at', 'csrf_hash', 'expires_at', 'id', 'ip',
      'last_used_at', 'session_hash', 'user_agent',
    ])
  })

  it('audit_logs sutunlari dogru', async () => {
    const r = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_logs' ORDER BY column_name`,
    )
    expect(r.rows.map((x) => x.column_name)).toEqual([
      'action', 'actor_id', 'actor_type', 'created_at', 'id', 'ip',
      'metadata', 'target_id', 'target_type',
    ])
  })

  it('email UNIQUE — ayni e-posta iki kez eklenemez', async () => {
    await pg.query(
      `INSERT INTO admin_accounts (email, password_hash, display_name) VALUES ('a@t.local','h','A')`,
    )
    await expect(
      pg.query(
        `INSERT INTO admin_accounts (email, password_hash, display_name) VALUES ('a@t.local','h','B')`,
      ),
    ).rejects.toThrow()
  })

  it('session_hash UNIQUE', async () => {
    const a = await pg.query<{ id: string }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('s@t.local','h','S') RETURNING id`,
    )
    const adminId = a.rows[0]!.id
    const future = new Date(Date.now() + 3_600_000).toISOString()
    await pg.query(
      `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
       VALUES ($1,'same','c1',$2)`,
      [adminId, future],
    )
    await expect(
      pg.query(
        `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
         VALUES ($1,'same','c2',$2)`,
        [adminId, future],
      ),
    ).rejects.toThrow()
  })

  it('admin silinince oturumlari da silinir (CASCADE)', async () => {
    const a = await pg.query<{ id: string }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('c@t.local','h','C') RETURNING id`,
    )
    const adminId = a.rows[0]!.id
    const future = new Date(Date.now() + 3_600_000).toISOString()
    await pg.query(
      `INSERT INTO admin_sessions (admin_id, session_hash, csrf_hash, expires_at)
       VALUES ($1,'casc','c',$2)`,
      [adminId, future],
    )
    await pg.query(`DELETE FROM admin_accounts WHERE id = $1`, [adminId])
    const left = await pg.query(`SELECT id FROM admin_sessions WHERE admin_id = $1`, [adminId])
    expect(left.rows).toHaveLength(0)
  })

  it('status varsayilani ACTIVE', async () => {
    const r = await pg.query<{ status: string; role: string; failed_attempts: number }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ('d@t.local','h','D') RETURNING status, role, failed_attempts`,
    )
    expect(r.rows[0]).toMatchObject({ status: 'ACTIVE', role: 'SUPER_ADMIN', failed_attempts: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/schema.test.ts`
Expected: FAIL — `relation "admin_accounts" does not exist`.

- [ ] **Step 3: Add the three tables to `schema.ts`**

Dosya sonuna (`messages` tablosundan sonra). `boolean`, `integer`, `jsonb`, `uuid`, `text`, `timestamp`, `index`, `unique`, `foreignKey` zaten import edilmiş; `boolean` gerekmiyorsa ekleme.

```ts
/**
 * admin_accounts — ürün sahibinin yönetim hesabı.
 *
 * Kullanıcı (`users`) tablosundan AYRI: admin oturumu kullanıcı
 * token'ıyla açılamaz, tersi de. İki evren karışırsa tam yetki sızıntısı
 * olur (Review Focus #1).
 */
export const adminAccounts = pgTable(
  'admin_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    /** Argon2id — düz metin ASLA. */
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    /** v1'de tek rol: SUPER_ADMIN. RBAC'e genişletilebilir. */
    role: text('role').notNull().default('SUPER_ADMIN'),
    /** ACTIVE | SUSPENDED */
    status: text('status').notNull().default('ACTIVE'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    /** v1'de KULLANILMAZ — 2FA sonraki tur. Sütunlar şimdi eklenir ki
     *  sonraki turda migration gerekmesin. */
    totpSecret: text('totp_secret'),
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    recoveryCodes: jsonb('recovery_codes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('admin_accounts_status_idx').on(table.status),
  }),
)

/**
 * admin_sessions — HttpOnly cookie oturumu.
 *
 * Ham oturum değeri DB'de YOK; yalnızca SHA-256 (SECURITY §1.2 #4 ile
 * aynı kural). Kayan pencere: 30 dk boşta ölür, mutlak tavan 8 saat.
 */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id').notNull(),
    sessionHash: text('session_hash').notNull().unique(),
    csrfHash: text('csrf_hash').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    /** Mutlak tavan — kayan pencere bunu aşamaz. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    adminFk: foreignKey({
      name: 'admin_sessions_admin_fk',
      columns: [table.adminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('cascade'),
    expiresIdx: index('admin_sessions_expires_idx').on(table.expiresAt),
  }),
)

/**
 * audit_logs — değiştirilemez denetim kaydı.
 *
 * Uygulama katmanında `update`/`delete` fonksiyonu YOK. `metadata`'ya
 * parola/token/TOTP secret ASLA yazılmaz (Review Focus #4).
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** ADMIN | USER | SYSTEM */
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    /** USER | WEDDING | null */
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
    actionIdx: index('audit_logs_action_idx').on(table.action),
  }),
)
```

`0010_admin_panel.sql`:

```sql
CREATE TABLE IF NOT EXISTS "admin_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'SUPER_ADMIN',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" timestamptz,
  "last_login_at" timestamptz,
  "totp_secret" text,
  "totp_enabled_at" timestamptz,
  "recovery_codes" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_accounts_status_idx" ON "admin_accounts" ("status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" uuid NOT NULL,
  "session_hash" text NOT NULL UNIQUE,
  "csrf_hash" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "admin_sessions_admin_fk" FOREIGN KEY ("admin_id")
    REFERENCES "admin_accounts"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_expires_idx" ON "admin_sessions" ("expires_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_type" text NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" uuid,
  "metadata" jsonb,
  "ip" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
```

`meta/_journal.json` — `entries` sonuna:

```json
    {
      "idx": 10,
      "version": "7",
      "when": 1794000000000,
      "tag": "0010_admin_panel",
      "breakpoints": true
    }
```

`meta/0010_snapshot.json` — `0009_snapshot.json`'ı kopyala, `tables` altına üç tabloyu ekle, `id` = `"0010-admin-panel"`, `prevId` = 0009'un id'si.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/schema.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Verify migration applies cleanly**

Run: `cd backend && node scripts/verify-migrations.mjs`
Expected: `0010_admin_panel.sql` ✅ — hata yok.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db backend/tests/admin/schema.test.ts
git commit -m "feat: admin tablolari — accounts, sessions, audit_logs"
```

---

### Task 2: Parola hash, kilit ve oturum çekirdeği

**Files:**
- Create: `backend/src/admin/service.ts`
- Create: `backend/src/admin/session.ts`
- Test: `backend/tests/admin/password.test.ts`

**Interfaces:**
- Consumes: Task 1'in tabloları (tip olarak).
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `validatePasswordStrength(plain: string): { ok: true } | { ok: false; reason: string }`
  - `MIN_ADMIN_PASSWORD_LENGTH = 16`, `MAX_FAILED_ATTEMPTS = 5`, `LOCK_DURATION_MS = 15 * 60 * 1000`
  - `computeLockState(admin: { failedAttempts: number; lockedUntil: Date | null }, now?: Date): 'OK' | 'LOCKED'`
  - `nextFailedState(current: number, now?: Date): { failedAttempts: number; lockedUntil: Date | null }`
  - `SESSION_IDLE_MS = 30 * 60 * 1000`, `SESSION_MAX_MS = 8 * 60 * 60 * 1000`, `SESSION_SLIDE_THRESHOLD_MS = 25 * 60 * 1000`
  - `ADMIN_SESSION_COOKIE = 'a_session'`, `ADMIN_CSRF_COOKIE = 'a_csrf'`, `ADMIN_CSRF_HEADER = 'x-csrf-token'`

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  computeLockState,
  nextFailedState,
  MIN_ADMIN_PASSWORD_LENGTH,
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MS,
} from '../../src/admin/service.js'

describe('parola hash', () => {
  it('argon2id hash uretir ve dogrular', async () => {
    const hash = await hashPassword('cok-guclu-BIR-parola-123')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toContain('cok-guclu')
    expect(await verifyPassword(hash, 'cok-guclu-BIR-parola-123')).toBe(true)
    expect(await verifyPassword(hash, 'yanlis')).toBe(false)
  })

  it('ayni parola iki farkli hash uretir (tuz)', async () => {
    const a = await hashPassword('ayni-parola-123456789')
    const b = await hashPassword('ayni-parola-123456789')
    expect(a).not.toBe(b)
  })
})

describe('parola guclulugu', () => {
  it('16 karakterden kisa reddedilir', () => {
    const r = validatePasswordStrength('kisa-Parola1')
    expect(r.ok).toBe(false)
    expect(MIN_ADMIN_PASSWORD_LENGTH).toBe(16)
  })

  it('harf olmadan reddedilir', () => {
    expect(validatePasswordStrength('1234567890123456').ok).toBe(false)
  })

  it('rakam olmadan reddedilir', () => {
    expect(validatePasswordStrength('abcdefghijklmnop').ok).toBe(false)
  })

  it('16 karakter + harf + rakam kabul edilir', () => {
    expect(validatePasswordStrength('guclu-parola-123').ok).toBe(true)
  })
})

describe('hesap kilidi', () => {
  it('kilit yoksa OK', () => {
    expect(computeLockState({ failedAttempts: 0, lockedUntil: null })).toBe('OK')
  })

  it('kilit suresi gecmemisse LOCKED', () => {
    const future = new Date(Date.now() + 60_000)
    expect(computeLockState({ failedAttempts: 5, lockedUntil: future })).toBe('LOCKED')
  })

  it('kilit suresi gecmisse OK', () => {
    const past = new Date(Date.now() - 60_000)
    expect(computeLockState({ failedAttempts: 5, lockedUntil: past })).toBe('OK')
  })

  it('5. hatada kilit devreye girer', () => {
    let state = { failedAttempts: 0, lockedUntil: null as Date | null }
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      state = nextFailedState(state.failedAttempts)
      expect(state.lockedUntil).toBeNull()
    }
    state = nextFailedState(state.failedAttempts)
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS)
    expect(state.lockedUntil).not.toBeNull()
    // 15 dakika sonrası
    const delta = state.lockedUntil!.getTime() - Date.now()
    expect(delta).toBeGreaterThan(LOCK_DURATION_MS - 5000)
    expect(delta).toBeLessThanOrEqual(LOCK_DURATION_MS)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/password.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implement `service.ts`**

`backend/src/admin/service.ts` — parola + kilit sabitleri ve fonksiyonları.

**Argon2id:** `@node-rs/argon2` `package.json`'da **kurulu ama hiç kullanılmıyor** (auth magic-link ile çalışıyor, parola yok). İlk kez burada kullanılacak. API:

```ts
import { hash, verify } from '@node-rs/argon2'
// hash(plain) → Promise<string>, "$argon2id$..." ile başlar
// verify(hash, plain) → Promise<boolean>
```

Varsayılan parametreler yeterli (Argon2id, 19 MiB, t=2, p=1). `backend/src/auth/auth-store.ts`'de kullanım örneği **YOK** — bu plan ilk kullanım.

Sabitler: `MIN_ADMIN_PASSWORD_LENGTH = 16`, `MAX_FAILED_ATTEMPTS = 5`, `LOCK_DURATION_MS = 15 * 60 * 1000`.

`validatePasswordStrength`: uzunluk ≥ 16, en az bir harf, en az bir rakam.

`nextFailedState(current)`: `current + 1`; sonuç `>= MAX_FAILED_ATTEMPTS` ise `lockedUntil = new Date(Date.now() + LOCK_DURATION_MS)`.

- [ ] **Step 4: Implement `session.ts`**

`backend/src/admin/session.ts` — sabitler (`SESSION_IDLE_MS = 30*60*1000`, `SESSION_MAX_MS = 8*60*60*1000`, `SESSION_SLIDE_THRESHOLD_MS = 25*60*1000`, `ADMIN_SESSION_COOKIE = 'a_session'`, `ADMIN_CSRF_COOKIE = 'a_csrf'`, `ADMIN_CSRF_HEADER = 'x-csrf-token'`) ve `readCookie`, `sessionCookie`, `csrfCookie`, `clearSessionCookies` fonksiyonları. **`helpers/session.ts`'teki aynı deseni kopyala**, cookie adlarını `a_*` yap. Yardımcı dosyayı import etme — iki evren ayrı kalmalı (Review Focus #1).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/password.test.ts`
Expected: PASS (10 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin backend/tests/admin/password.test.ts
git commit -m "feat: admin parola hash, gucluluk ve hesap kilidi"
```

---

### Task 3: Giriş akışı — kullanıcı sızdırmayan hata, kilit, audit

**Files:**
- Modify: `backend/src/admin/service.ts` (`loginAdmin` eklenir)
- Test: `backend/tests/admin/login.test.ts`

**Interfaces:**
- Consumes: Task 2'nin `hashPassword`, `verifyPassword`, `computeLockState`, `nextFailedState`, `LOCK_DURATION_MS`.
- Produces:
  - `AdminDeps` arayüzü — `findAdminByEmail(email)`, `recordFailedAttempt(adminId, state)`, `recordSuccess(adminId)`, `createSession(values)`, `findSessionByHash(hash)`, `touchSession(id, expiresAt)`, `deleteSession(id)`, `writeAudit(entry)`
  - `loginAdmin(params: { email: string; password: string; ip?: string }, deps: AdminDeps): Promise<{ admin: AdminRecord } | null>`
  - `AdminRecord` — `{ id, email, displayName, role, status, failedAttempts, lockedUntil, lastLoginAt }` (parola hash'i YOK)
  - `AccountLockedError`, `AccountSuspendedError` sınıfları

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/login.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loginAdmin, AccountLockedError, AccountSuspendedError, hashPassword } from '../../src/admin/service.js'

let deps: any

beforeEach(async () => {
  const hash = await hashPassword('guclu-parola-123')
  deps = {
    findAdminByEmail: vi.fn().mockResolvedValue({
      id: 'a1', email: 'owner@t.local', displayName: 'Owner',
      passwordHash: hash, role: 'SUPER_ADMIN', status: 'ACTIVE',
      failedAttempts: 0, lockedUntil: null, lastLoginAt: null,
    }),
    recordFailedAttempt: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({ id: 's1' }),
    findSessionByHash: vi.fn(),
    touchSession: vi.fn(),
    deleteSession: vi.fn(),
    writeAudit: vi.fn().mockResolvedValue(undefined),
  }
})

describe('loginAdmin', () => {
  it('dogru parola ile giris basarili', async () => {
    const r = await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(r).not.toBeNull()
    expect(r!.admin.email).toBe('owner@t.local')
    expect(deps.recordSuccess).toHaveBeenCalledWith('a1')
  })

  it('yanlis parola null doner ve deneme sayaci artar', async () => {
    const r = await loginAdmin({ email: 'owner@t.local', password: 'yanlis' }, deps)
    expect(r).toBeNull()
    expect(deps.recordFailedAttempt).toHaveBeenCalled()
  })

  it('OLMAYAN e-posta ile YANLIS PAROLA ayni sonucu verir (sizdirmaz)', async () => {
    deps.findAdminByEmail.mockResolvedValue(null)
    const a = await loginAdmin({ email: 'yok@t.local', password: 'herhangi' }, deps)
    expect(a).toBeNull()
    // Aynı hata tipi/mesajı — e-posta varlığı sızmaz.
  })

  it('askiya alinmis hesap giris yapamaz', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      status: 'SUSPENDED',
    })
    await expect(
      loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps),
    ).rejects.toBeInstanceOf(AccountSuspendedError)
  })

  it('kilitli hesap DOGRU parolayla bile reddedilir', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    })
    await expect(
      loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps),
    ).rejects.toBeInstanceOf(AccountLockedError)
  })

  it('kilit suresi dolmussa giris yapilabilir', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    })
    const r = await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(r).not.toBeNull()
  })

  it('donen admin nesnesi parola hash i ICERMEZ', async () => {
    const r = await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(JSON.stringify(r)).not.toContain('argon2')
    expect(r!.admin).not.toHaveProperty('passwordHash')
  })

  it('giris audit e yazilir', async () => {
    await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(deps.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_LOGIN', actorType: 'ADMIN', actorId: 'a1' }),
    )
  })

  it('basarisiz giris de audit e yazilir', async () => {
    await loginAdmin({ email: 'owner@t.local', password: 'yanlis' }, deps)
    expect(deps.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_LOGIN_FAILED' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/login.test.ts`
Expected: FAIL — `loginAdmin` yok.

- [ ] **Step 3: Implement `loginAdmin` in `service.ts`**

Sıra **kesin** (spec §6.1):
1. `findAdminByEmail(email.toLowerCase().trim())`
2. Admin yok → `writeAudit({ action: 'ADMIN_LOGIN_FAILED' })` + `null` (argon2 çalıştırma — zamanlama farkı sızmasın diye **sahte bir doğrulama** yap: sabit bir dummy hash'e karşı `verifyPassword` çağır)
3. `status !== 'ACTIVE'` → `AccountSuspendedError`
4. `computeLockState(...) === 'LOCKED'` → `AccountLockedError`
5. `verifyPassword` → yanlışsa `nextFailedState` + `recordFailedAttempt` + audit + `null`
6. Doğruysa `recordSuccess(adminId)` (failedAttempts=0, lockedUntil=null, lastLoginAt=now) + audit `ADMIN_LOGIN` + `{ admin: beyazListe(record) }`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/login.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin backend/tests/admin/login.test.ts
git commit -m "feat: admin giris akisi — sizdirmayan hata, kilit, audit"
```

---

### Task 4: Oturum middleware'i ve iki evrenin ayrılığı

**Files:**
- Create: `backend/src/admin/middleware.ts`
- Test: `backend/tests/admin/middleware.test.ts`

**Interfaces:**
- Consumes: Task 2'nin `session.ts` sabitleri + `readCookie`; Task 3'ün `AdminDeps.findSessionByHash`, `touchSession`, `deleteSession`.
- Produces:
  - `createRequireAdmin(deps: { findSessionByHash; touchSession; findAdminById }): RequestHandler`
  - `requireRole(role: string): RequestHandler`
  - `AdminContext` — `{ adminId: string; email: string; role: string; sessionId: string }`
  - `req.admin?: AdminContext` (global Express augmentation)

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/middleware.test.ts` — sahte `req`/`res` nesneleriyle:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequireAdmin, requireRole } from '../../src/admin/middleware.js'
import { ADMIN_SESSION_COOKIE } from '../../src/admin/session.js'

function makeReq(cookieHeader?: string, csrfHeader?: string, method = 'GET') {
  return {
    method,
    headers: { cookie: cookieHeader, 'x-csrf-token': csrfHeader },
  } as any
}

function makeRes() {
  const res: any = { statusCode: 200, headers: {}, body: null }
  res.status = (c: number) => { res.statusCode = c; return res }
  res.json = (b: unknown) => { res.body = b; return res }
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res }
  res.end = () => res
  return res
}

describe('createRequireAdmin', () => {
  let deps: any
  let next: any

  beforeEach(() => {
    deps = {
      findSessionByHash: vi.fn(),
      touchSession: vi.fn().mockResolvedValue(undefined),
      findAdminById: vi.fn().mockResolvedValue({
        id: 'a1', email: 'owner@t.local', role: 'SUPER_ADMIN', status: 'ACTIVE',
      }),
    }
    next = vi.fn()
  })

  it('cookie YOKSA 401 — admin ucuna erisilemez', async () => {
    const mw = createRequireAdmin(deps)
    const res = makeRes()
    await mw(makeReq(), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('KULLANICI bearer token i admin ucuna YETMEZ', async () => {
    // Kullanıcı token'ı `Authorization` başlığında; admin yalnız cookie
    // okur. Bearer varsa bile cookie yoksa 401.
    const mw = createRequireAdmin(deps)
    const req = makeReq(undefined, undefined)
    req.headers.authorization = 'Bearer kullanici-tokeni'
    const res = makeRes()
    await mw(req, res, next)
    expect(res.statusCode).toBe(401)
  })

  it('gecerli oturum req.admin doldurur', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    const mw = createRequireAdmin(deps)
    const req = makeReq(`${ADMIN_SESSION_COOKIE}=tok`)
    const res = makeRes()
    await mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.admin).toMatchObject({ adminId: 'a1', role: 'SUPER_ADMIN' })
  })

  it('suresi dolmus oturum 401', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() - 1000),
      lastUsedAt: new Date(),
    })
    const mw = createRequireAdmin(deps)
    const res = makeRes()
    await mw(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(401)
  })

  it('ASKIYA ALINMIS admin in MEVCUT oturumu da 401 (Review Focus #2)', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    deps.findAdminById.mockResolvedValue({
      id: 'a1', email: 'owner@t.local', role: 'SUPER_ADMIN', status: 'SUSPENDED',
    })
    const mw = createRequireAdmin(deps)
    const res = makeRes()
    await mw(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(403)
    expect(deps.deleteSession).toHaveBeenCalledWith('s1')
  })
})

describe('requireRole', () => {
  it('rol uyusmazsa 403', () => {
    const res = makeRes()
    requireRole('SUPER_ADMIN')({ admin: { role: 'VIEWER' } } as any, res, next)
    expect(res.statusCode).toBe(403)
  })

  it('rol uyusursa gecer', () => {
    const n = vi.fn()
    requireRole('SUPER_ADMIN')({ admin: { role: 'SUPER_ADMIN' } } as any, makeRes(), n)
    expect(n).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/middleware.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implement `middleware.ts`**

`createRequireAdmin`: cookie `a_session` → `hashToken` → `findSessionByHash` → süre kontrolü (`expiresAt`) → boşta kalma kontrolü (`lastUsedAt + SESSION_IDLE_MS`) → `findAdminById` → `status !== 'ACTIVE'` ise `deleteSession` + 403 → kayan pencere (`now - lastUsedAt > SESSION_SLIDE_THRESHOLD_MS` ise `touchSession`) → `req.admin` doldur → `next()`.

`requireRole(role)`: `req.admin?.role !== role` → 403.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/middleware.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/middleware.ts backend/tests/admin/middleware.test.ts
git commit -m "feat: admin oturum middleware — iki evren ayrimi, askiya alma"
```

---

### Task 5: Store — Drizzle implementasyonu ve beyaz liste

**Files:**
- Create: `backend/src/admin/store.ts`
- Create: `backend/src/admin/view.ts`
- Test: `backend/tests/admin/store.test.ts`

**Interfaces:**
- Consumes: Task 1 tabloları; Task 3 `AdminDeps`.
- Produces:
  - `drizzleAdminDeps(dbOverride?: Db): AdminDeps`
  - `toAdminView(row): AdminView` — `{ id, email, displayName, role, status, lastLoginAt }`
  - `toUserView(row): UserView` — `{ id, email, displayName, status, createdAt, weddingCount }`
  - `toWeddingView(row): WeddingView` — `{ id, coupleNames, weddingDate, plan, guestCount, memberCount, createdAt }`
  - `toAuditView(row): AuditView` — `{ id, actorType, actorId, action, targetType, targetId, metadata, ip, createdAt }`

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/store.test.ts` — PGlite kurulumu (Task 1 deseni) +:

```ts
describe('beyaz liste gorunumleri', () => {
  it('admin gorunumu parola hash i ICERMEZ', () => {
    const v = toAdminView({
      id: 'a1', email: 'o@t.local', displayName: 'O', role: 'SUPER_ADMIN',
      status: 'ACTIVE', lastLoginAt: null,
      passwordHash: '$argon2id$gizli', totpSecret: 'GIZLI', recoveryCodes: ['x'],
      failedAttempts: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date(),
    } as never)
    expect(JSON.stringify(v)).not.toContain('argon2')
    expect(JSON.stringify(v)).not.toContain('GIZLI')
    expect(Object.keys(v).sort()).toEqual(
      ['displayName', 'email', 'id', 'lastLoginAt', 'role', 'status'],
    )
  })

  it('dugun gorunumu purchaseToken ICERMEZ', () => {
    const v = toWeddingView({
      id: 'w1', coupleNames: 'A & B', weddingDate: new Date(), plan: 'FREE',
      guestCount: 3, memberCount: 1, createdAt: new Date(),
      purchaseToken: 'PLAY-RECEIPT-SECRET', purchasePlatform: 'PLAY',
      purchaseDate: new Date(), status: 'ACTIVE', timezone: 'Europe/Istanbul',
    } as never)
    expect(JSON.stringify(v)).not.toContain('PLAY-RECEIPT-SECRET')
    expect(Object.keys(v).sort()).toEqual(
      ['coupleNames', 'createdAt', 'guestCount', 'id', 'memberCount', 'plan', 'weddingDate'],
    )
  })
})

describe('drizzleAdminDeps', () => {
  it('findAdminByEmail kaydi doner', async () => { /* PGlite insert + sorgu */ })
  it('recordFailedAttempt sayaci ve kilidi yazar', async () => { /* ... */ })
  it('writeAudit kaydi ekler, silme fonksiyonu YOK', () => {
    const deps = drizzleAdminDeps(db as never)
    expect(deps).not.toHaveProperty('deleteAudit')
    expect(deps).not.toHaveProperty('updateAudit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/store.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implement `view.ts` and `store.ts`**

`view.ts` — dört dönüşüm fonksiyonu, her biri alan alan kurar (`...row` YOK).

`store.ts` — `drizzleAdminDeps(dbOverride?)`; `findAdminByEmail`, `findAdminById`, `recordFailedAttempt`, `recordSuccess`, `createSession`, `findSessionByHash`, `touchSession`, `deleteSession`, `writeAudit`, `countUsers`, `listUsers`, `listWeddings`, `findWeddingById`, `setWeddingPlan`. **`updateAudit`/`deleteAudit` YOK.**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/store.ts backend/src/admin/view.ts backend/tests/admin/store.test.ts
git commit -m "feat: admin store — drizzle + beyaz liste gorunumleri"
```

---

### Task 6: Plan değiştirme ve audit

**Files:**
- Modify: `backend/src/admin/service.ts` (`setWeddingPlan` eklenir)
- Test: `backend/tests/admin/plan.test.ts`

**Interfaces:**
- Consumes: Task 5 `AdminDeps` + `toWeddingView`.
- Produces: `setWeddingPlan(params: { weddingId: string; plan: 'FREE' | 'PREMIUM'; actorId: string; ip?: string }, deps: AdminDeps): Promise<WeddingView | null>`

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/plan.test.ts`:

```ts
describe('setWeddingPlan', () => {
  it('FREE -> PREMIUM purchasedAt doldurur, platform ADMIN olur', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    expect(d.updateWeddingPlan).toHaveBeenCalledWith('w1', expect.objectContaining({
      plan: 'PREMIUM', purchasePlatform: 'ADMIN', purchaseToken: null,
    }))
    expect(d.updateWeddingPlan.mock.calls[0][1].purchasedAt).toBeInstanceOf(Date)
  })

  it('PREMIUM -> FREE purchasedAt temizler', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'FREE', actorId: 'a1' }, d)
    expect(d.updateWeddingPlan).toHaveBeenCalledWith('w1', expect.objectContaining({
      plan: 'FREE', purchasedAt: null, purchasePlatform: null, purchaseToken: null,
    }))
  })

  it('gecersiz plan reddedilir', async () => {
    const d = makeDeps()
    await expect(
      setWeddingPlan({ weddingId: 'w1', plan: 'VIP' as never, actorId: 'a1' }, d),
    ).rejects.toThrow()
    expect(d.updateWeddingPlan).not.toHaveBeenCalled()
  })

  it('dugun yoksa null doner, yazma yok', async () => {
    const d = makeDeps({ findWeddingById: vi.fn().mockResolvedValue(null) })
    const r = await setWeddingPlan({ weddingId: 'yok', plan: 'PREMIUM', actorId: 'a1' }, d)
    expect(r).toBeNull()
    expect(d.updateWeddingPlan).not.toHaveBeenCalled()
  })

  it('her degisiklik audit e yazilir (from/to ile)', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1', ip: '1.2.3.4' }, d)
    expect(d.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'WEDDING_PLAN_CHANGED',
      actorType: 'ADMIN',
      actorId: 'a1',
      targetType: 'WEDDING',
      targetId: 'w1',
      metadata: { from: 'FREE', to: 'PREMIUM' },
      ip: '1.2.3.4',
    }))
  })

  it('audit metadata parola/token ICERMEZ (Review Focus #4)', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    const meta = JSON.stringify(d.writeAudit.mock.calls[0][0].metadata)
    expect(meta).not.toMatch(/argon2|password|token|secret/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/plan.test.ts`
Expected: FAIL — `setWeddingPlan` yok.

- [ ] **Step 3: Implement `setWeddingPlan`**

Kurallar (spec §6.4): `plan` yalnız `'FREE' | 'PREMIUM'`; `PREMIUM` → `purchasedAt = new Date()`, `purchasePlatform = 'ADMIN'`, `purchaseToken = null`; `FREE` → üçü de `null`. Düğün yoksa `null`. Her durumda `writeAudit` (`metadata: { from: mevcutPlan, to: yeniPlan }`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/plan.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin backend/tests/admin/plan.test.ts
git commit -m "feat: premium aktivasyonu — plan degistirme + audit"
```

---

### Task 7: Admin API uçları ve CORS

**Files:**
- Create: `backend/src/routes/admin.ts`
- Modify: `backend/src/middleware/cors.ts` (`corsForAdmin` eklenir)
- Modify: `backend/src/middleware/rate-limit.ts` (`adminLogin` limiti)
- Modify: `backend/src/app.ts` (`/api/v1/admin` mount)
- Test: `backend/tests/e2e/admin-api.test.ts`

**Interfaces:**
- Consumes: Task 3 `loginAdmin`; Task 4 `createRequireAdmin`, `requireRole`; Task 5 `drizzleAdminDeps`, `to*View`; Task 6 `setWeddingPlan`.
- Produces: Router `createAdminRouter(deps): Router`; `corsForAdmin(options?): RequestHandler`.

- [ ] **Step 1: Write the failing test**

`backend/tests/e2e/admin-api.test.ts` — gerçek HTTP + PGlite (mevcut `tests/e2e` deseni):

```ts
describe('admin API', () => {
  it('POST /admin/auth/login — dogru parola cookie verir', async () => {
    const res = await request(app).post('/api/v1/admin/auth/login')
      .send({ email: 'owner@t.local', password: 'guclu-parola-123' })
    expect(res.status).toBe(200)
    const cookies = res.headers['set-cookie'] as unknown as string[]
    expect(cookies.some((c) => c.startsWith('a_session='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('a_csrf='))).toBe(true)
    expect(cookies.find((c) => c.startsWith('a_session='))).toContain('HttpOnly')
  })

  it('GET /admin/overview — cookie YOKSA 401', async () => {
    const res = await request(app).get('/api/v1/admin/overview')
    expect(res.status).toBe(401)
  })

  it('GET /admin/overview — KULLANICI bearer i ile 401', async () => {
    const userToken = signAccessToken({ userId: someUserId }, SECRET)
    const res = await request(app).get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(401)
  })

  it('giris sonrasi overview sayilari doner', async () => {
    const cookie = await loginAndGetCookie(app)
    const res = await request(app).get('/api/v1/admin/overview').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      users: { total: expect.any(Number) },
      weddings: { total: expect.any(Number), premium: expect.any(Number) },
      guests: { total: expect.any(Number) },
    })
  })

  it('PATCH /admin/weddings/:id/plan — PREMIUM yapar', async () => {
    const cookie = await loginAndGetCookie(app)
    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingId}/plan`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfFrom(cookie))
      .send({ plan: 'PREMIUM' })
    expect(res.status).toBe(200)
    expect(res.body.wedding.plan).toBe('PREMIUM')
  })

  it('CSRF basligi YOKSA yazma 403', async () => {
    const cookie = await loginAndGetCookie(app)
    const res = await request(app)
      .patch(`/api/v1/admin/weddings/${weddingId}/plan`)
      .set('Cookie', cookie)
      .send({ plan: 'PREMIUM' })
    expect(res.status).toBe(403)
  })

  it('CORS: izinli origin yansitilir, credentials true', async () => {
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Origin', 'https://dugunce.com.tr')
    expect(res.headers['access-control-allow-origin']).toBe('https://dugunce.com.tr')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('CORS: yabanci origin yansitilmaz', async () => {
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Origin', 'https://kotu-site.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('login hiz siniri: 10 denemeden sonra 429', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/v1/admin/auth/login')
        .send({ email: 'x@t.local', password: 'yanlis' })
    }
    const res = await request(app).post('/api/v1/admin/auth/login')
      .send({ email: 'x@t.local', password: 'yanlis' })
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/e2e/admin-api.test.ts`
Expected: FAIL — 404 (route yok).

- [ ] **Step 3: Implement `corsForAdmin`**

`middleware/cors.ts` — mevcut `corsForInvitations`'ı **genelleştir**: iç mantığı `corsMiddleware(options)` yap, `corsForInvitations` ve `corsForAdmin` onu çağırsın. `corsForAdmin` varsayılanları: `credentials: true`, `allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token']`.

- [ ] **Step 4: Implement `routes/admin.ts`**

Uçlar (spec §6): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /overview`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `GET /weddings`, `GET /weddings/:id`, `PATCH /weddings/:id/plan`, `GET /audit-logs`.

**Sayfalama — cursor tabanlı** (mevcut `guests` deseniyle aynı):
- `?limit=50&cursor=<son id>` — `limit` varsayılan 50, azami 100
- Yanıt: `{ items: [...], nextCursor: string | null }`
- `nextCursor`, dönen son kaydın `id`'sidir; `items.length < limit` ise `null`
- Sıralama: `createdAt DESC, id DESC` (kararlı sayfalama)

**Arama:** `?q=` — `users` için `email ILIKE` veya `displayName ILIKE`; `weddings` için `coupleNames ILIKE`. Boş/whitespace ise yok sayılır.

**Plan filtresi:** `?plan=FREE|PREMIUM` — geçersiz değer 400.

Yazma uçlarında CSRF doğrulaması (`verifyCsrf` deseni yardımcı uygulamasından).

- [ ] **Step 5: Wire into `app.ts`**

`app.use('/api/v1/admin', corsForAdmin(), createAdminRouter({ ... }))`. `CreateAppOptions`'a `adminStore?` ekle (test enjeksiyonu).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/e2e/admin-api.test.ts`
Expected: PASS (9 test).

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS — mevcut 1023 + yeni testler.

- [ ] **Step 8: Commit**

```bash
git add backend/src backend/tests/e2e/admin-api.test.ts
git commit -m "feat: admin API uclari + CORS + hiz siniri"
```

---

### Task 8: CLI provisioning

**Files:**
- Create: `backend/scripts/create-admin.ts`
- Test: `backend/tests/admin/cli.test.ts`

**Interfaces:**
- Consumes: Task 2 `hashPassword`, `validatePasswordStrength`; Task 5 `drizzleAdminDeps`.
- Produces: `createAdminAccount(params: { email; displayName; password }, deps): Promise<{ id }>`

- [ ] **Step 1: Write the failing test**

`backend/tests/admin/cli.test.ts`:

```ts
describe('createAdminAccount', () => {
  it('gecerli parola ile hesap olusturur', async () => { /* ... */ })
  it('zayif parola reddedilir', async () => {
    await expect(createAdminAccount(
      { email: 'a@t.local', displayName: 'A', password: 'kisa' }, deps,
    )).rejects.toThrow(/16/)
  })
  it('AYNI e-posta varsa REDDEDER (uzerine yazmaz)', async () => { /* ... */ })
  it('olusturma audit e yazilir', async () => { /* ADMIN_CREATED */ })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/admin/cli.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `createAdminAccount` + CLI script**

`service.ts`'e `createAdminAccount` ekle; `scripts/create-admin.ts` bunu çağırır, parolayı `readline` ile **echo kapalı** sorar, sonucu yazar. Web'den oluşturma ucu **yok** — test bunu doğrular (`/admin/auth/register` 404).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/admin/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin backend/scripts/create-admin.ts backend/tests/admin/cli.test.ts
git commit -m "feat: admin CLI provisioning — web'den olusturma yok"
```

---

### Task 9: SPA iskeleti, tokenlar ve tasarım sistemi

**Files:**
- Create: `admin/package.json`, `admin/vite.config.ts`, `admin/tsconfig.json`, `admin/index.html`
- Create: `admin/src/main.tsx`, `admin/src/App.tsx`, `admin/src/styles/tokens.css`, `admin/src/styles/app.css`
- Create: `admin/src/components/Layout.tsx`
- Modify: `frontend/public/_redirects`, `frontend/public/_headers`, `.gitignore`
- Test: `scripts/check-admin.mjs`

**Interfaces:**
- Consumes: yok (SPA tarafının ilk görevi).
- Produces: Çalışan Vite projesi, `npm run build` → `frontend/public/spa/`.

- [ ] **Step 1: Write the failing check**

`scripts/check-admin.mjs` — SPA güvenlik kontrolü:

```js
// Kontroller:
// 1. localStorage.setItem ile token yazımı YOK (HttpOnly cookie kullanılır)
// 2. innerHTML ile kullanıcı verisi basılmıyor
// 3. vite.config.ts içinde base: '/spa/' var
// 4. build.outDir '../frontend/public/spa' var
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-admin.mjs`
Expected: FAIL — `admin/` dizini yok.

- [ ] **Step 3: Scaffold the Vite project**

`admin/package.json` — `react`, `react-dom`, `react-router-dom`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`. Scripts: `dev`, `build`, `typecheck`.

`vite.config.ts` — `base: '/spa/'`, `build: { outDir: '../frontend/public/spa', emptyOutDir: true }`.

`tokens.css` — spec §9.1'deki tüm değişkenler **birebir**.

`app.css` — layout grid (sol menü 232px + içerik), kart/ tablo/ buton/ badge stilleri.

`Layout.tsx` — sol menü (Genel bakış, Kullanıcılar, Düğünler, Denetim) + üst çubuk + `<Outlet />`. Mobilde hamburger.

`_redirects`'e ekle: `/spa/*  /spa/index.html  200`.
`_headers`'a ekle: `/spa/*` → `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.
`.gitignore`'a ekle: `frontend/public/spa/`.

- [ ] **Step 4: Verify build works**

Run: `cd admin && npm ci && npm run build`
Expected: `frontend/public/spa/index.html` oluşur.

Run: `node scripts/check-admin.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin frontend/public/_redirects frontend/public/_headers .gitignore scripts/check-admin.mjs
git commit -m "feat: admin SPA iskeleti — vite + tasarim tokenlari"
```

---

### Task 10: API istemcisi ve giriş sayfası

**Files:**
- Create: `admin/src/api.ts`, `admin/src/pages/Login.tsx`
- Modify: `admin/src/App.tsx` (routing)
- Test: `admin/src/api.test.ts`

**Interfaces:**
- Consumes: Task 9 iskeleti; Task 7 API uçları.
- Produces: `api` nesnesi — `login`, `logout`, `me`, `overview`, `users`, `weddings`, `setPlan`, `audit`; `ApiError` sınıfı.

- [ ] **Step 1: Write the failing test**

`admin/src/api.test.ts` — `fetch` mock'lanır:

```ts
it('credentials: include ile istek atar', async () => { /* ... */ })
it('yazma isteginde X-CSRF-Token basligi ekler (cookie den okur)', async () => { /* ... */ })
it('401 alinca oturum dusme olayini tetikler', async () => { /* ... */ })
it('hata govdesini ApiError a cevirir', async () => { /* ... */ })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd admin && npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `api.ts` and `Login.tsx`**

`api.ts` — `API_BASE = 'https://api.dugunce.com.tr/api/v1/admin'` (dev'de `http://localhost:3000/api/v1/admin`), `credentials: 'include'`, CSRF cookie'sini `document.cookie`'den okuyup `X-CSRF-Token` ekle.

`Login.tsx` — e-posta + parola formu, hata satır içi, yükleme durumu, `autocomplete` doğru (`email`, `current-password`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd admin && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/src
git commit -m "feat: admin SPA API istemcisi + giris sayfasi"
```

---

### Task 11: Dashboard, listeler ve plan değiştirme ekranları

**Files:**
- Create: `admin/src/components/{StatCard,DataTable,Badge,SearchInput,Pagination,ConfirmDialog,Toast,EmptyState,Skeleton}.tsx`
- Create: `admin/src/pages/{Dashboard,Users,UserDetail,Weddings,WeddingDetail,Audit}.tsx`
- Modify: `admin/src/App.tsx`
- Test: `scripts/check-admin.mjs` (derin bağlantı kontrolü eklenir)

**Interfaces:**
- Consumes: Task 10 `api`.
- Produces: 7 sayfa, routing tamam.

- [ ] **Step 1: Add deep-link check to `check-admin.mjs`**

```js
// 5. frontend/public/_redirects içinde "/spa/*  /spa/index.html  200" var
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-admin.mjs`
Expected: FAIL — kural yok (Task 9'da eklendiyse bu adım PASS verir; o zaman bu adımı "mevcut kuralı doğrula" olarak işaretle).

- [ ] **Step 3: Implement components**

Her bileşen spec §9.1'deki tabloya göre. `Badge` **her zaman metin taşır** (`PREMIUM`/`FREE`/`ACTIVE`/`SUSPENDED`). `DataTable` boş durum ve yükleme iskeleti destekler. `ConfirmDialog` `Esc` ile kapanır, odağı tuzağa alır.

- [ ] **Step 4: Implement pages**

`Dashboard` — 4 `StatCard` + son 20 audit.
`Users` — arama (300 ms debounce) + tablo + "Daha fazla".
`UserDetail` — kullanıcı + düğünleri + askıya al/aktifleştir.
`Weddings` — plan filtresi + tablo.
`WeddingDetail` — düğün bilgisi + **"Planı değiştir"** (`ConfirmDialog`).
`Audit` — aksiyon filtresi + tablo.

- [ ] **Step 5: Verify build**

Run: `cd admin && npm run build && npm run typecheck`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Verify in a real browser**

Backend'i PGlite + `serve-admin.mjs` betiğiyle ayağa kaldır, `npm run dev` ile SPA'yı aç, `ego_navigate` ile:

1. Giriş yap → dashboard sayıları görünüyor
2. Düğünler → bir düğüne gir → planı PREMIUM yap → rozet değişiyor
3. `/spa/weddings/<id>` adresini yenile → 404 yok
4. Çıkış yap → `/` girişe yönlendiriyor

Expected: dördü de gözle doğrulanır. Ekran görüntüsü al.

- [ ] **Step 7: Commit**

```bash
git add admin scripts/check-admin.mjs
git commit -m "feat: admin SPA sayfalari — dashboard, listeler, plan degistirme"
```

---

### Task 12: CI, deploy ve canlı doğrulama

**Files:**
- Modify: `.github/workflows/frontend-ci.yml`
- Test: yok (operasyon).

- [ ] **Step 1: Add admin build to frontend CI**

`frontend-ci.yml`'a ekle:

```yaml
      - name: Admin SPA build
        run: |
          cd admin
          npm ci
          npm run typecheck
          npm run build
      - name: Admin SPA kontrolleri
        run: node scripts/check-admin.mjs
```

Path filtresine ekle: `'admin/**'`.

- [ ] **Step 2: Verify locally**

Run: `cd admin && npm ci && npm run typecheck && npm run build && cd .. && node scripts/check-admin.mjs`
Expected: hepsi PASS.

- [ ] **Step 3: Run full backend suite**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/frontend-ci.yml
git commit -m "ci: admin SPA build ve guvenlik kontrolleri"
git push origin master
```

- [ ] **Step 5: Watch all CI workflows**

Run: `gh run list --limit 5`
Expected: `frontend-ci`, `backend-ci`, `mobile-ci` üçü de tetiklenmiş. Her biri için `success` doğrula. **Yeşil olmadan ilerleme.**

- [ ] **Step 6: Deploy backend (migration 0010 dahil)**

```bash
gh workflow run deploy-backend.yml -f confirm=deploy
```

Bekle, `success` doğrula.

- [ ] **Step 7: Provision the first admin**

```bash
cd backend && node dist/scripts/create-admin.js --email <SENIN_EPOSTAN> --name "Ürün Sahibi"
```

Parola sorulur (en az 16 karakter). **Bu adımı senin çalıştırman gerekiyor** — parolayı ben bilmemeliyim.

- [ ] **Step 8: Verify production**

```bash
curl -s https://api.dugunce.com.tr/health/deep          # {"status":"ok","db":"ok"}
curl -s -o /dev/null -w "%{http_code}" https://dugunce.com.tr/spa/   # 200
curl -s -o /dev/null -w "%{http_code}" https://api.dugunce.com.tr/api/v1/admin/overview  # 401
```

Expected: `200`, `200`, `401`.

- [ ] **Step 9: Verify premium actually unlocks mobile features**

Admin panelinden bir test düğününü `PREMIUM` yap, sonra o düğünün bir davetlisinin davetiye linkini aç: **9 kilitli şablon açılmış** ve **davetiye metni düzenleme alanı etkin** olmalı. Bu, panelin varlık sebebi.
