# Admin paneli — tasarım dokümanı

**Tarih:** 2026-11-05
**Durum:** Onaylandı (2026-11-05) — barındırma `dugunce.com.tr/spa/` olarak değişti
**İlgili:** `2026-11-02-dugunce-design.md` §13 (Aşama 7), §8 (gelir modeli), `SECURITY.md`

---

## 1. Amaç

Bugün ürünün **hiçbir operasyonel görünürlüğü yok**. Kaç kullanıcı kaydoldu, kaç
düğün var, kaçı premium, hangi uç hata veriyor — hiçbiri görülemiyor. Tek bir
kullanıcıya bile premium açmanın yolu yok: `plan` alanını `PREMIUM`'a çeviren
hiçbir kod bulunmuyor.

Bu çalışma, ürün sahibinin tek başına kullanacağı bir **admin paneli** kurar:
giriş, dashboard, kullanıcı/düğün listeleri, **premium aktivasyonu** ve denetim
kaydı.

### Neden şimdi

Son üç turda premium özellikler eklendi (9 kilitli şablon, davetiye metni
düzenleme, sınırsız davetli). Hepsi `plan === 'PREMIUM'` kontrolüne bağlı ve o
alanı **hiçbir şey** değiştirmiyor. Yani eklenen özelliklerin tamamı ölü.
Admin paneli bu kapının açıldığı yer.

---

## 2. Kapsam

### Dahil (v1)

- `admin_accounts`, `admin_sessions`, `audit_logs` tabloları + migration
- Argon2id parola hash + giriş ucu
- HttpOnly cookie oturumu + CSRF (yardımcı oturumu deseninin aynısı)
- İlk `SUPER_ADMIN` için tek seferlik CLI provisioning
- Admin API: `overview`, `users`, `weddings`, `plan` değiştirme, `audit-logs`
- React + TypeScript SPA: giriş, dashboard, kullanıcı listesi, düğün listesi,
  düğün detayı, audit log
- Denetim kaydı — **değiştirilemez** (yalnız ekleme)
- Yetki testleri: girişsiz erişim reddi, IDOR, oturum süresi

### Dahil değil (v1)

- **TOTP 2FA** — kullanıcı kararı (2026-11-05): v1'de yok. Altyapı (tablo
  sütunları) hazır bırakılır, sonraki turda devreye girer.
- Çoklu admin rolü — tek `SUPER_ADMIN`; `role` sütunu genişletilebilir
- Admin'in kullanıcı adına veri girmesi (harcama, davetli)
- Toplu işlemler (bulk suspend, bulk plan)
- E-posta şablonu düzenleme
- Ödeme/makbuz doğrulama — ayrı iş (`POST /purchases/verify`)
- Fotoğraf moderasyonu (Aşama 6, henüz yok)
- Grafikler (v1'de sayısal kartlar; grafik sonraki tur)

### Anti-hedefler

Bu iş şu durumlarda **başarısız** sayılır:

- 2FA'sız (yani v1'de yalnız parolayla) bir admin oturumu, **normal kullanıcı**
  token'ıyla açılabiliyorsa.
- Bir admin, başka bir admin'in oturumunu ele geçirebiliyorsa.
- `audit_logs` kaydı silinebiliyor veya değiştirilebiliyorsa.
- Admin ucu `wedding_id` ile kapsamlanmamış veri döndürüyorsa (IDOR).
- Parola veya oturum token'ı log'a düşüyorsa.
- İlk admin web'den oluşturulabiliyorsa (yalnız CLI).

---

## 3. Kısıtlar

| Kısıt | Kaynak | Etki |
|---|---|---|
| Admin SPA React + TypeScript | design §8 | Vite build gerekir |
| Admin SPA `dugunce.com.tr/spa/` | kullanıcı kararı 2026-11-05 | Build çıktısı `frontend/public/spa/`; kaynak `admin/` |
| Admin cookie taşıma | design §15.1 | Mobil bearer, admin cookie — karıştırılamaz |
| CORS yalnız beyaz liste | `middleware/cors.ts` | SPA ile API farklı origin → `corsForAdmin` şart |
| Parola hash Argon2id | design §8, SECURITY | `@node-rs/argon2` zaten kurulu |
| Audit zorunlu | design §8 | Kritik işlemler kayda girer |
| serv00 kısıtlı kaynak | design §8.2 | Admin SPA statik, Cloudflare'de |
| Migration elle + `IF NOT EXISTS` | `0007`/`0008` deseni | `meta/_journal.json` güncellenir |
| Backend deploy manuel | `deploy-backend.yml` | Migration deploy'a kadar canlıya çıkmaz |

