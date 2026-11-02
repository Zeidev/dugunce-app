# Aşama 4 — Kapanış Kaydı

**Tarih:** 2026-11-02
**Plan:** `docs/superpowers/plans/2026-11-02-stage-4-guests.md`
**Durum:** ✅ Tamamlandı (11/11 görev)

---

## Tamamlanan görevler

| # | Görev | Test | Durum |
|---|---|---|---|
| 1 | Davetli şeması (2 tablo) + migration | 19 | ✅ |
| 2 | Davetli servisi (CRUD) | 38 | ✅ |
| 3 | **30 davetli limiti** (transaction-safe) | 21 | ✅ |
| 4 | Davetiye token üretimi/doğrulama | 21 | ✅ |
| 5 | Davetliye açık görünüm (beyaz liste) | 19 | ✅ |
| 6 | RSVP işleme (idempotent) | 24 | ✅ |
| 9 | Drizzle store | 19 | ✅ |
| 8 | HTTP route'ları | 28 | ✅ |
| 7 | **GET yan etkisizliği** (gerçek DB) | 8 | ✅ |
| 10 | Migration + limit doğrulama | 12 | ✅ |
| 11 | Kapanış kontrolü | — | ✅ |

**Aşama 4 toplamı: 209 test** (Aşama 3 sonu 371 → **580**)

> **Görev sırası notu:** Plan Task 7'yi Task 8'den önce koyuyordu, ama Task 7'nin testi `GET /invitations/:token` çağırıyor — o endpoint Task 8'de oluşuyor. Plan sırası uygulanamazdı. Fiili sıra: **9 → 8 → 7 → 10 → 11** (store → route → yan etki testi). Testler aynı, sadece derlenebilir sıra.

---

## Kabul listesi — her madde kanıta bağlı

