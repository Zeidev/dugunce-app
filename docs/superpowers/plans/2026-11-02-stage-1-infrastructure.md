# Düğünce — Aşama 1: Güvenli Altyapı ve serv00 Doğrulama

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** serv00 üzerinde çalışan, güvenli temelleri kurulmuş bir Node.js + PostgreSQL backend iskeleti üretmek — kod yazmadan önce ortamın gerçekten çalıştığını kanıtlayarak.

**Architecture:** Modüler monolit. Express + TypeScript, Drizzle ORM ile PostgreSQL, Zod ile doğrulama, merkezi hata yönetimi, yapılandırılmış loglama. Tüm serv00'ya özgü kabuller (FreeBSD, native modül yokluğu) **Aşama 1a'da gerçek hesapla doğrulanır** — başarısız olursa plan durur, alternatif karar alınır.

**Tech Stack:** Node.js 22 (serv00), TypeScript 5.x, Express 4.x, Drizzle ORM + `postgres` (pure JS sürücü), Zod, Pino, `@node-rs/argon2`, Vitest, PostgreSQL 16 (serv00).

**Spec:** `docs/SECURITY.md` (bağlayıcı) + `docs/superpowers/specs/2026-11-02-dugunce-design.md`

## Global Constraints

Bu kısıtlar **her görev için** geçerlidir — tekrar yazılmaz, varsayılır.

- **Node.js 22** (serv00 varsayılanı). `node22`/`npm22` binary'leri kullanılır.
- **TypeScript strict mode** açık. `any` yasak (istisna: yorumla gerekçelendirilmiş).
- **Prisma YASAK** — FreeBSD'de native query engine çalışmaz. **Drizzle ORM** kullanılır.
- **`sharp` YASAK** — FreeBSD'de güvenilmez. Görüntü işleme Aşama 6'da `jimp`/`@napi-rs/canvas`.
- **Native argon2 YASAK** — `@node-rs/argon2` (prebuilt) kullanılır.
- **Para asla `float`/`number` değil** — `NUMERIC(12,2)` veya kuruş bazlı integer.
- **Tüm düğün verisi `wedding_id` ile kapsamlı.** Composite FK zorunlu (SECURITY §1.1).
- **Secret koda yazılmaz** — `.env`, `.gitignore`'da. `.env.example` sadece anahtar adları.
- **Log maskeleme zorunlu** — token, parola, telefon, e-posta loglanmaz (SECURITY §3.5).
- **Türkçe** kullanıcı metni; kod/API İngilizce.
- **Tarih UTC saklanır**, `wedding.timezone` ile gösterilir.
- Test framework: **Vitest**. Her görev testleri geçmeden "tamam" değil.

## Review Focus

Spec'in ima ettiği ama hiçbir testin doğrudan kapsamadığı, gerçek kullanıcıyı en çok ısıracak 5 durum. Her biri ilgili göreve test olarak eklenmiştir.

1. **serv00'da native modül derlemesi patlar** — `npm ci` FreeBSD'de başarısız olursa hiçbir şey çalışmaz. (Task 1)
2. **Migration yanlış ortamda çalışır** — staging ve prod karışırsa veri kaybı. (Task 4)
3. **Secret log'a sızar** — bir hata mesajı DB bağlantı dizesini yazdırır. (Task 6)
4. **Türkçe karakter bozulur** — UTF-8 olmayan bağlantıda "şğıöçü" bozulur. (Task 3)
5. **Yedek alınır ama geri yüklenemez** — yedek dosyası bozuk/şifresiz çıkar. (Task 9)

---

## Aşama 1a — Ortam Doğrulaması (KOD YAZMADAN ÖNCE)

> Bu 7 madde geçmeden Aşama 1b'ye başlanmaz. Yanlış varsayım burada 1 gün kaybettirir; Aşama 3'te fark edilirse 2 hafta.

### Task 1: serv00 ortam doğrulama betiği