---

## 4. Yaklaşımlar ve seçim

### 4.1 SPA nerede barınacak

**A — Ayrı alt alan adı (`admin.dugunce.com.tr`).** Dokümanın ilk kararı.
Ayrı Cloudflare Pages projesi, ayrı DNS kaydı, ayrı CORS yapılandırması.

**B — Mevcut site altında `dugunce.com.tr/spa/`.** Aynı Cloudflare Pages
projesi, aynı deploy. **CORS gerekmez** (aynı origin). Build çıktısı
`frontend/public/spa/` altına yazılır.

**Seçilen: B** (kullanıcı kararı, 2026-11-05).

Gerekçe:
- **CORS yok.** Aynı origin olduğu için `corsForAdmin` middleware'ine,
  ayrı origin beyaz listesine ve `credentials: true` yapılandırmasına gerek
  kalmaz. CORS yanlış kurulumu (admin'in hiç çalışmaması) riski tamamen
  ortadan kalkar.
- **Tek deploy.** Cloudflare Pages zaten `frontend/` push'unda otomatik
  yayınlıyor; ayrı proje/DNS/secret gerekmez.
- **Cookie `SameSite=Strict`** çalışır — ayrı alt alan adında `SameSite=None`
  + `Secure` gerekirdi ve CSRF yüzeyi büyürdü.

**Bedeli:** React build çıktısı `frontend/public/` içine yazılır, yani bu
dizin artık "build yok" değil. Bunu korumak için:
- Kaynak kod `admin/` kökünde (repo kökünde, `frontend/`'in yanında)
- Build çıktısı `frontend/public/spa/` — **commit edilmez**, CI üretir
- `frontend-ci` build adımını çalıştırır ve çıktıyı doğrular

**Vite yapılandırması:** `base: '/spa/'`, `build.outDir: '../frontend/public/spa'`,
`build.emptyOutDir: true`. SPA yönlendirmesi `_redirects` içinde:
`/spa/*  /spa/index.html  200` (client-side routing için).

### 4.2 Oturum taşıma

**A — Bearer token (mobil gibi).** Basit ama tarayıcıda token saklamak XSS'e
açık (`localStorage`).

**B — HttpOnly cookie + CSRF (yardımcı deseni).** Token JS'ten okunamaz;
CSRF double-submit ile korunur. Yardımcı uygulamasında zaten çalışıyor.

**Seçilen: B.** Gerekçe: aynı desen üretimde kanıtlanmış
(`helpers/session.ts`), XSS'e karşı `localStorage`'dan üstün, design §15.1
zaten bunu emrediyor.

### 4.3 2FA

**Kullanıcı kararı (2026-11-05): v1'de 2FA yok.** Tablo sütunları
(`totpSecret`, `totpEnabledAt`, `recoveryCodes`) **şimdi eklenir** ama
kullanılmaz. Böylece sonraki turda migration gerekmez, yalnız uç + ekran
eklenir.

**Risk ve azaltma:** Parola tek başına yeterli. Azaltmak için:
- Parola en az 16 karakter (yapılandırma zorlaması, CLI'de doğrulanır)
- 5 başarısız denemede hesap kilitlenir (15 dk)
- Oturum 8 saat (2FA yokken daha kısa)
- Tüm giriş denemeleri audit'e yazılır
- `/spa/` önüne Cloudflare Access kuralı eklenebilir (opsiyonel yol
  bazlı kural; uygulama içi yetkilendirmenin yerine geçmez)

---

## 5. Veri modeli

### 5.1 `admin_accounts`

| Sütun | Tip | Not |
|---|---|---|
| `id` | uuid PK | |
| `email` | text unique not null | |
| `password_hash` | text not null | Argon2id |
| `display_name` | text not null | |
| `role` | text not null default `'SUPER_ADMIN'` | v1 tek rol, RBAC'e genişletilebilir |
| `status` | text not null default `'ACTIVE'` | `ACTIVE` \| `SUSPENDED` |
| `failed_attempts` | integer not null default `0` | |
| `locked_until` | timestamptz | 5 hatalı denemede 15 dk |
| `last_login_at` | timestamptz | |
| `totp_secret` | text | **v1'de kullanılmaz**, sonraki tur |
| `totp_enabled_at` | timestamptz | **v1'de kullanılmaz** |
| `recovery_codes` | jsonb | **v1'de kullanılmaz** |
| `created_at`, `updated_at` | timestamptz not null default now() | |

### 5.2 `admin_sessions`

| Sütun | Tip | Not |
|---|---|---|
| `id` | uuid PK | |
| `admin_id` | uuid FK → `admin_accounts(id)` ON DELETE CASCADE | |
| `session_hash` | text unique not null | SHA-256; ham değer DB'de YOK |
| `csrf_hash` | text not null | SHA-256 |
| `ip` | text | |
| `user_agent` | text | |
| `created_at` | timestamptz not null default now() | |
| `last_used_at` | timestamptz not null default now() | |
| `expires_at` | timestamptz not null | mutlak tavan |

**Süreler (2FA yok):** boşta kalma **30 dk**, mutlak tavan **8 saat**.
Kayan pencere yardımcı deseniyle aynı: son 25 dakikada kullanılmadıysa uzat.

### 5.3 `audit_logs`

| Sütun | Tip | Not |
|---|---|---|
| `id` | uuid PK | |
| `actor_type` | text not null | `ADMIN` \| `USER` \| `SYSTEM` |
| `actor_id` | uuid | null olabilir (SYSTEM) |
| `action` | text not null | `ADMIN_LOGIN`, `ADMIN_LOGIN_FAILED`, `ADMIN_LOGOUT`, `WEDDING_PLAN_CHANGED`, `USER_SUSPENDED`, `USER_ACTIVATED` |
| `target_type` | text | `USER` \| `WEDDING` \| null |
| `target_id` | uuid | |
| `metadata` | jsonb | örn. `{ "from": "FREE", "to": "PREMIUM" }` |
| `ip` | text | |
| `created_at` | timestamptz not null default now() | |

**Değiştirilemezlik:** Uygulama katmanında `UPDATE`/`DELETE` yok. DB seviyesinde
ek güvence: `audit_logs` üzerinde `REVOKE UPDATE, DELETE` (serv00 PostgreSQL
kullanıcısı için). Test bunu doğrular.

**PII kuralı:** `metadata`'ya parola, token, TOTP secret **asla** yazılmaz.
E-posta yazılabilir (denetim için gerekli).

### 5.4 Migration

`0010_admin_panel.sql` — `IF NOT EXISTS` deseniyle, `0008`/`0009` ile aynı.
`meta/_journal.json`'a `idx: 10`, `meta/0010_snapshot.json` elle.

---

## 6. API

Tümü `/api/v1/admin/*` altında.

**CORS: GEREKLİ.** İlk bakışta "aynı site" gibi görünse de SPA
`https://dugunce.com.tr/spa/`, API ise `https://api.dugunce.com.tr` —
**farklı origin**'dir (alt alan adı farklı). Tarayıcı bunu cross-origin
sayar.

Bu yüzden `/api/v1/admin/*` altına `corsForAdmin` middleware'i eklenir:
- Beyaz liste: `https://dugunce.com.tr`, `https://www.dugunce.com.tr`,
  `http://localhost:5173` (Vite dev)
- `credentials: true` (cookie taşınacak)
- `allowedHeaders`: `Content-Type`, `Accept`, `X-CSRF-Token`
- `allowedMethods`: `GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`

**Cookie `SameSite`:** Mevcut yardımcı uygulaması `SameSite=None; Secure`
kullanıyor (`helpers/session.ts:cookieString`) ve üretimde çalışıyor.
Aynı desen izlenir — sıfır risk.

> NOT: `dugunce.com.tr` ile `api.dugunce.com.tr` teknik olarak **aynı site**
> (aynı registrable domain) ama **farklı origin**'dir. Teoride `Lax`
> yeterli olmalı; ancak yardımcı uygulamasında kanıtlanmış davranışı
> değiştirmiyoruz. `None; Secure` + CSRF double-submit birlikte güvenli.

### 6.1 Auth

| Uç | Gövde | Yanıt |
|---|---|---|
| `POST /admin/auth/login` | `{ email, password }` | `200 { admin }` + `Set-Cookie` (session, csrf) |
| `POST /admin/auth/logout` | — | `204` + cookie temizleme |
| `GET /admin/auth/me` | — | `200 { admin }` |

**Giriş akışı:**
1. `findAdminByEmail` → yok ise **her zaman aynı hata** (`INVALID_CREDENTIALS`)
   — e-posta sızdırmaz
2. `lockedUntil > now` → `423 ACCOUNT_LOCKED`
3. Argon2id doğrula → yanlış ise `failedAttempts++`; 5'te `lockedUntil = now + 15dk`
4. Doğruysa: `failedAttempts = 0`, oturum üret, audit'e `ADMIN_LOGIN`
5. Ham token yalnız cookie'de; DB'de SHA-256

**Hız sınırı:** IP başına 10 deneme / 15 dk (mevcut `rate-limit` deseni).

### 6.2 Overview

`GET /admin/overview` →

```json
{
  "users": { "total": 42, "newLast7Days": 5 },
  "weddings": { "total": 38, "active": 36, "premium": 3, "free": 35 },
  "guests": { "total": 620, "attending": 210, "declined": 40, "pending": 370 },
  "recentAudit": [ /* son 20 kayıt */ ]
}
```

### 6.3 Kullanıcılar

| Uç | Not |
|---|---|
| `GET /admin/users?q=&cursor=&limit=` | Sayfalama (mevcut `guests` deseni: `cursor` = son id) |
| `GET /admin/users/:id` | Kullanıcı + düğünleri |
| `PATCH /admin/users/:id` | `{ status: 'ACTIVE' \| 'SUSPENDED' }` |

### 6.4 Düğünler

| Uç | Not |
|---|---|
| `GET /admin/weddings?plan=&q=&cursor=` | Plan filtresi + arama |
| `GET /admin/weddings/:id` | Düğün + üyeler + davetli/expense sayıları |
| `PATCH /admin/weddings/:id/plan` | `{ plan: 'FREE' \| 'PREMIUM' }` ← **kritik** |

**Plan değiştirme kuralları:**
- `PREMIUM` → `purchasedAt = now()`, `purchasePlatform = 'ADMIN'`,
  `purchaseToken = null`
- `FREE` → `purchasedAt = null` (geri alma)
- Her değişiklik audit'e: `{ from, to }`
- **Yalnız `SUPER_ADMIN`** (v1'de tek rol, ama kapı açıkça yazılır)

### 6.5 Audit

`GET /admin/audit-logs?action=&actorId=&cursor=` — salt okuma.

---

## 7. Yetkilendirme

**`requireAdmin` middleware:**
1. Cookie'den `a_session` oku
2. SHA-256 → `admin_sessions`'ta ara
3. Süre dolmuş mu (`expiresAt`, `SESSION_MAX_MS`) → 401
4. Boşta kalma aşıldı mı → 401
5. Admin `ACTIVE` mi → 403
6. Kayan pencere: son kullanım > 25 dk önce ise `expiresAt` uzat + cookie yenile
7. `req.admin = { id, email, role }`

**`requireRole('SUPER_ADMIN')`** — plan değiştirme gibi kritik uçlarda.

**CSRF:** Yazma isteklerinde (`POST`/`PATCH`/`DELETE`) `X-CSRF-Token` başlığı
cookie'deki `a_csrf` ile eşleşmeli; ikisi de DB'deki hash ile doğrulanır.

**İzolasyon:** Admin uçları `wedding_id` ile kapsamlanmaz — admin tüm veriyi
görür. Bu bilinçli: operasyonel araç. Ama her yanıt **beyaz liste** alanlarla
kurulur (`...row` yok) — parola hash'i, TOTP secret, refresh token asla dönmez.

---

## 8. CLI provisioning

`backend/scripts/create-admin.ts`:

```bash
npx tsx scripts/create-admin.ts --email owner@dugunce.com.tr --name "Ürün Sahibi"
# Parola sorulur (echo kapalı), en az 16 karakter
```

Kurallar:
- Aynı e-posta varsa **reddedilir** (üzerine yazmaz)
- Parola en az 16 karakter, en az 1 rakam + 1 harf
- Audit'e `ADMIN_CREATED` yazılır
- Web'den admin oluşturma ucu **yok**

---

## 9. SPA

**Kaynak dizin:** `admin/` (repo kökünde, `frontend/`'in yanında)
**Build çıktısı:** `frontend/public/spa/` — commit edilmez, CI üretir
**Yığın:** Vite + React 19 + TypeScript
**Adres:** `https://dugunce.com.tr/spa/`
**Barındırma:** Mevcut Cloudflare Pages projesi (yeni proje/DNS yok)

**`admin/vite.config.ts`:**
```ts
export default defineConfig({
  base: '/spa/',
  build: { outDir: '../frontend/public/spa', emptyOutDir: true },
  plugins: [react()],
})
```

**`frontend/public/_redirects`'e eklenir:**
```
# Admin SPA — client-side routing. Gerçek dosyalar önce gelir.
/spa/*  /spa/index.html  200
```

**`frontend/public/_headers`'a eklenir:**
```
/spa/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
```

**Sayfalar:**
1. `/login` — e-posta + parola
2. `/` — dashboard (4 sayısal kart + son işlemler)
3. `/users` — liste + arama + sayfalama
4. `/users/:id` — detay + askıya al
5. `/weddings` — liste + plan filtresi
6. `/weddings/:id` — detay + **plan değiştir**
7. `/audit` — denetim kaydı + filtre

### 9.1 Tasarım dili — "modern, gelişmiş"

Marka kimliği korunur (Playfair Display + Josefin Sans, altın/adaçayı/krem),
ama **düzen** bir yönetim paneli gibi davranır: yoğun bilgi, hızlı tarama,
az süsleme.

**Renk ve tipografi tokenları** (`admin/src/styles/tokens.css`):

```css
:root {
  /* Marka */
  --gold: #a8925f;      --gold-strong: #8a7443;
  --sage: #4a5f45;      --sage-soft: #eef1ec;
  --cream: #f4f2ee;     --surface: #ffffff;
  --ink: #2d3a2e;       --ink-soft: #55604f;
  --muted: #6a6459;     --line: #e4e0d8;

  /* Durum */
  --ok: #2f6b46;        --ok-soft: #e8f2ec;
  --warn: #8a5f1f;      --warn-soft: #f7efe0;
  --danger: #8c2f2f;    --danger-soft: #f8eaea;

  /* Ölçü — 4px taban */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px;

  --radius: 10px; --radius-lg: 16px;
  --shadow-1: 0 1px 2px rgba(45,58,46,.06);
  --shadow-2: 0 4px 16px rgba(45,58,46,.08);

  --font-display: 'Playfair Display', serif;
  --font-body: 'Josefin Sans', sans-serif;
}
```

**Kontrast kuralı:** gövde metni WCAG AA (≥4.5:1). `--muted` krem üstünde
5.25:1 — mevcut web yüzeyleriyle aynı değer, kanıtlanmış.

**Düzen — sol sabit menü + içerik:**

```
┌────────────┬──────────────────────────────────────────┐
│ Düğünce    │  Genel bakış                    [Çıkış]  │
│ Admin      ├──────────────────────────────────────────┤
│            │  ┌────────┐ ┌────────┐ ┌────────┐ ┌─────┐│
│ ▸ Genel    │  │Kullanıcı│ │ Düğün  │ │Premium │ │Davet││
│ ▸ Kullanıcı│  │   42    │ │   38   │ │   3    │ │ 620 ││
│ ▸ Düğünler │  │ +5 / 7g │ │ 36 aktif│ │ %7.9   │ │     ││
│ ▸ Denetim  │  └────────┘ └────────┘ └────────┘ └─────┘│
│            │                                          │
│            │  Son işlemler                            │
│            │  ┌──────────────────────────────────────┐│
│            │  │ 22:15  PREMIUM açıldı  Elif & Mert   ││
│            │  │ 22:02  Giriş           owner@…       ││
│            │  └──────────────────────────────────────┘│
└────────────┴──────────────────────────────────────────┘
```

- **Sol menü** 232px, koyu adaçayı zemin (`#2d3a2e`), aktif öğe altın şerit
- **İçerik** maks. 1200px, `--s-5` boşluk
- Mobilde menü hamburger'a düşer (panel telefonda kullanılmaz ama bozulmasın)

**Bileşenler (elle yazılır, UI kütüphanesi YOK):**

| Bileşen | Not |
|---|---|
| `StatCard` | Büyük sayı (serif, 32px), etiket (uppercase, 11px, `--muted`), alt satır delta |
| `DataTable` | Yapışkan başlık, zebra yok, satır hover, sıralama oku, boş durum |
| `Badge` | `PREMIUM` altın, `FREE` gri, `ACTIVE` yeşil, `SUSPENDED` kırmızı — **metin her zaman yazılır**, renk tek başına anlatmaz |
| `SearchInput` | 300 ms debounce, `⌘K`/`Ctrl+K` odak |
| `Pagination` | Cursor tabanlı: "Daha fazla" + toplam sayı |
| `ConfirmDialog` | Plan değiştirme gibi geri alınabilir ama önemli işlemlerde |
| `Toast` | Sağ altta, 4 sn, başarı/hata |
| `EmptyState` | İkon + başlık + açıklama (mevcut mobil desenin web karşılığı) |
| `Skeleton` | Yükleme sırasında kart/ satır iskeleti — "boş ekran" yok |

**Etkileşim kuralları:**
- Her eylem <100 ms geri bildirim (buton `loading` durumu)
- Yıkıcı/önemli eylemde onay dialog'u
- Hata **satır içi** gösterilir, alert() yok
- Klavye: `Tab` sırası mantıklı, `Esc` dialog kapatır, `⌘K` arama
- Odak halkası görünür (`outline: 2px solid var(--gold)`)
- Boş liste "kayıt yok" der, hata "yüklenemedi + tekrar dene" der — ikisi karışmaz

**Sayfa başına düzen:**

*Dashboard:* 4 `StatCard` + "Son işlemler" tablosu (20 satır).
*Kullanıcılar:* arama + tablo (e-posta, ad, düğün sayısı, kayıt tarihi, durum).
*Düğünler:* plan filtresi (Tümü/Free/Premium) + tablo (çift, tarih, plan,
davetli, oluşturma). Plan rozeti tıklanabilir değil — değişiklik detayda.
*Düğün detayı:* üstte çift adı + plan `Badge` + **"Planı değiştir"** düğmesi
(onay dialog'u ile). Altta üyeler, davetli sayısı, harcama sayısı.
*Denetim:* aksiyon filtresi + tablo (zaman, aktör, aksiyon, hedef, IP).

**Durum yönetimi:** React Query yok (bağımlılık eklememek için); basit
`useState` + `useEffect` + elle yenileme. v1 için yeterli.

**Güvenlik:** Token `localStorage`'a **yazılmaz** — HttpOnly cookie. SPA
yalnız `credentials: 'include'` ile istek atar; CSRF token'ı cookie'den okur
(`a_csrf`, HttpOnly değil).

---

## 10. Etki alanı

### Backend

| Dosya | Değişiklik |
|---|---|
| `src/db/schema.ts` | 3 tablo |
| `src/db/migrations/0010_admin_panel.sql` | yeni |
| `src/admin/service.ts` | yeni — iş mantığı |
| `src/admin/store.ts` | yeni — Drizzle |
| `src/admin/session.ts` | yeni — oturum (yardımcı deseninin kopyası, `a_*` cookie) |
| `src/admin/middleware.ts` | yeni — `requireAdmin`, `requireRole` |
| `src/routes/admin.ts` | yeni — uçlar |
| `src/middleware/cors.ts` | `corsForAdmin` eklenir |
| `src/app.ts` | `/api/v1/admin` mount + CORS + `adminStore` enjeksiyonu |
| `scripts/create-admin.ts` | yeni — CLI |

### Frontend

| Dosya | Değişiklik |
|---|---|
| `admin/package.json`, `vite.config.ts`, `tsconfig.json` | yeni proje |
| `admin/index.html`, `admin/src/**` | yeni SPA |
| `frontend/public/_redirects` | `/spa/* → /spa/index.html 200` |
| `frontend/public/_headers` | `/spa/*` noindex + no-store |
| `.github/workflows/frontend-ci.yml` | admin build adımı eklenir |
| `.gitignore` | `frontend/public/spa/` (build çıktısı) |

### Değişmeyen

`mobile/` — admin paneli mobilde **yok** (kullanıcı kararı: tek arayüz mobil
ama admin operasyonel, telefonda kullanılmaz).

---

## 11. Testler

### Backend (önce kırmızı)

| Test | Doğrular |
|---|---|
| `admin/auth.test.ts` | Doğru parola → oturum; yanlış → aynı hata (e-posta sızdırmaz) |
| | 5 hatalı deneme → kilit; kilitliyken doğru parola da reddedilir |
| | Askıya alınmış hesap giriş yapamaz |
| | Parola hash'i Argon2id (düz metin değil) |
| `admin/session.test.ts` | Oturum 30 dk boşta ölür; kullanımda uzar |
| | Mutlak tavan 8 saat aşılamaz |
| | CSRF başlığı yoksa yazma reddedilir |
| | Ham token DB'de yok (yalnız hash) |
| `admin/rbac.test.ts` | Admin cookie'si olmadan hiçbir uç çalışmaz |
| | Kullanıcı bearer token'ı admin ucuna **yetmez** (ayrı evren) |
| `admin/plan.test.ts` | `FREE → PREMIUM` → `purchasedAt` dolar, audit yazılır |
| | `PREMIUM → FREE` → `purchasedAt` temizlenir |
| | Geçersiz plan reddedilir |
| `admin/audit.test.ts` | Giriş/çıkış/plan değişimi kaydedilir |
| | `metadata`'da parola/token yok |
| | Kayıt silinemez (store'da `delete` yok) |
| `admin/whitelist.test.ts` | Kullanıcı yanıtı parola hash'i içermez |
| | Düğün yanıtı `purchaseToken` içermez |
| `e2e/admin-flow.test.ts` | Gerçek HTTP: login → overview → plan değiştir → audit |

### Frontend

| Test | Doğrular |
|---|---|
| `frontend-ci.yml` (admin adımı) | `tsc --noEmit` + `vite build` hatasız |
| | Build çıktısı `frontend/public/spa/index.html` üretilmiş |
| `scripts/check-admin.mjs` | `localStorage.setItem` ile token yazımı YOK |
| | `innerHTML` ile kullanıcı verisi basılmıyor |
| | `vite.config.ts` içinde `base: '/spa/'` var |

---

## 12. Riskler

| Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|
| 2FA yok → parola tek savunma | Orta | **Yüksek** | 16 karakter zorunlu, 5 denemede kilit, 8 saat oturum, audit, Cloudflare Access opsiyonu |
| Migration deploy edilmez → 500 | Orta | Yüksek | Deploy aynı turda + `/health/deep` doğrulama |
| Admin cookie'si kullanıcı token'ıyla karışır | Düşük | Yüksek | Ayrı cookie adları (`a_*` vs `h_*`), ayrı tablo, ayrı middleware; test kilitler |
| CORS yanlış yapılandırılır → admin çalışmaz | Orta | Orta | Beyaz liste testi + gerçek tarayıcı doğrulaması |
| Audit log büyür, sorgu yavaşlar | Düşük | Düşük | `created_at` index; v1'de hacim küçük |
| Build çıktısı yanlışlıkla commit edilir | Orta | Orta | `.gitignore`'a `frontend/public/spa/`; CI build eder |
| SPA derin bağlantıda 404 | Orta | Orta | `_redirects`: `/spa/* → /spa/index.html 200`; tarayıcıda doğrulanır |
| CORS eksik → admin hiç çalışmaz | Orta | Yüksek | `corsForAdmin` + gerçek tarayıcı doğrulaması (aynı site ama farklı origin) |

---

## 13. Kabul kriterleri

1. CLI ile `SUPER_ADMIN` oluşturulabiliyor; web'den oluşturma yolu **yok**.
2. Parola ile giriş yapılıyor; HttpOnly cookie veriliyor, JS okuyamıyor.
3. Girişsiz `/admin/*` isteği 401; kullanıcı bearer token'ı 401.
4. Dashboard'da kullanıcı/düğün/davetli sayıları ve premium sayısı görünüyor.
5. Kullanıcı ve düğün listeleri aranabiliyor, sayfalanıyor.
6. Düğün planı `FREE ↔ PREMIUM` değiştirilebiliyor ve **mobilde premium
   özellikler açılıyor** (9 şablon + metin düzenleme).
7. Her plan değişimi audit'e yazılıyor; audit kaydı silinemiyor.
8. 5 hatalı girişte hesap kilitleniyor.
9. `https://dugunce.com.tr/spa/` açılıyor; derin bağlantı (`/spa/weddings/<id>`)
   yenilemede 404 vermiyor.
10. Backend testleri ve mevcut üç CI yeşil.
11. Migration canlıya uygulanmış, `/health/deep` sağlıklı.

---

## 14. Sonraki turlar (bu dokümanın dışında)

- TOTP 2FA (tablo hazır, uç + ekran eksik)
- Grafikler (günlük kayıt, plan dağılımı)
- Sistem sağlığı sayfası (DB boyutu, disk, son hatalar)
- Kullanıcı adına işlem (impersonation) — yüksek risk, ayrı tartışma
- Ödeme/makbuz doğrulama (`POST /purchases/verify`)