| Kabul maddesi | Kanıt |
|---|---|
| Ücretsiz limit **30 davetli**, premium sınırsız | `FREE_GUEST_LIMIT = 30` (`limit.test.ts` sabit testi); premium yolu `createGuest` testinde |
| Limit yarış koşulunda aşılamaz | `lockWeddingForUpdate` + transaction. `limit-race.test.ts` 4 test (kilitsiz akış 31'e çıkıyor, kilitli akış 30'da duruyor) |
| Ham token DB'de yok, yalnızca SHA-256 | `store.test.ts` + `migrate-guests.test.ts`: `guest_invitations` kolonlarında `token` yok, `token_hash` var |
| Token ≥128 bit entropi | 32 bayt = 256 bit (`invitation.test.ts` → 43 karakter base64url) |
| `GET` yan etki yaratmaz | `invitation-no-side-effect.test.ts` 8 test — satır satır snapshot karşılaştırması + POST kontrol grubu |
| RSVP idempotent | `rsvp.test.ts` + `store.test.ts` (gerçek DB'de `rsvp_at` değişmiyor) |
| İzin verilen kişi sayısı aşılamaz (422) | `rsvp.test.ts` → `RsvpError`; `guests-errors.test.ts` → 422 eşlemesi |
| `allowed_party_size` ≠ `confirmed_party_size` | Şemada iki ayrı kolon (`schema-guests.test.ts`); `public-view.test.ts` ikisini ayrı döndürüyor |
| `rsvp_source` GUEST/COUPLE | `rsvp.test.ts` iki kaynak ayrı test; `store.test.ts` gerçek DB'de `GUEST` yazıldığını doğruluyor |
| `rsvp_deadline` sonrası davetli 410, çift yazabilir | `rsvp.test.ts` iki test + `guests-errors.test.ts` → 410 eşlemesi |
| Silinen davetlinin token'ı 404 | `store.test.ts` (gerçek Drizzle): silme sonrası `resolveInvitation` null |
| Davetliye dönen gövde beyaz liste | `public-view.test.ts` 19 test; `PUBLIC_FIELDS` tam eşleşme; telefon/wedding_id/token_hash dönmüyor |
| Composite FK yanlış `wedding_id` reddeder | `store.test.ts` + `migrate-guests.test.ts` + `verify-migrations.mjs` grup [7] |
| Tüm testler geçiyor | `41 dosya, 580 passed, 9 skipped (589)` |
| Typecheck temiz | `tsc --noEmit` → 0 hata |

---

## Review Focus — 5/5 kapatıldı

| # | Kırılma noktası | Nasıl kapatıldı |
|---|---|---|
| 1 | **Limit yarış koşulu** — iki eşzamanlı ekleme ikisi de "29 var" görür | Düğün satırı transaction içinde kilitlenir, **sonra** sayılır. Kilit sayımdan önce alınmazsa TOCTOU açığı kalır — bu ayrı test ediliyor |
| 2 | **Token enumeration** — token tahmin edilirse tüm davetliler sızar | 256-bit rastgele; DB'de yalnızca SHA-256 hash; doğrulama hash üzerinden |
| 3 | **`GET` yan etkisi** — WhatsApp önizlemesi davetiyeyi yakar | `GET` hiçbir şey yazmıyor; snapshot karşılaştırmalı test + POST kontrol grubu |
| 4 | **RSVP idempotency** — çift tıklama kopya/yanlış sayaç üretir | Aynı durum + aynı kişi sayısı → yazma yok; `rsvp_at` korunur |
| 5 | **Silinen davetlinin linki çalışır** | `deleteGuest` soft delete + token revoke; `resolveInvitation` dördüncü kapı olarak `guest.deletedAt` denetler |

---

## Plandan sapmalar (3 ruling)

### 1. `SELECT COUNT(*) ... FOR UPDATE` PostgreSQL'de YASAK

Plan Task 3 "sayımı `FOR UPDATE` ile kilitle" diyordu. PostgreSQL bunu reddediyor:

```
ERROR: FOR UPDATE is not allowed with aggregate functions
```

**Karar:** Düğün satırı kilitlenir (`SELECT id FROM weddings WHERE id=$1 FOR UPDATE`), **sonra** sayılır. Aynı düğüne yapılan tüm davetli yazmaları serileştirir — limitin ihtiyacı tam olarak bu. Toplu eklemede N davetli satırı kilitlemek gerekmez.

**Bedeli:** Aynı düğüne eşzamanlı eklemeler sıraya girer; yavaş bir toplu ekleme tek eklemeyi bekletir. Kabul edilebilir — ikisi de aynı kullanıcının 30 satırlık limit üzerindeki işlemleri.

### 2. Plan görev sırası uygulanamaz

Task 7 (GET yan etki testi) Task 8'den (route'lar) önce geliyordu, ama testin gövdesi var olmayan bir endpoint'i çağırıyor. Fiili sıra: 9 → 8 → 7.

### 3. Token uzunluğu 43, 64 değil

Plan `toHaveLength(64)` diyordu — 64, SHA-256 hex'in uzunluğu. Token'ın kendisi base64url 32 bayt = **43 karakter**. Base64url korundu (URL-güvenli).

---

## Yol boyunca bulunan 4 gerçek sorun

### 1. Transaction içinde dış `db` kullanılıyordu (test suite'i kilitledi)

`insertGuest`, `lockWeddingForUpdate`, `countActiveGuests`, `getPlan`, `updateRsvp`, `updateGuestRsvp` — hepsi transaction callback'ine verilen `tx`'i yok sayıp dış `db`'yi kullanıyordu.

PGlite tek bağlantı olduğu için dış `db` aynı bağlantıda ikinci transaction açmaya çalıştı ve **kilitlendi**. Test suite dakikalarca asılı kaldı, hata vermedi.

**Gerçek PostgreSQL'de daha kötü olurdu:** hata vermez, sessizce transaction dışına çıkar. Başarısız bir insert geride kilit bırakır.

**Ders:** Asılı kalan test, kırmızı testten daha kötü bir arıza modu — 10 dakika bisect maliyeti. `tx` parametresi alan her fonksiyon onu kullanmalı.

### 2. `updateGuest` id'yi yanlış yere koyuyordu

İmza `(values, weddingId, userId)` idi ve `values` içinde `id` aranıyordu. `id` `SET`'e gidiyordu, `WHERE`'e değil — hiçbir satır eşleşemezdi. İmza `(guestId, values, weddingId, userId)` oldu.