**Files:**
- Create: `scripts/verify-serv00.sh`
- Create: `docs/VERIFY-SERV00.md` (sonuç kaydı)

**Interfaces:**
- Consumes: yok (ilk görev)
- Produces: `scripts/verify-serv00.sh` — çalıştırılabilir doğrulama betiği; `docs/VERIFY-SERV00.md` — sonuç tablosu

- [ ] **Step 1: Doğrulama betiğini yaz**

`scripts/verify-serv00.sh` — serv00'da SSH üzerinden çalıştırılır, 7 kontrol yapar, çıktı verir:

```bash
#!/usr/local/bin/bash
# serv00 ortam doğrulaması — Aşama 1a
# Kullanım: ssh LOGIN@sX.serv00.com 'bash -s' < scripts/verify-serv00.sh
set -u
fail=0
ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; fail=1; }

echo "=== 1. Node sürümü ==="
node22 --version 2>/dev/null && ok "node22 var" || bad "node22 yok"

echo "=== 2. npm ci ==="
mkdir -p /tmp/vtest && cd /tmp/vtest
echo '{"name":"v","version":"1.0.0","dependencies":{"express":"^4.19.2"}}' > package.json
npm22 install --no-audit --no-fund >/dev/null 2>&1 && ok "npm install çalışıyor" || bad "npm install patladı"

echo "=== 3. Drizzle + postgres sürücü ==="
npm22 install drizzle-orm postgres >/dev/null 2>&1 \
  && node22 -e "require('drizzle-orm'); require('postgres'); console.log('yuklendi')" 2>/dev/null \
  && ok "drizzle + postgres yüklendi" || bad "drizzle/postgres yüklenemedi"

echo "=== 4. @node-rs/argon2 ==="
npm22 install @node-rs/argon2 >/dev/null 2>&1 \
  && node22 -e "const a=require('@node-rs/argon2'); a.hash('test').then(h=>console.log('hash ok',h.slice(0,20)))" 2>/dev/null \
  && ok "argon2 çalışıyor" || bad "argon2 çalışmadı"

echo "=== 5. PostgreSQL bağlantısı ==="
# PG* değişkenleri ortamdan gelir
psql -h "${PGHOST:-pgsqlX.serv00.com}" -U "${PGUSER}" -d "${PGDATABASE}" -c "SELECT version();" 2>/dev/null \
  && ok "PostgreSQL bağlantısı çalışıyor" || bad "PostgreSQL bağlantısı yok"

echo "=== 6. pg_dump ==="
pg_dump --version 2>/dev/null && ok "pg_dump var" || bad "pg_dump yok"

echo "=== 7. UTF-8 ==="
psql -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" -tAc "SHOW server_encoding;" 2>/dev/null | grep -qi utf8 \
  && ok "DB UTF-8" || bad "DB UTF-8 değil"

echo ""
[ $fail -eq 0 ] && echo "🎉 TÜM KONTROLLER GEÇTİ" || echo "⚠️  BAZI KONTROLLER BAŞARISIZ — devam etme"
exit $fail
```

- [ ] **Step 2: Gerçek hesapta çalıştır**

Run: `ssh LOGIN@sX.serv00.com 'bash -s' < scripts/verify-serv00.sh`
Expected: 7 satırda ✅, son satırda "🎉 TÜM KONTROLLER GEÇTİ"

- [ ] **Step 3: Sonucu belgele**

`docs/VERIFY-SERV00.md` oluştur — her kontrolün sonucu, sürümler, tarih. **Başarısız olan varsa dur ve kullanıcıya bildir** (alternatif kütüphane kararı gerekir).

> Bu görev **Review Focus #1**'i kapatır: serv00'da native modül derlemesinin patlaması. Kontrol 2 (`npm ci`), 3 (Drizzle), 4 (argon2) doğrudan bunu sınar.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-serv00.sh docs/VERIFY-SERV00.md
git commit -m "chore: add serv00 environment verification script"
```

---

## Aşama 1b — Altyapı

### Task 2: Proje iskeleti ve yapılandırma

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/.env.example`, `backend/.gitignore`
- Create: `backend/src/config/env.ts`
- Test: `backend/tests/config/env.test.ts`

