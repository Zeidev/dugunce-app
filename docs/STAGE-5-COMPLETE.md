# Aşama 5 — Kapanış Kaydı

**Tarih:** 2026-11-02
**Plan:** `docs/superpowers/plans/2026-11-02-stage-5-tasks.md`
**Durum:** ✅ Tamamlandı — SECURITY §1.2 #3/#4 **Aşama 5.5'te kapatıldı** (oturum + token TTL). Canlı uçtan uca manuel akış hâlâ yapılmadı.

---

## Tamamlanan görevler

| # | Görev | Test (kümülatif) | Durum |
|---|---|---|---|
| 1 | Yardımcı/görev/mesaj şeması + migration `0004` | 675 | ✅ |
| 2 | Yardımcı servisi (oluştur/listele/adlandır/revoke/sil) | 699 | ✅ |
| 3 | Görev servisi (CRUD + atama + `assigned_at`) | 725 | ✅ |
| 4 | Yardımcı token'ı — üretim ve doğrulama | 736 | ✅ |
| 5 | Yardımcıya açık görev görünümü (beyaz liste) | 749 | ✅ |
| 7 | Mesajlaşma + yeniden atama sınırı | 774 | ✅ |
| 9 | Drizzle store'ları (gerçek Drizzle testleri) | 788 | ✅ |
| 6+8 | Yardımcı uçları + mesaj uçları | 808 | ✅ |
| 10 | Yardımcı web sayfası (PWA, `/h#token`) | 817 | ✅ |
| 11 | Kapanış kontrolü + 3 kapanış düzeltmesi | **820** | ✅ |
| 5.5 | Yardımcı oturumu + token TTL (SECURITY §1.2 #3/#4) | **848** | ✅ |

> **Görev sırası:** Plan 6 → 7 → 8 diyordu; routes mesaj servisine ihtiyaç duyduğu için fiili sıra **7 → 6 → 8 → 9 → 10** oldu. Testler aynı.
>
> **Aşama 5 toplamı: 820 test**; oturum katmanı (Aşama 5.5) sonrası **848** (Aşama 4 sonu 608), 65 dosya + 1 atlanmış dosya, 12 atlanmış test.

---

## Kabul listesi — her madde kanıta bağlı

| Kabul maddesi | Kanıt |
|---|---|
| Yardımcı `users` tablosuna **girmiyor** | `helpers` ayrı tablo, `user_id` kolonu yok (`schema-tasks.test.ts`); auth akışı yok |
| Ham token DB'de yok, yalnızca SHA-256 | `helpers_access_token_hash_unique`; `token.test.ts` ham token'ın kolonlarda bulunmadığını doğruluyor |
| Token ≥128 bit entropi | `generateToken()` = 32 bayt → 256 bit, base64url 43 karakter (`token.test.ts`) |
| Görev başına **tek sorumlu** | `tasks.assignee_helper_id` tek kolon; ayrı atama tablosu yok |
| **Yeniden atamada geçmiş görünmez** | `assigned_at` her atamada yenilenir (`assignTask`); `messages/store.ts` `gt(createdAt, since)` SQL'de; gerçek Drizzle testi A→B devrinde B'nin A'nın konuşmasını görmediğini kanıtlıyor |
| `assigned_at` NULL ise sınır kapanmaz | `listMessages` `!task.assignedAt` → `[]`; test bu durumu ayrıca kapsıyor |
| Yardımcı yalnızca **kendi** görevlerini görür | `listForHelper` + `updateTaskStatusAsHelper` her ikisinde `assignee_helper_id = $helperId` |
| Yardımcı yalnızca `status` değiştirir | `ALLOWED_HELPER_PATCH = ['status']`; başka alan → 400 |
| Mesaj idempotency | `messages_task_idem_unique` (task_id, idempotency_key); servis önce arar, yarışta kısıta çarparsa **mevcut mesajı döner** (kapanışta eklendi) |
| Mesaj max 4000 | Servis `MAX_MESSAGE_LENGTH`, DB `char_length(body) <= 4000` + boş gövde CHECK |
| Sayfalama zorunlu, varsayılan 30 / azami 100 | `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`; `limit` kelepçelenir, sınırsız yol yok |
| Görev silinince mesajlar gider | `softDelete` artık **aynı transaction'da** mesajları fiziksel siler (kapanışta düzeltildi) |
| Yardımcı silinince mesaj kalır, yazar null | `sender_helper_id` FK `ON DELETE SET NULL`; gerçek DB testi mesajın kaldığını doğruluyor |
| Ücretsiz limit: 1 yardımcı + 1 görev | `FREE_HELPER_LIMIT` / `FREE_TASK_LIMIT`; limit kontrolü düğün satırı kilidi altında (TOCTOU yok) |
| Tüm testler geçiyor | `65 passed | 1 skipped`, **848 passed / 12 skipped** |
| Typecheck temiz | `tsc --noEmit` → 0 hata |

---

## Review Focus — 5/5 kapatıldı

| # | Kırılma noktası | Nasıl kapatıldı |
|---|---|---|
| 1 | **Yeniden atamada geçmiş sızıntısı** | `assigned_at` her atamada yazılır; filtre SQL'de (`gt(createdAt, since)`), bellekte değil. Gerçek Drizzle testi: A'nın konuşması B'ye görünmüyor, çift hepsini görüyor |
| 2 | **Başka yardımcının görevi** | Her yardımcı sorgusu `assignee_helper_id` ile kapsamlı; `PATCH` yabancı görevde **404** (403 değil) |
| 3 | **Mesaj idempotency** | UNIQUE kısıt + servis ön kontrolü; eşzamanlı çift gönderim artık 500 değil, mevcut mesaj |
| 4 | **Token enumeration** | 256-bit rastgele token, DB'de yalnız SHA-256, arama hash üzerinden indeksli |
| 5 | **Sayfalamasız mesaj çekme** | `limit` varsayılan 30, azami 100; `before` cursor'ı ile geriye sayfalama |

---

## Plandan sapmalar (3 ruling, hepsi canlı DB'de doğrulandı)

### 1. Composite FK + `ON DELETE SET NULL` PostgreSQL'de imkânsız

Plan `(assignee_helper_id, wedding_id) → helpers(id, wedding_id) ON DELETE SET NULL` diyordu. PostgreSQL FK'nın **her** kolonunu NULL'lar; `wedding_id` NOT NULL olduğu için yardımcı silinemez hale geliyordu (PGlite'ta kanıtlandı).

**Karar:** Composite FK **NO ACTION** olarak kalır (düğünler arası atamayı o engelliyor); yardımcı silme servis katmanında transaction içinde önce görev atamalarını temizler, sonra satırı siler. Ham `DELETE helpers` artık FK hatası verir — sessiz yetim görev yerine gürültülü hata, tercih edilen yön.

### 2. `messages` sender CHECK'i gevşetildi

Plan `sender_kind='HELPER' → sender_helper_id NOT NULL` istiyordu; ama FK `ON DELETE SET NULL` olduğu için bu CHECK, **mesajı olan hiçbir yardımcının silinmesini** imkânsız kılıyordu. Aynı çelişki `sender_user_id` için de vardı.

**Karar:** CHECK yalnızca `sender_kind IN ('COUPLE','HELPER')`. "En az bir gönderen id'si" değişmezi serviste (tek gönderen yazılır); geçmişin yardımcı silindikten sonra yaşaması ürün kararıydı.

### 3. Görev/mesaj silme yarı yolda bırakılmıştı

`deleteTask` yalnızca `tasks.deleted_at` yazıyordu. Satır hiç fiziksel silinmediği için `messages.task_id` FK'sinin `ON DELETE CASCADE`'i **hiç tetiklenmiyordu**; silinen görevin konuşması DB'de süresiz kalıyordu.

**Kapanış düzeltmesi:** `softDelete` tek transaction'da önce mesajları siler, sonra görevi işaretler. Kanıt: probe'da soft-delete sonrası `messages` sayısı 1 idi, düzeltmeden sonra 0. Negatif kontrol: silme satırı kaldırılınca test kırılıyor.

---

## Yol boyunca bulunan gerçek sorunlar

| # | Sorun | Belirti | Düzeltme |
|---|---|---|---|
| 1 | Composite FK + SET NULL çelişkisi | Yardımcı silinemiyor, `wedding_id` NOT NULL ihlali | Servis katmanında temizlik + NO ACTION |
| 2 | `messages` CHECK'i SET NULL ile çelişiyor | Mesajı olan yardımcı asla silinemez | CHECK gevşetildi |
| 3 | Yardımcı listesi boş dönüyordu | `listByWedding` üyelik join'i kullanıyor; yardımcının `userId`'si yok | Ayrı `listForHelper` metodu |
| 4 | Atanmamış görev güncellemesi **500** | `updateTask` null dönünce handler 500'e düşüyordu | 404 eşlemesi |
| 5 | **Canlıda sızıntı**: yardımcı mesaj uçları ham satır döndürüyordu | `wedding_id`, `task_id`, `sender_*` istemciye gidiyordu | `messages/helper-view.ts` beyaz liste; E2E tam anahtar kümesini doğruluyor |
| 6 | CI **sahte yeşil** | `vitest | tee` çıkış kodunu yutuyordu; 1 test FAIL iken job success (run `41439711777`) | `shell: bash` + `set -o pipefail`; `Build` testlerden önceye alındı (commit `c17bfe1`) |
| 7 | Silinen görevin mesajları kalıyordu | Soft delete + hiç tetiklenmeyen CASCADE | Yukarıdaki kapanış düzeltmesi |
| 8 | Eşzamanlı idempotent gönderim 500 | UNIQUE çakışması yakalanmıyordu | Çakışmada mevcut mesajı döndür |

---

## Negatif kontroller — her koruma ayrı ayrı kanıtlandı

Her biri "korumayı kaldır → test kırılmalı" ile doğrulandı.

| Koruma | Kaldırılınca kırılan test |
|---|---|
| Ücretsiz limit (yardımcı) | 2 test |
| `clearTaskAssignments` sıralaması | 1 test |
| Düğün üyeliği denetimi | 1 test |
| `assigned_at` her atamada yenilenir | 2 test |
| Revoke edilmiş yardımcıya atama | 1 test |
| `assigneeHelperId` kapısı (PATCH) | 1 test |
| Görev limiti (ücretsiz 1) | 1 test |
| Revoke kapısı (token çözümü) | 1 test |
| Silinmiş düğün kapısı | 1 test |
| Token throttle | 1 test |
| Beyaz liste (görev) | 6 sızıntı testi |
| Beyaz liste (mesaj, canlı sızıntı sonrası) | 1 E2E testi |
| `assigned_at` sınırı (mesaj) | 1 test |
| Yanlış yardımcı erişimi | 1 test |
| Atanmış ama `assigned_at` NULL | 1 test (kapanışta eklendi) |
| `listForHelper` içindeki `assignee` filtresi | 2 test |
| Durum güncellemesindeki `assignee` filtresi | 1 test |
| Mesaj fiziksel silme (görev silme) | 1 test (kapanışta eklendi) |
| Eşzamanlı idempotency çakışması | 1 test (kapanışta eklendi) |
| CI test hatası → kırmızı job | `ci/negative-control` dalı: düşen test → job **failure** |

---

## Canlı ortam

| Kontrol | Sonuç |
|---|---|
| `GET api.dugunce.com.tr/health/deep` | ✅ 200 `{"status":"ok","db":"ok"}` |
| `GET /api/v1/weddings/:id/helpers` (auth yok) | ✅ 401 `UNAUTHORIZED` — rota canlıda |
| `GET /api/v1/weddings/:id/tasks` (auth yok) | ✅ 401 |
| `GET /api/v1/helper/<sahte-token>/tasks` | ✅ 404 `Bağlantı geçersiz veya süresi dolmuş` |
| `dugunce.com.tr/h/` (yardımcı PWA) | ✅ 200 |
| Migration `0004` canlı DB | ✅ 16 tablo, kısıtlar doğrulandı (SDD ledger) |

---

## SECURITY §1.2 — Aşama 5.5'te kapatılan 2 kural

İlk kapanış kaydı yazıldığında `SECURITY.md` §1.2 baştan sona okunmamıştı; iki kural eksikti. Ayrı bir aşamada kapatıldı.

| # | Kural | Durum |
|---|---|---|
| 1 | Yardımcıya ayrı, ≥128 bit token | ✅ 256 bit, base64url 43 karakter |
| 2 | DB'de ham token değil hash | ✅ yalnız SHA-256 |
| 3 | Kabul, süre sonu, yenileme, iptal | ✅ `helpers.expires_at` 90 gün; süresi dolan link 404; iptal `token_revoked_at` |
| 4 | Kısa ömürlü, iptal edilebilir oturum | ✅ `helper_sessions`: 30 dk kayan pencere, 12 saat mutlak tavan, sunucu tarafı iptal; veri istekleri `HttpOnly` çerezle, CSRF double-submit |
| 5 | Yalnızca atanmış görevler + mesajları | ✅ her sorguda `assignee_helper_id` |
| 6 | Atama kaldırılınca erişim anında kesilsin | ✅ atama her istekte okunur; revoke edilen yardımcının oturumu da join'de elenir |

**Davranış değişikliği (kırıcı):** `GET /api/v1/helper/:token/tasks` gibi token'lı veri uçları **kaldırıldı**. Akış: `POST /api/v1/helper/session {token}` → çerez + `csrfToken` → `GET/PATCH/POST /api/v1/helper/tasks…`. Yardımcı PWA (`/h`) buna göre güncellendi; token başarılı oturumdan sonra adres çubuğundan siliniyor.

**Kanıt:** `tests/helpers/session.test.ts` (20 test: kayan pencere, mutlak tavan, CSRF, çerez biçimi), `tests/e2e/helper-app.test.ts` (30 test: token→oturum, oturumsuz 401, URL'de token 404, CSRF'siz 403, revoke → anında 401, süresi dolmuş token 404), `verify-migrations` grup [9] (tablo, UNIQUE, NOT NULL, composite FK, CASCADE).

---

## ⏳ Bekleyen (Aşama 5 dışı)

| Konu | Neden bekliyor |
|---|---|
| **Canlı uçtan uca yardımcı akışı** — gerçek yardımcı oluştur, `/h#token` aç, görev ata, mesajlaş, yeniden ata | Çift hesabı (magic-link e-posta) gerekiyor; otomatik oturum yok. Plan Task 11 Step 2 bu yüzden **açık** bırakıldı |
| WhatsApp'tan görev linki gönderimi | Brevo/WhatsApp şablonları — Aşama 6 sonrası |
| Mobil uygulamada görev ekranı | KMP iskeleti var (`mobile/`), gerçek API entegrasyonu Aşama 6.5 |

---

## Kapanış commit'leri

```
feat(db): add helpers, tasks and messages schema        dc8be5b
feat(helpers): add helper CRUD with token and plan limit e8afd82
feat(tasks): add task CRUD with assignment and assigned_at 6e054a3
feat(helpers): add helper token resolution              01cc002
feat(tasks): add whitelisted helper task view           09926d5
feat(messages): add task messaging with idempotency     0747936
feat(tasks): add drizzle stores for helpers/tasks/messages 6de7139
feat(api): add helper, task and message routes          96d8ac0
feat(web): add helper task PWA and whitelist the message response 159a143
fix(ci): build before tests and stop hiding test failures c17bfe1
```