### 3. Türkçe `İ` (U+0130) regex tuzağı

`/isim/i` Türkçe "İsim" ile **eşleşmiyor**: `'İ'.toLowerCase()` = `'i' + U+0307` üretiyor. Test bu yüzden başarısız oluyordu, servis değil. Testler artık `zorunlu` üzerinden eşleşiyor.

**Bu tüm kod tabanı için tuzak** — büyük `İ` içeren Türkçe metne case-insensitive regex yazan herkes aynı duvara çarpar.

### 4. Auth testleri 500 dönüyordu (404 yerine)

`createApp()` → `drizzleGuestDeps()` → gerçek DB bağlantısı. DB yokken 500. `createApp` ve iki router artık depo enjekte edilebilir.

---

## Test kusurları (kendi yazdıklarım)

| Kusur | Düzeltme |
|---|---|
| `expect([401, 403]).toContain(status)` — hiçbir şey kanıtlamıyor | `toHttpError` doğrudan çağrılıyor, her eşleme tek bir koda sabitlendi |
| `public-view.test.ts` fixture'ında sabit `rsvpDeadline = 2026-09-01` | Bugün 2026-11-02, yani tarih geçmişte. Göreli tarihe çevrildi + fixture'ın kendisini belgeleyen ayrı test |
| Yarış testi 30 kayıtla başlıyordu | 29 ile başlamalı — 30'da ikisi de doğru şekilde reddediyor, yarış görünmüyor |
| `store.test.ts` ham SQL çalıştırıyordu (Aşama 3 dersi) | Bu sefer gerçek Drizzle store test edildi; negatif kontrolle kanıtlandı |

---

## Negatif kontroller — 12 koruma ayrı ayrı kanıtlandı

Her biri "korumayı kaldır → test kırılmalı" ile doğrulandı:

| Koruma | Kaldırılınca kırılan test |
|---|---|
| Düğün satırı kilidi | TOCTOU sıra testi (1) |
| `listByWedding` üyelik join'i | IDOR testi (1) |
| `updateGuest` `EXISTS` kontrolü | Savunma derinliği testi (1) |
| `resolveInvitation` revoke kapısı | Revoke testi (1) |
| `resolveInvitation` süre kapısı | Süre testi (1) |
| `resolveInvitation` silinmiş davetli kapısı | Review Focus #5 testi (1) |
| `public-view` beyaz liste | 6 sızıntı testi |
| RSVP idempotency | Idempotency testi (1) |
| RSVP kişi sayısı tavanı | 2 test |
| RSVP deadline kontrolü | 1 test |
| Composite FK (migration) | Script'te FK kontrolü + 3 PGlite testi |
| `GET` saflığı | 3 test (kontrol grubu dahil) |

---

## ⏳ Bekleyen (Aşama 4 dışı)

| Konu | Neden bekliyor |
|---|---|
| Brevo gerçek gönderim | Nameserver yayılımı (24-48 saat) |
| `api.dugunce.com.tr` | serv00 kurulumu + DNS |
| CI'da gerçek PostgreSQL | Repo GitHub'a push edilmedi |
| Davetiye PWA sayfası (`/d#token`) | Frontend — Aşama 7 |
| WhatsApp mesaj şablonları | Aşama 5-6 (gönderim yardımcısı ile) |

---

## Sonraki adım

**Aşama 5 — Yardımcı ve görevler** (`stage-5-tasks.md`)

Yardımcı token'ı (≥128 bit, hesapsız), görev ataması (görev başına tek sorumlu), görev sohbeti (sayfalama + idempotency + `assigned_at` sınırı).

**Aşama 2.5 — Satın alma** Aşama 5'ten sonra: limitler artık iki yerde (30 davetli) uygulanmış durumda; yardımcı limiti eklenince üçüncü kapı da hazır olur.

---

## Kod istatistiği

| Metrik | Değer |
|---|---|
| Test sayısı | **580** (Aşama 3: 371) → **+209** |
| Test dosyası | 41 |
| Aşama 4 kaynak satırı | 1.572 |
| Tablo | **13** (Aşama 3: 11) → +2 |
| Endpoint | 9 yeni (7 çift + 2 davetli) |