**Interfaces:**
- Consumes: Task 1 doğrulaması geçmiş olmalı
- Produces: `loadEnv(): Env` — Zod ile doğrulanmış ortam değişkenleri; `Env` tipi

- [ ] **Step 1: Bağımlılıkları kur**

```bash
mkdir -p backend/src backend/tests
cd backend
npm init -y
npm i express@^4.19.2 drizzle-orm postgres zod pino pino-http @node-rs/argon2 dotenv
npm i -D typescript@^5.6 @types/express @types/node vitest tsx supertest @types/supertest drizzle-kit pino-pretty
```

- [ ] **Step 2: `tsconfig.json` yaz**

`strict: true`, `target: ES2022`, `module: NodeNext`, `outDir: dist`, `rootDir: src`, `noUncheckedIndexedAccess: true`.

- [ ] **Step 2b: `vitest.config.ts` ve test kurulumu yaz**

`backend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    env: { NODE_ENV: 'test' },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
```

`backend/tests/setup.ts` — `.env.test` varsa yükler (`dotenv`), yoksa CI ortam değişkenlerini kullanır. DB bağlantısı kurulamazsa DB'ye bağlı testler `it.skip` ile atlanır (CI'da service container olduğu için çalışır).

`backend/.env.test.example` — `DATABASE_URL`, `JWT_SECRET` örnek değerleri (gerçek secret yok).

`backend/package.json` scripts:
```json
{
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts"
}
```

- [ ] **Step 3: Failing test yaz**

`backend/tests/config/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadEnv } from '../../src/config/env'

describe('loadEnv', () => {
  it('geçerli ortamda Env döner', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://u:p@localhost:5432/d',
      JWT_SECRET: 'a'.repeat(32),
      NODE_ENV: 'test',
    })
    expect(env.NODE_ENV).toBe('test')
    expect(env.DATABASE_URL).toContain('postgres://')
  })

  it('eksik JWT_SECRET fırlatır', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/d', NODE_ENV: 'test' }))
      .toThrow(/JWT_SECRET/)
  })

  it('kısa JWT_SECRET reddedilir', () => {
    expect(() => loadEnv({
      DATABASE_URL: 'postgres://u:p@localhost:5432/d',
      JWT_SECRET: 'kisa',
      NODE_ENV: 'test',
    })).toThrow(/JWT_SECRET/)
  })

  it('Türkçe karakterli DATABASE_URL bozulmaz', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://u:p@localhost:5432/d?application_name=şğü',
      JWT_SECRET: 'a'.repeat(32),
      NODE_ENV: 'test',
    })
    expect(env.DATABASE_URL).toContain('şğü')
  })
})
```

- [ ] **Step 4: Testi çalıştır — başarısız olmalı**

Run: `cd backend && npx vitest run tests/config/env.test.ts`
Expected: FAIL — "Cannot find module '../../src/config/env'"

- [ ] **Step 5: `src/config/env.ts` yaz**

