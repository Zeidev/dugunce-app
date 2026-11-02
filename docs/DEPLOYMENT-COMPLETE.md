# Aşama 1-4 — Canlı Ortam Kapanış Kaydı

**Tarih:** 2026-11-02
**Durum:** ✅ Canlı ortam çalışıyor, uçtan uca doğrulandı

---

## Canlı URL'ler

| Bileşen | URL | Hosting |
|---|---|---|
| API | `https://api.dugunce.com.tr` | serv00 (Passenger) |
| Davetiye sayfası | `https://dugunce.com.tr/d` | Cloudflare Pages |
| Ana sayfa | `https://dugunce.com.tr` | Cloudflare Pages |
| PostgreSQL | `pgsql16.serv00.com` | serv00 |

---

## Doğrulanan altyapı

| Kontrol | Sonuç |
|---|---|
| DNS (Cloudflare NS) | ✅ `becky/carlos.ns.cloudflare.com` |
| `api` A kaydı | ✅ `212.91.26.79` (web16) |
| SSL sertifikası | ✅ Let's Encrypt, 2027-01-31'e kadar |
| Node.js | ✅ v22.23.4 (Passenger) |
| PostgreSQL | ✅ 16.10, UTF-8, 13 tablo |
| Composite FK'lar | ✅ `installments_expense_fk`, `guest_invitations_guest_fk` |
| Brevo domain auth | ✅ authenticated, DKIM + SPF + DMARC |
| CI | ✅ GitHub Actions, 80 sn, yeşil |

---

## Doğrulanan işlevler (canlıda, gerçek HTTP)

| Test | Sonuç |
|---|---|
| `GET /health` | ✅ `{"status":"ok","app":"dugunce-api"}` |
| `GET /health/deep` | ✅ `{"status":"ok","db":"ok"}` |
| `POST /auth/magic-link` | ✅ `{"ok":true}`, kullanıcı + token DB'ye yazıldı |
| Brevo e-posta | ✅ HTTP 201, messageId |
| `GET /invitations/:token` | ✅ Beyaz liste (telefon/wedding_id yok) |
| `POST /invitations/:token/rsvp` | ✅ ATTENDING/DECLINED geçişleri |
| İzin aşımı | ✅ **422** "En fazla 4 kişi bildirebilirsiniz" |
| Geçersiz token | ✅ **404** |
| Rate limit | ✅ 7 istekten sonra **429** |
| CORS (izinli origin) | ✅ `access-control-allow-origin` dönüyor |
| CORS (izinsiz origin) | ✅ Başlık yok |
| Güvenlik başlıkları | ✅ `noindex`, `no-referrer`, `X-Frame-Options: DENY`, HSTS |
| Open Graph | ✅ Yok (WhatsApp önizlemesi sızdırmıyor) |
| CASCADE | ✅ Düğün silinince davetli + davetiye gitti |

---

## Yol boyunca bulunan ve düzeltilen 7 gerçek sorun

Hepsi canlıya çıkma sürecinde ortaya çıktı; hiçbiri birim testlerinde görünmüyordu.

### 1. `drizzle-orm` `devDependencies`'te

9 derlenmiş dosya onu çalışma zamanında import ediyor. `npm ci --omit=dev` sonrası uygulama `Cannot find module 'drizzle-orm'` ile çökerdi.

**Düzeltme:** `dependencies`'e taşındı. **Test:** `tests/config/deps.test.ts` — `dist/` içindeki her import'u tarayıp `dependencies`'te olduğunu doğruluyor.

### 2. `dotenv` hiç çağrılmıyordu

`package.json`'da bağımlılık vardı ama `server.ts` import etmiyordu. `.env` ölüydü; her çalıştırma `DATABASE_URL: Required` ile patlıyordu.

**Düzeltme:** `import 'dotenv/config'` en başa. **Test:** iki entrypoint için de sıra kontrolü.

### 3. `migrate-cli`'de `dotenv` yoktu

