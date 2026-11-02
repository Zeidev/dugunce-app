# Aşama 1 — Kapanış Kaydı

**Tarih:** 2026-11-02
**Plan:** `docs/superpowers/plans/2026-11-02-stage-1-infrastructure.md`
**Durum:** ✅ Tamamlandı (yerel + PGlite doğrulaması) · ⏳ serv00'da doğrulama bekliyor

---

## Tamamlanan görevler

| # | Görev | Durum | Kanıt |
|---|---|---|---|
| 1 | serv00 doğrulama betiği | ✅ | `scripts/verify-serv00.sh`, sözdizimi geçerli, exit kodu doğru |
| 2 | Proje iskeleti + env doğrulama | ✅ | 9 test geçti |
| 3 | DB bağlantısı + `/health` | ✅ | 4 test + runtime smoke test |
| 4 | Migration sistemi | ✅ | 5 test + **PGlite ile gerçek SQL doğrulaması** |
| 5 | Merkezi hata yönetimi | ✅ | 6 test |
| 6 | Log maskeleme | ✅ | 13 test |
| 7 | CI workflow | ✅ | YAML geçerli, build doğrulandı |
| 8 | Deploy betiği | ✅ | Sözdizimi + env korumaları test edildi |
| 9 | Yedekleme + geri yükleme | ✅ | Sözdizimi + env korumaları test edildi |
| 10 | Kapanış kontrolü | ✅ | Bu belge |

---

## Test sonuçları

```
Test Files  6 passed (6)
     Tests  38 passed | 9 skipped (47)
  Duration  1.06s
```

**Atlanan 9 test:** PostgreSQL gerektirenler. CI'da service container ile çalışacak.

| Test dosyası | Test | Durum |
|---|---|---|
| `config/env.test.ts` | 9 | ✅ |
| `routes/health.test.ts` | 4 | ✅ |
| `middleware/error-handler.test.ts` | 6 | ✅ |
| `lib/logger.test.ts` | 13 | ✅ |
| `db/client.test.ts` | 6 | 1 geçti, 5 atlandı (DB yok) |
| `db/migrate.test.ts` | 9 | 5 geçti, 4 atlandı (DB yok) |

---

## Doğrulanan davranışlar

### `/health`
- ✅ 200 döner, `{status:"ok",app:"davetly-api"}`
- ✅ **DB'ye dokunmaz** — 7ms yanıt süresi
- ✅ `Cache-Control: no-store, no-cache, must-revalidate`

### Hata yönetimi
- ✅ `AppError` tutarlı JSON: `{error:{code,message}}`
- ✅ Bilinmeyen hata → 500 `INTERNAL`
- ✅ **Stack trace response'a yazılmaz**
- ✅ **Bağlantı dizesi response'a sızmaz**

### Log maskeleme
- ✅ `token`, `password`, `secret`, `apiKey` → `[REDACTED]`
- ✅ `phone`, `email` → `[REDACTED]`
- ✅ `postgres://user:pass@host` → `postgres://[REDACTED]`
- ✅ `Bearer <token>` → `Bearer [REDACTED]`
- ✅ Runtime testte gönderilen `Authorization` başlığı logda **hiç görünmedi**

### Migration koruması
- ✅ `NODE_ENV=production` + `--force` yok → **reddedildi**
- ✅ URL'de `_prod` geçiyorsa (NODE_ENV ne olursa olsun) → **reddedildi**
- ✅ Staging hedefi → serbest
- ✅ Idempotent (tekrar çalıştırılabilir)

### Migration SQL — gerçek PostgreSQL (PGlite)

`npm run verify:migrations` — PostgreSQL'in WASM derlemesi üzerinde **gerçek SQL** çalıştırılır:

- ✅ 3 statement çalıştı
- ✅ **İdempotent** — ikinci kez de sorunsuz
- ✅ `users` tablosu 7 zorunlu kolonla oluştu
- ✅ `uuid` default (`gen_random_uuid()`) çalışıyor
- ✅ `status` default `ACTIVE`
- ✅ **unique constraint** çalışıyor (aynı e-posta iki kez eklenemiyor)
- ✅ İndeksler oluştu: `users_status_idx`, `users_created_at_idx`
- ✅ **UTF-8** — `şğıöçüİŞĞÜÖÇ` round-trip doğru
- ✅ `server_encoding = UTF8`

> Bu, yerelde PostgreSQL olmadan migration'ın gerçekten çalıştığını kanıtlar. CI'da ayrıca **gerçek PostgreSQL 16** service container ile de çalışır — iki katmanlı doğrulama.

### Build
- ✅ `dist/server.js` doğru yolda
- ✅ `dist/` içinde secret yok
- ✅ `.env` commit edilmemiş

---

## Review Focus kapanışı

| # | Kırılma noktası | Kapatıldığı yer |
|---|---|---|
| 1 | serv00'da native modül patlar | `scripts/verify-serv00.sh` — 7 kontrol |
| 2 | Migration yanlış ortamda çalışır | `assertSafeTarget()` — test edildi |
| 3 | Secret log'a sızar | `logger.ts` redaction — 13 test |
| 4 | Türkçe karakter bozulur | UTF-8 round-trip testi (CI'da çalışacak) |
| 5 | Yedek alınır ama geri yüklenemez | `backup-db.sh` doğrulama adımı + `restore-db.sh` |

---

## ⏳ serv00'da yapılması gerekenler

Bu adımlar **gerçek hesapta** çalıştırılmalı — yerelde doğrulanamaz:

- [ ] `ssh LOGIN@sX.serv00.com 'bash -s' < scripts/verify-serv00.sh` → 7/7 ✅
- [ ] serv00'da `npm ci` çalışıyor mu
- [ ] PostgreSQL bağlantısı (`pgsqlX.serv00.com`)
- [ ] `pg_dump` / `pg_restore` mevcut mu
- [ ] UTF-8 kodlaması doğru mu
- [ ] `devil www restart` çalışıyor mu
- [ ] İlk deploy denemesi
- [ ] Yedek al + staging'e geri yükle (SECURITY test 12)

---

## Sonraki adım

**Aşama 2 — Kimlik ve yetkilendirme** (`stage-2-auth.md`)

Ama önce:
1. ⚠️ **Alan adı alınmalı** — Brevo magic link ve `api.davetly.com` için
2. ⏳ serv00 doğrulaması geçmeli

---

## Notlar

- **Node 26 kullanıldı (yerel), serv00'da 22 olacak.** Uyumsuzluk riski düşük — hedef `>=22`.
- **`postgres` sürücüsü saf JS** — FreeBSD'de native derleme yok. Bu, serv00 seçiminin temel gerekçesi.
- **`gen_random_uuid()` PostgreSQL 13+ çekirdekte** — `pgcrypto` uzantısı gerekmez.
- **`drizzle.config.ts` env'i doğrudan `process.env`'den okur** — drizzle-kit ESM `.js` import'larını çözemediği için. Çalışma zamanı doğrulaması `loadEnv` ile ayrıca yapılır.