Zod şeması: `DATABASE_URL` (url, min 1), `JWT_SECRET` (min 32 karakter), `NODE_ENV` (enum: development|test|production), `PORT` (varsayılan 3000), `BREVO_API_KEY` (opsiyonel), `R2_*` (opsiyonel, Aşama 6'da zorunlu olur), `VAPID_*` (opsiyonel).

`loadEnv(source: Record<string, string|undefined> = process.env): Env` — parse eder, hata varsa alan adlarıyla fırlatır.

- [ ] **Step 6: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/config/env.test.ts`
Expected: PASS (4 test)

- [ ] **Step 7: `.env.example` ve `.gitignore` yaz**

`.env.example` — sadece anahtar adları + örnek değerler, gerçek secret yok.
`.gitignore` — `node_modules/`, `dist/`, `.env`, `*.log`.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold with validated env config"
```

### Task 3: Veritabanı bağlantısı ve health endpoint

**Files:**
- Create: `backend/src/db/client.ts`
- Create: `backend/src/app.ts`, `backend/src/server.ts`
- Create: `backend/src/routes/health.ts`
- Test: `backend/tests/db/client.test.ts`, `backend/tests/routes/health.test.ts`

**Interfaces:**
- Consumes: `loadEnv()` from Task 2
- Produces: `db` (Drizzle instance), `createApp(): Express`, `GET /health` → `{status:"ok",app:"dugunce-api"}`

- [ ] **Step 1: Failing test — health endpoint**

`backend/tests/routes/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'

describe('GET /health', () => {
  it('200 ve beklenen gövde döner', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', app: 'dugunce-api' })
  })

  it('DB erişimi yapmaz (hızlı yanıtlar)', async () => {
    const t0 = Date.now()
    await request(createApp()).get('/health')
    expect(Date.now() - t0).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/routes/health.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: `src/db/client.ts` yaz**

```ts
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { loadEnv } from '../config/env'

const env = loadEnv()
const sql = postgres(env.DATABASE_URL, { max: 10, onnotice: () => {} })
export const db = drizzle(sql)
export { sql }
```

- [ ] **Step 4: `src/routes/health.ts` yaz**

`GET /health` → `{ status: 'ok', app: 'dugunce-api' }`. **DB'ye dokunmaz** (SECURITY §1.5, UptimeRobot pingi).

- [ ] **Step 5: `src/app.ts` yaz**

`createApp()`: Express uygulaması, `express.json()`, health router, 404 handler, merkezi hata handler (Task 6'da genişler).

- [ ] **Step 6: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/routes/health.test.ts`
Expected: PASS (2 test)

- [ ] **Step 7: DB bağlantı testi yaz**

`backend/tests/db/client.test.ts` — `.env.test` ile gerçek DB'ye bağlanır, `SELECT 1` çalıştırır, **UTF-8 kontrolü**:

```ts
it('UTF-8 Türkçe karakterleri bozmadan yazar/okur', async () => {
  const r = await sql`SELECT 'şğıöçüİŞĞÜÖÇ'::text AS t`
  expect(r[0].t).toBe('şğıöçüİŞĞÜÖÇ')
})
```

> Bu test **Review Focus #4**'ü kapatır.

- [ ] **Step 8: Testi çalıştır**

Run: `cd backend && npx vitest run tests/db/client.test.ts`
Expected: PASS — DB yoksa SKIP (CI'da service container ile çalışır)

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat(backend): add db client and health endpoint"
```

### Task 4: Migration sistemi

**Files:**
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/db/migrations/0000_init.sql`
- Create: `backend/scripts/migrate.ts`
- Test: `backend/tests/db/migrate.test.ts`

**Interfaces:**
- Consumes: `db`, `sql` from Task 3
- Produces: `runMigrations(): Promise<void>`; `drizzle-kit generate` ile migration üretimi

- [ ] **Step 1: `drizzle.config.ts` yaz**

`dialect: 'postgresql'`, `schema: './src/db/schema.ts'`, `out: './src/db/migrations'`, `dbCredentials` env'den.

- [ ] **Step 2: İlk şema — sadece `users` tablosu**

`backend/src/db/schema.ts` — `users` tablosu (spec §7'den birebir):

```
id uuid PK default gen_random_uuid()
email text unique not null
display_name text not null
email_verified_at timestamptz null
status text not null default 'ACTIVE'
last_login_at timestamptz null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

- [ ] **Step 3: Migration üret**

Run: `cd backend && npx drizzle-kit generate`
Expected: `src/db/migrations/0000_*.sql` oluşur

- [ ] **Step 4: Failing test — migration idempotent**

`backend/tests/db/migrate.test.ts`:

```ts
it('migration iki kez çalıştırılabilir (idempotent)', async () => {
  await runMigrations()
  await expect(runMigrations()).resolves.not.toThrow()
})

it('users tablosu oluşur', async () => {
  await runMigrations()
  const r = await sql`SELECT to_regclass('public.users') AS t`
  expect(r[0].t).toBe('users')
})
```

- [ ] **Step 5: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/db/migrate.test.ts`
Expected: FAIL — runMigrations yok

- [ ] **Step 6: `scripts/migrate.ts` yaz**

`runMigrations()` — drizzle migrator kullanır. **Ortam koruması:** `NODE_ENV=production` ise `--force` bayrağı olmadan çalışmayı reddeder; `DATABASE_URL` içinde `prod` geçiyorsa ekstra onay ister.

> Bu, **Review Focus #2**'yi kapatır: yanlış ortamda migration çalışmasını engeller.

- [ ] **Step 7: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/db/migrate.test.ts`
Expected: PASS (2 test)

- [ ] **Step 8: Commit**

```bash
git add backend/drizzle.config.ts backend/src/db backend/scripts
git commit -m "feat(db): add drizzle schema, migrations, and env-guarded runner"
```

### Task 5: Merkezi hata yönetimi

**Files:**
- Create: `backend/src/lib/errors.ts`
- Create: `backend/src/middleware/error-handler.ts`
- Test: `backend/tests/middleware/error-handler.test.ts`

**Interfaces:**
- Consumes: `createApp()` from Task 3
- Produces: `AppError` sınıfı (statusCode, code, message), `errorHandler` middleware, tutarlı hata JSON'u `{ error: { code, message } }`

- [ ] **Step 1: Failing test**

```ts
it('AppError tutarlı JSON döner', async () => {
  const app = createApp()
  app.get('/boom', () => { throw new AppError(400, 'BAD_INPUT', 'Geçersiz girdi') })
  const res = await request(app).get('/boom')
  expect(res.status).toBe(400)
  expect(res.body).toEqual({ error: { code: 'BAD_INPUT', message: 'Geçersiz girdi' } })
})

it('bilinmeyen hata 500 döner ve stack sızdırmaz', async () => {
  const app = createApp()
  app.get('/crash', () => { throw new Error('gizli detay') })
  const res = await request(app).get('/crash')
  expect(res.status).toBe(500)
  expect(res.body.error.code).toBe('INTERNAL')
  expect(JSON.stringify(res.body)).not.toContain('gizli detay')
})
```

- [ ] **Step 2: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/middleware/error-handler.test.ts`
Expected: FAIL

- [ ] **Step 3: `src/lib/errors.ts` yaz**

`AppError extends Error` — `constructor(statusCode: number, code: string, message: string)`. Statik yardımcılar: `notFound()`, `unauthorized()`, `forbidden()`, `badRequest()`.

- [ ] **Step 4: `src/middleware/error-handler.ts` yaz**

`AppError` → kendi status/code/message'ı. Bilinmeyen hata → 500 `INTERNAL`, **stack log'a yazılır ama response'a yazılmaz**.

- [ ] **Step 5: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/middleware/error-handler.test.ts`
Expected: PASS (2 test)

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib backend/src/middleware backend/tests/middleware
git commit -m "feat(backend): add AppError and central error handler"
```

### Task 6: Güvenli loglama (maskeleme)

**Files:**
- Create: `backend/src/lib/logger.ts`
- Test: `backend/tests/lib/logger.test.ts`

**Interfaces:**
- Consumes: yok
- Produces: `logger` (Pino instance), `redact(obj)` yardımcısı; `httpLogger` middleware

- [ ] **Step 1: Failing test — maskeleme**

```ts
it('token ve parola maskelenir', () => {
  const line = capture(() => logger.info({ token: 'abc123', password: 'gizli' }, 'test'))
  expect(line).not.toContain('abc123')
  expect(line).not.toContain('gizli')
  expect(line).toContain('[REDACTED]')
})

it('telefon ve e-posta maskelenir', () => {
  const line = capture(() => logger.info({ phone: '+905551112233', email: 'a@b.com' }, 'test'))
  expect(line).not.toContain('+905551112233')
  expect(line).not.toContain('a@b.com')
})

it('DB bağlantı dizesi loglanmaz', () => {
  const line = capture(() => logger.error({ err: new Error('connect failed: postgres://u:p@h/d') }, 'boom'))
  expect(line).not.toContain('postgres://u:p@h/d')
})
```

> Bu test **Review Focus #3**'ü kapatır: secret'ın log'a sızması.

- [ ] **Step 2: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/lib/logger.test.ts`
Expected: FAIL

- [ ] **Step 3: `src/lib/logger.ts` yaz**

Pino + `redact` yapılandırması. Maskelenecek yollar: `req.headers.authorization`, `*.password`, `*.token`, `*.phone`, `*.email`, `*.secret`, `*.apiKey`, `err.message` içinde `postgres://` deseni.

`NODE_ENV=production` → JSON çıktı; development → `pino-pretty`.

- [ ] **Step 4: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/lib/logger.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/logger.ts backend/tests/lib/logger.test.ts
git commit -m "feat(backend): add structured logger with secret redaction"
```

### Task 7: CI — backend

**Files:**
- Create: `.github/workflows/backend-ci.yml`

**Interfaces:**
- Consumes: Task 2-6 tamamlanmış olmalı
- Produces: her push'ta çalışan CI; PostgreSQL service container ile testler

- [ ] **Step 1: Workflow yaz**

`.github/workflows/backend-ci.yml`:

```yaml
name: backend-ci
on:
  push: { paths: ['backend/**', '.github/workflows/backend-ci.yml'] }
  pull_request: { paths: ['backend/**'] }
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: dugunce_test
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm', cache-dependency-path: backend/package-lock.json }
      - run: cd backend && npm ci
      - run: cd backend && npx tsc --noEmit
      - run: cd backend && npx vitest run
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/dugunce_test
          JWT_SECRET: ${{ secrets.CI_JWT_SECRET }}
          NODE_ENV: test
```

- [ ] **Step 2: Push ve CI'ı izle**

Run: `git add .github && git commit -m "ci: add backend workflow" && git push`
Expected: GitHub Actions yeşil

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "ci: verify backend pipeline green"
```

### Task 8: Deploy betiği — serv00

**Files:**
- Create: `scripts/deploy-serv00.sh`
- Create: `.github/workflows/deploy-backend.yml`

**Interfaces:**
- Consumes: Task 7 CI yeşil olmalı
- Produces: `deploy-serv00.sh` — rsync + `devil www restart`; manuel onaylı workflow

- [ ] **Step 1: Deploy betiğini yaz**

`scripts/deploy-serv00.sh`:
- `rsync -az --delete` ile `backend/dist`, `package.json`, `package-lock.json` → serv00 `public_nodejs/`
- **`node_modules` gönderilmez** — serv00'da `npm22 ci --omit=dev` çalışır
- `ssh ... 'cd public_nodejs && npm22 ci --omit=dev && devil www restart DOMAIN'`
- Hata varsa çıkış kodu 1

- [ ] **Step 2: Workflow yaz**

`.github/workflows/deploy-backend.yml` — `workflow_dispatch` (manuel), `environment: production` (GitHub onay gerektirir), secret'lar: `SERV00_SSH_KEY`, `SERV00_HOST`, `SERV00_USER`, `SERV00_DOMAIN`.

- [ ] **Step 3: Dry-run testi**

Run: `ssh LOGIN@sX.serv00.com 'echo ok'`
Expected: `ok` — SSH erişimi doğrulanır

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-serv00.sh .github/workflows/deploy-backend.yml
git commit -m "ci: add serv00 deploy script and manual workflow"
```

### Task 9: Yedekleme ve geri yükleme

**Files:**
- Create: `scripts/backup-db.sh`
- Create: `scripts/restore-db.sh`
- Create: `docs/BACKUP.md`

**Interfaces:**
- Consumes: Task 4 migration'lar, Task 1 `pg_dump` doğrulaması
- Produces: `backup-db.sh` (şifreli dump), `restore-db.sh` (geri yükleme), `docs/BACKUP.md` (prosedür)

- [ ] **Step 1: Yedek betiğini yaz**

`scripts/backup-db.sh`:
- `pg_dump -Fc` (custom format, sıkıştırılmış)
- `gpg --symmetric --cipher-algo AES256` ile şifrele (parola `BACKUP_GPG_PASSPHRASE` env'den)
- Çıktı: `backups/dugunce-YYYYMMDD-HHMM.dump.gpg`
- 30 günden eski yedekleri sil
- Başarısızlıkta çıkış kodu 1

- [ ] **Step 2: Geri yükleme betiğini yaz**

`scripts/restore-db.sh <dosya>`:
- Şifreyi çöz → `pg_restore --clean --if-exists`
- **Hedef DB adı `prod` içeriyorsa onay ister** (interaktif `yes` yaz)
- Restore sonrası `SELECT count(*) FROM users` ile doğrulama

- [ ] **Step 3: Gerçek yedek + restore dene**

Run:
```bash
./scripts/backup-db.sh
./scripts/restore-db.sh backups/<dosya>   # staging DB'ye
```
Expected: Restore başarılı, `users` sayısı eşleşir

> Bu, **Review Focus #5**'i kapatır: yedeğin gerçekten geri yüklenebildiğini kanıtlar (SECURITY test 12).

- [ ] **Step 4: `docs/BACKUP.md` yaz**

Prosedür, sıklık (günlük), saklama (30 gün), şifreleme, restore adımları, staging vs prod uyarısı.

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-db.sh scripts/restore-db.sh docs/BACKUP.md
git commit -m "feat(ops): add encrypted backup and restore scripts"
```

### Task 10: Aşama 1 kapanış kontrolü

**Files:**
- Modify: `docs/VERIFY-SERV00.md` (sonuç güncellemesi)

**Interfaces:**
- Consumes: Task 1-9
- Produces: Aşama 1 tamamlanma kaydı

- [ ] **Step 1: Kabul kontrol listesi**

Her madde gerçekten çalıştırılıp doğrulanır:

- [ ] serv00'da 7 doğrulama geçti (`docs/VERIFY-SERV00.md`)
- [ ] `npm ci` serv00'da çalışıyor
- [ ] Migration staging'de çalıştı, tekrar çalıştırılabilir
- [ ] Migration production koruması çalışıyor (prod'da `--force` olmadan reddediyor)
- [ ] `/health` 200 dönüyor, DB'ye dokunmuyor
- [ ] Hata yanıtı stack sızdırmıyor
- [ ] Log'da token/parola/telefon/e-posta maskeli
- [ ] UTF-8 Türkçe karakterler bozulmuyor
- [ ] CI yeşil (backend)
- [ ] Deploy dry-run çalıştı
- [ ] Yedek alındı ve **staging'e geri yüklendi**

- [ ] **Step 2: Sonucu belgele ve commit**

```bash
git add docs/VERIFY-SERV00.md
git commit -m "docs: stage 1 completion record"
```

---

## Sonraki Planlar

Bu plan **Aşama 1**'i kapsar. Sonraki planlar sırayla:

| Plan | Aşama | Kapsam |
|---|---|---|
| `stage-2-auth.md` | 2 | Magic link, oturum, düğün üyelikleri, tenant izolasyonu |
| `stage-2.5-purchase.md` | 2.5 | Play/App Store makbuz doğrulama |
| `stage-3-budget.md` | 3 | Harcama, taksit, decimal para |
| `stage-4-guests.md` | 4 | Davetli, RSVP, davetiye sayfası |
| `stage-5-tasks.md` | 5 | Yardımcı PWA, görev, sohbet |
| `stage-6-photos.md` | 6 | R2, kota, EXIF |
| `stage-7-admin-mobile.md` | 7 | Admin SPA, KMP mobil |
| `stage-8-release.md` | 8 | 14 güvenlik testi, yayın |
