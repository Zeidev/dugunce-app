# Düğünce Backend

Node.js + Express + TypeScript + PostgreSQL backend for **Düğünce** — a wedding planning app.

> **Bağlayıcı belgeler:**
> - [`docs/SECURITY.md`](../docs/SECURITY.md) — güvenlik spesifikasyonu (çelişkide öncelikli)
> - [`docs/superpowers/specs/2026-11-02-dugunce-design.md`](../docs/superpowers/specs/2026-11-02-dugunce-design.md) — ürün ve mimari

---

## CI

Her `backend/**` değişikliğinde GitHub Actions çalışır: Vitest (PGlite),
gerçek PostgreSQL service container ile entegrasyon testleri, typecheck
ve build.

## Hızlı başlangıç

```bash
cd backend
npm install
cp .env.example .env      # değerleri doldur
npm run db:migrate        # şemayı oluştur
npm run dev               # http://localhost:3000
```

```bash
curl http://localhost:3000/health
# {"status":"ok","app":"dugunce-api"}
```

---

## Gereksinimler

| Bileşen | Sürüm | Not |
|---|---|---|
| Node.js | **>= 22** | serv00 varsayılanı `node22` |
| PostgreSQL | **>= 13** | `gen_random_uuid()` çekirdekte |
| npm | >= 10 | |

**Platform notu:** Production hedefi **serv00 (FreeBSD)**. Bu yüzden:

- ❌ **Prisma yok** — native query engine FreeBSD'de çalışmaz
- ❌ **`sharp` yok** — libvips native
- ❌ **native `argon2` yok** — `@node-rs/argon2` (prebuilt) kullanılır
- ✅ **`postgres` sürücüsü** — saf JavaScript

Detay: [`docs/superpowers/specs/2026-11-02-dugunce-design.md`](../docs/superpowers/specs/2026-11-02-dugunce-design.md) §4.

---

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (tsx watch) |
| `npm run build` | `dist/` üretir |
| `npm start` | Üretim sunucusu (`dist/server.js`) |
| `npm test` | Testleri çalıştırır |
| `npm run typecheck` | Tip kontrolü |
| `npm run db:generate` | Şema değişikliğinden migration üretir |
| `npm run db:migrate` | Migration'ları çalıştırır |

---

## Ortam değişkenleri

`.env.example` dosyasına bakın. **Zorunlu:**

| Değişken | Kural |
|---|---|
| `DATABASE_URL` | `postgres://` veya `postgresql://` ile başlamalı |
| `JWT_SECRET` | **En az 32 karakter** |
| `NODE_ENV` | `development` \| `test` \| `production` |

Eksik veya geçersizse uygulama **başlamaz** (`src/config/env.ts`). Hata mesajı hangi alanın sorunlu olduğunu söyler ama **değerleri sızdırmaz**.

---

## Mimari

```
src/
├── app.ts              # Express uygulaması (createApp)
├── server.ts           # Giriş noktası, graceful shutdown
├── config/env.ts       # Zod ile ortam doğrulama
├── db/
│   ├── client.ts       # Lazy postgres bağlantısı, pingDb()
│   ├── schema.ts       # Drizzle şeması
│   └── migrations/     # Üretilmiş SQL
├── lib/
│   ├── errors.ts       # AppError + statik yardımcılar
│   └── logger.ts       # Pino + secret maskeleme
├── middleware/
│   └── error-handler.ts
└── routes/
    └── health.ts       # GET /health (DB'ye dokunmaz)
```

### Önemli kararlar

**`/health` veritabanına dokunmaz.** UptimeRobot her saat çağırır; DB sorgusu eklemek gereksiz yük ve uyku önleme amacını bozar. Derin kontrol `/health/deep` olarak v1.1'de gelecek.

**Bağlantı tembel (lazy).** Modül import edildiğinde değil, ilk sorguda kurulur. Böylece `/health` DB olmadan da çalışır.

**Hata mesajları secret sızdırmaz.** `AppError` mesajları kullanıcıya gösterilebilir; iç detay log'a yazılır (maskelenmiş). Bilinmeyen hatalar `500 INTERNAL` döner, stack response'a **yazılmaz**.

**Log maskeleme.** `token`, `password`, `secret`, `apiKey`, `phone`, `email` alanları ve `postgres://user:pass@host` desenleri `[REDACTED]` olur.

---

## Migration güvenliği

`npm run db:migrate` iki koruma uygular (`scripts/migrate.ts` → `assertSafeTarget`):

1. `NODE_ENV=production` ise `--force` gerekir
2. Bağlantı dizesinde `_prod` / `production` geçiyorsa (NODE_ENV ne olursa olsun) `--force` gerekir

```bash
npm run db:migrate              # staging/geliştirme
npm run db:migrate -- --force   # üretim (bilinçli)
```

Migration'lar **idempotenttir** — tekrar çalıştırmak zarar vermez.

---

## Test

```bash
npm test              # hepsi
npm test -- --watch   # izleme modu
```

PostgreSQL gerektiren testler `DATABASE_URL` yoksa **atlanır** (`describe.skipIf`). CI'da service container ile çalışır.

Test kapsamı:

| Dosya | Ne test eder |
|---|---|
| `config/env.test.ts` | Env doğrulama, secret sızdırmama, UTF-8 |
| `routes/health.test.ts` | 200, DB'siz hız, no-store, 404 formatı |
| `middleware/error-handler.test.ts` | AppError, stack sızdırmama, çift yanıt |
| `lib/logger.test.ts` | Maskeleme, bağlantı dizesi temizleme |
| `db/client.test.ts` | Bağlantı, UTF-8 round-trip |
| `db/migrate.test.ts` | Ortam koruması, idempotency, şema |

---

## Deploy (serv00)

```bash
# Önce ortamı doğrula (tek seferlik)
ssh LOGIN@sX.serv00.com 'bash -s' < scripts/verify-serv00.sh

# Deploy
export SERV00_HOST=sX.serv00.com
export SERV00_USER=LOGIN
export SERV00_DOMAIN=api.dugunce.com.tr
./scripts/deploy-serv00.sh
```

Detay: [`docs/BACKUP.md`](../docs/BACKUP.md), [`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml)

**`node_modules` gönderilmez** — platforma özgü binary'ler yerelde üretilemez. Sunucuda `npm ci --omit=dev` çalışır.

---

## Yedekleme

```bash
export DATABASE_URL='...'
export BACKUP_GPG_PASSPHRASE='...'
./scripts/backup-db.sh
```

Şifreli (AES256), doğrulanmış, 30 gün saklanır. Geri yükleme: `./scripts/restore-db.sh <dosya>`.

Detay: [`docs/BACKUP.md`](../docs/BACKUP.md)

---

## Durum

**Aşama 1 tamamlandı** — bkz. [`docs/STAGE-1-COMPLETE.md`](../docs/STAGE-1-COMPLETE.md)

Sonraki: Aşama 2 (kimlik ve yetkilendirme) — alan adı alınmasını bekliyor.
