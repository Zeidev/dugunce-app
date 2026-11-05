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
| `npm run admin:create` | İlk `SUPER_ADMIN` hesabını oluşturur (aşağıya bakın) |

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

## Admin hesabı oluşturma (ilk `SUPER_ADMIN`)

**Web'den admin oluşturma ucu YOKTUR** ve bilinçli olarak eklenmez: herkese
açık bir "yetki yükseltme" yüzeyi, tek korunması gereken şey olsa bile yanlış
middleware sırası ya da eksik CSRF kontrolüyle panel ele geçirilebilir demektir.
İlk hesap yalnız sunucuya erişimi olan operatör tarafından, komut satırından
açılır.

```bash
cd backend

# Geliştirme (tsx gerekir)
npm run admin:create
npx tsx scripts/create-admin.ts --email owner@dugunce.com.tr --name "Ürün Sahibi"

# ÜRETİM — sunucuda `tsx` YOKTUR (`npm ci --omit=dev`), derlenmiş dosya kullanılır:
node dist/admin/provision-cli.js --email owner@dugunce.com.tr --name "Ürün Sorumlusu"

# Otomasyon (parola süreç argümanında GÖRÜNMEZ):
pass show dugunce/admin | node dist/admin/provision-cli.js \
  --email owner@dugunce.com.tr --name "Ürün Sorumlusu" --password-stdin
```

`--password-stdin` kullanırken `--email` ve `--name` **zorunludur**: STDIN
parolaya ayrılmıştır, oradan soru sorulamaz (aksi hâlde parola "e-posta"
olarak okunup ekrana basılırdı).

- Parola terminalde **görünmez** (echo kapalı, ham mod) ve **hiçbir yere
  log'lanmaz** — audit `metadata`'sına bile yazılmaz.
- `--password <değer>` **desteklenmez**: `ps aux`, shell geçmişi ve
  `journalctl` çıktısında görünür. Otomasyon için `--password-stdin` var.
- Parola en az **16 karakter**, en az bir **harf** ve bir **rakam** içermeli.
- Aynı e-posta ile hesap **zaten varsa REDDEDİLİR** — üzerine yazılmaz.
  (Bu CLI bir parola sıfırlama aracı değildir.)
- E-posta **yazarken girişle aynı zincirle** normalize edilir
  (`.trim().toLowerCase().normalize('NFC')`); `Owner@X.com` ile açılan hesap
  `owner@x.com` ile giriş yapabilir.
- Oluşturma `ADMIN_CREATED` denetim kaydı yazar (`actorType: SYSTEM`,
  `actorId: null`).

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