Aynı hata ikinci kez, bu sefer üretimde migration sırasında. "Bir yerde düzelttim" tuzağı.

**Düzeltme + test:** her `.env` okuyan entrypoint için ayrı test.

### 4. `app.js` Passenger için yanlış formattaydı

Passenger `app.js`'i `require()` ile yüklüyor — ESM dosya patlıyordu. Ayrıca `.env` ve `dotenv` yolları yanlıştı.

**Düzeltme:** CommonJS + dinamik `import()` + açık `.env` yolu + `createRequire`.

**Yan bulgu:** `node app.js` manuel çalıştırınca `EPERM` veriyor — bu **normal**, Passenger soketi devralıyor. Bu, gerçek bir izin sorunu gibi göründüğü için dokümante edildi.

### 5. A kaydı yanlış IP'ye gidiyordu

serv00'nun üç IP'si var: `91.185.184.61` (SSH/DB), `212.91.26.79` (web), `77.79.248.165` (cache). İlk kayıt SSH IP'sine gitti → Let's Encrypt "A record incorrect" verdi.

**Düzeltme:** `212.91.26.79`.

### 6. **CORS başlığı hiç yoktu** — en kritik

Davetiye sayfası `dugunce.com.tr`'den `api.dugunce.com.tr`'ye istek atacak. CORS olmadan tarayıcı **her isteği engellerdi** ve sayfa boş kalırdı.

Sunucu tarafı testleri bunu **asla** yakalayamaz — sadece farklı origin'den bakınca görünür.

**Düzeltme:** Yalnızca davetiye uçlarında CORS, açık origin listesi, `*` asla, `Vary: Origin`, credentials kapalı. **Negatif kontrol:** `*`'a geçince 4 test kırılıyor.

### 7. `SELECT COUNT(*) FOR UPDATE` PostgreSQL'de yasak (Aşama 4'te)

Bellek taze olsun diye: düğün satırı kilitleniyor, `COUNT` değil.

---

## Test istatistiği

| Metrik | Değer |
|---|---|
| Toplam test | **639** |
| Test dosyası | 54 |
| CI süresi | 80 sn |
| Migration | 4 dosya, 13 tablo |
| API endpoint | 21 |

---

## Güvenlik notları

- **`zod` HIGH açığı** belgelendi (`docs/SECURITY-NOTES.md`): koleksiyon doğrulayıcılarında tetikleniyor, bizde `z.array()` yok, body limiti 1 MB → sömürülemez. Zod 4 geçişi 40+ şemada breaking change.
- **Rate limit** kimlik doğrulamasız uçlarda çalışıyor (canlıda 429 doğrulandı).
- **Davetiye token'ı** URL fragment'inde, sunucu loglarına düşmüyor.
- **Beyaz liste** — telefon, `wedding_id`, `token_hash` dönmüyor.

---

## ⏳ Bekleyen

| Konu | Durum |
|---|---|
| **Şifre rotasyonu** | serv00 PostgreSQL + Brevo API anahtarı sohbette açık — değiştirilmeli |
| **SSH anahtarı** | Deploy anahtarı `authorized_keys`'te — iş bitince silinmeli |
| **DMARC `rua`** | `rua@dmarc.brevo.com` — kendi raporlarımız Brevo'ya gidiyor |
| **`noreply@` sender kaydı** | Brevo'da sender olarak eklenmemiş (domain auth yeterli ama istatistik için gerekli) |
| Aşama 5 | Yardımcı + görevler |
| Aşama 2.5 | Satın alma (limitler 2 yerde uygulandı, 3. kapı Aşama 5'te) |

---

## Sonraki adım

**Aşama 5 — Yardımcı ve görevler.**

Yardımcı token'ı (≥128 bit, hesapsız), görev ataması (görev başına tek sorumlu), görev sohbeti (sayfalama + idempotency + `assigned_at` sınırı).

Limitler artık iki yerde (30 davetli + fotoğraf), yardımcı limiti eklenince **Aşama 2.5 (satın alma)** anlamlı olur.
