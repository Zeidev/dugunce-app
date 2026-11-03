# Düğünce — İlerleme Durumu

**Son güncelleme:** 2026-11-02 (gece)
**Bu dosya tek doğruluk kaynağıdır.** Bir aşama kapandığında burayı güncelle; ayrıntı için ilgili `STAGE-*.md` dosyasına bak.

---

## Özet tablo

| Aşama | Kapsam | Durum | Test |
|---|---|---|---|
| 1 | Altyapı, serv00, PostgreSQL, deploy | ✅ | — |
| 2 | Auth (magic link, JWT, refresh) | ✅ | — |
| 3 | Bütçe, taksit, para aritmetiği | ✅ | — |
| 4 | Davetli + RSVP + davetiye token'ı | ✅ | 608 |
| 5 | Yardımcı, görev, mesajlaşma | ✅ | 820 |
| **5.5** | **Yardımcı oturumu + token TTL** | **✅ canlıda** | **848** |
| 2.5 | Satın alma (Play Billing / StoreKit 2) | ⬜ planlanmadı | — |
| 6 | Görev fotoğrafları (R2) | ⬜ planlanmadı | — |
| 6.5 | Mobil uygulama (KMP) | ✅ **tamamlandı** (2026-11-02) | 76 |
| 7 | Admin paneli | ⬜ planlanmadı | — |
| 8 | Yayın öncesi güvenlik denetimi | ⬜ planlanmadı | — |

**Backend:** 65 dosya, **848 test geçiyor**, 12 atlanmış (DB gerektirenler), typecheck temiz.
**CI:** `backend-ci` ✅, `mobile-ci` ✅ (Android, 1m7s), `deploy-backend` ✅ (elle tetiklenir).
**iOS:** `mobile-ios` ayrı ve elle tetiklenir — macOS runner kapasitesi kısıtlı olduğu için
her push'ta çalıştırmak kırmızı job üretiyordu (`gh workflow run mobile-ios.yml`).

---

## Canlı ortam (doğrulanmış)

| Bileşen | URL | Durum |
|---|---|---|
| API | `https://api.dugunce.com.tr` | ✅ `/health/deep` → `{"status":"ok","db":"ok"}` |
| Davetiye sayfası | `https://dugunce.com.tr/d` | ✅ 200 |
| Yardımcı PWA | `https://dugunce.com.tr/h` | ✅ 200, oturum tabanlı sürüm canlıda |
| PostgreSQL | serv00 (yalnız SSH tüneli) | ✅ migration 0005 uygulandı |

**Deploy:** ✅ **otomatik.** `deploy-backend` workflow'u elle tetiklenir
(`gh workflow run deploy-backend.yml -f confirm=deploy`), onay kapısı + build +
rsync + `npm ci` + migration + restart + `/health/deep` kontrolü yapar.
Son doğrulanmış koşu: `41488084722` ✅ (36 sn).

Repo secret'ları: `SERV00_HOST`, `SERV00_USER`, `SERV00_DOMAIN`, `SERV00_SSH_KEY`.
Environment: `production`. Yedekler sunucuda `/tmp/dist-backup-*.tgz` (son 5).

---

## Mobil uygulama — gerçek durum

### Durum: ✅ tamamlandı (2026-11-02/03)

| Ölçüm | Değer |
|---|---|
| Kotlin satırı | **~10800** (önce 1695) |
| Ekran | **27** enum değeri, hepsi bağlı (önce 4) |
| Test | **128** test metodu (önce 0) |
| Backend desteği | kategori + kart + arama + sayfalama uçları eklendi |
| APK | 18 MB, `mobile-ci` ✅ |
| CI | testler + APK her push'ta |

**Kapatılan kritik kusur:** DTO'lar snake_case `@SerialName` bekliyordu, backend
camelCase döndürüyor — `coupleNames` boş geliyordu. `DtoContractTest` bunu
kilitledi: her DTO gerçek backend JSON'u ile çözülüyor.

**Testlerin yakaladığı 3 gerçek bug:**
1. `Money.parseToKurus("12.000")` noktayı ondalık sanıyordu → binlik/ondalık ayrımı eklendi
2. `encodeUrl` Türkçe harfleri kodlamıyordu (`isLetterOrDigit` ş/ğ/ı için true) → ASCII'ye kısıtlandı
3. DTO testi üretimden farklı `Json` yapılandırması kullanıyordu → üretimle eşitlendi

**Okumayla bulunan 2 işlev boşluğu (testler değil, kod denetimi):**
1. Davet linkleri **göreli** geliyordu (`/h#token`), WhatsApp'a hostsuz link gidiyordu → `util/Links.kt`
2. Düzenleme formları **boş açılıyordu** (`existing = null`), kaydetmek kaydı siliyordu → ekranlar kendi verisini yüklüyor

**Negatif kontrol kanıtı:** `Links.absolute`'tan origin kaldırıldığında 4 test kırıldı (run `41494665772`), geri alınınca yeşil (`41495014458`).

### Eski durum (arşiv)

| Katman | Dosya | Satır | Not |
|---|---|---|---|
| API istemcisi | `api/ApiClient.kt` | 61 | Ktor, Bearer token, üretim URL'i gömülü |
| Hata eşlemesi | `api/Errors.kt` | 50 | HTTP → `ApiException` |
| Modeller | `data/Models.kt` | 181 | `@Serializable` DTO'lar |
| Para | `data/Money.kt` | 66 | Kuruş bazlı, float yok |
| Repository | `data/Repository.kt` | 282 | 21 metot |
| Token saklama | `data/TokenStore.kt` | 68 | multiplatform-settings |
| Ekranlar | `ui/screens/` | 726 | Login, Budget, Guests, Tasks |
| Tema | `ui/theme/Theme.kt` | 48 | |
| Giriş noktaları | `androidMain`, `iosMain` | 56 | MainActivity + MainViewController |

**Toplam: 1695 satır Kotlin.**

### Çalışan kısımlar

- Android debug APK derleniyor (10.5 MB, artifact `13136878115`)
- iOS framework derleniyor (56 MB, `dugunce-ios-framework`)
- Dört ekran: giriş, bütçe, davetli, görev
- Repository'nin 21 metodu backend'in gerçek sözleşmesiyle eşleşiyor (aşağıdaki 1 hata düzeltildi)

### Kalan işler — dış bağımlılık

Aşağıdakiler **mobil kod eksikliği değil**, başka aşamalara veya platformlara bağlı:

| # | Konu | Gerçek engel |
|---|---|---|
| 1 | **iOS Xcode projesi** | Swift kaynak hazır (`iOSApp.swift`, `ContentView.swift`, `Info.plist`, `.entitlements`), ama `iosApp.xcodeproj` yalnızca macOS'ta Xcode ile üretilir. Kurulum adımları `mobile/iosApp/README.md`'de |
| 2 | **Push bildirim gönderimi** | İzin UI'si ve sessiz saat kuralı var; FCM/APNs altyapısı Aşama 6+ işi. Spec §6b.3 "izin verilmezse uygulama çalışır" diyor — polling yeterli |
| 3 | **Görev fotoğrafları** | Aşama 6 (R2 presigned URL + kota) yapılmadı. Spec sırası: fotoğraflar mobilde de görünmeli, ama önce Aşama 6 |
| 4 | **Satın alma (Play Billing)** | Aşama 2.5. Plan ekranı ve limit metinleri hazır, mağaza entegrasyonu yok |
| 5 | **Rehberden davetli seçimi** | Platform izin API'si gerekir; manuel + toplu ekleme çalışıyor |
| 6 | **Offline yazma kuyruğu** | Spec §6b v1.1'e erteledi; okuma önbelleği çalışıyor |

### Düzeltilen bug (2026-11-03) — giriş akışı

Kullanıcı bildirimi: "mail giriyorum, doğrulama maili geliyor ama bağlantıya
tıklayınca onay alamıyorum; kodu gireyim deyince mail alanına dönüyor; kod
geçersiz diyor."

**4 ayrı hata, her biri bir belirtiyi üretiyordu:**

| # | Hata | Belirti | Düzeltme |
|---|---|---|---|
| 1 | Backend linki `https://dugunce.com.tr/auth#<token>` (token **fragment**'te, sunucuya gitmez). Android `getQueryParameter`, iOS `queryItems` fragment'ı **okumaz** | Bağlantıya tıklayınca onay yok | Her iki istemci fragment'ı da ayrıştırıyor (`#token` ve `#token=...`) |
| 2 | `/auth` sayfası **hiç yoktu** — SPA fallback ana sayfayı döndürüyordu | Link açılacak yer bulamıyor | `frontend/public/auth/index.html`: token'ı API'ye doğrular, başarı/hata gösterir, `dugunce://` ile uygulamayı açar, token'ı adres çubuğundan siler |
| 3 | `onEnterCode` → `resetTo(LOGIN)` ekranı **e-posta modunda** yeniden kuruyordu | "Tekrar mail alanına geçiyor" | `AppState.showCodeEntry` + `LoginScreen(startWithCode)` |
| 4 | `AuthResponse.expiresIn` zorunluydu ama backend **göndermiyor** | Doğrulama başarılı olsa bile JSON çözümleme patlar | Varsayılan `900` |

**Kanıt (canlı, gerçek token'larla):**
```
KOD ile verify  (e-posta YOK)  → 200 + accessToken + refreshToken  ✅
TOKEN ile verify (fragment)    → 200 + accessToken                 ✅
aynı token tekrar              → 401 "Geçersiz veya süresi dolmuş"  ✅
```
Test verisi silindi (2 kullanıcı, sahipsiz token yok).

**Regresyon testleri:** `tests/auth/magic-link-flow.test.ts` (12 test) —
link biçimi, fragment'ın sunucuya gitmemesi, kodun e-posta gerektirmemesi,
tek kullanımlık olması, süre ve deneme limiti.

**Güvenlik başlıkları:** `/auth` için `no-store`, `noindex`, `no-referrer`.

### Düzeltilen bug (2026-11-02)

`deleteGuest` yanlış uç kullanıyordu:

```kotlin
// ÖNCE — hiç çalışmıyordu
api.http.patch("weddings/$weddingId/guests/$guestId") { setBody(mapOf("deleted" to true)) }

// SONRA
api.http.delete("weddings/$weddingId/guests/$guestId")
```

**Kanıt:** `validateGuestPatch` probe'u → `REDDEDİLDİ: [{"code":"custom","message":"Güncelleme boş olamaz","path":[]}]`.
`patchSchema` bilinmeyen `deleted` alanını `.strip()` ile atıyor, geriye boş nesne kalıyor ve 400 dönüyordu. Backend'de `DELETE /weddings/:id/guests/:gid` zaten vardı (204).

---

## Açık işler — öncelik sırası

| Öncelik | İş | Neden |
|---|---|---|
| ~~P0~~ | ~~Deploy otomasyonu~~ | ✅ tamamlandı (2026-11-02) |
| **P0** | Mobil testler (`commonTest`) | 1695 satır test edilmemiş kod |
| **P1** | Aşama 2.5 — satın alma | Tüm limitler hazır, kapı yok; premium satılamıyor |
| **P1** | Mobil eksik ekranlar (ayarlar, harcama formu, taksit) | Çift ürünü kullanamıyor |
| **P2** | Aşama 6 — fotoğraflar | |
| **P2** | Aşama 7 — admin paneli | |
| **P3** | Aşama 8 — güvenlik denetimi | Yayın öncesi |

---

## Güvenlik borcu

| Konu | Durum |
|---|---|
| `SECURITY §1.2 #3` (token TTL) | ✅ kapatıldı, canlıda doğrulandı |
| `SECURITY §1.2 #4` (kısa ömürlü oturum) | ✅ kapatıldı, canlıda doğrulandı |
| Deploy SSH anahtarı | ⚠️ `razelkull` hesabında `authorized_keys`'te — iş bitince silinmeli |
| serv00 DB + Brevo şifreleri | ⚠️ sohbette açık — rotate edilmeli |
| Sohbete yapıştırılan GitHub PAT | ⚠️ iptal edilmeli (`gh` keyring OAuth ile çalışıyor) |
| `SECURITY §8` yayın öncesi 14 test | ⬜ Aşama 8'de |

---

## Nasıl doğrulanır

```bash
cd backend
npm test          # 848 passed | 12 skipped
npm run typecheck # 0 hata
npm run verify:migrations  # PGlite, 9 grup

# Canlı
curl https://api.dugunce.com.tr/health/deep
curl -X POST https://api.dugunce.com.tr/api/v1/helper/session \
  -H 'Content-Type: application/json' -d '{"token":"gecersiz"}'   # 404 beklenir

# Mobil (JDK gerekir; bu makinede yok — CI'da doğrulanır)
cd mobile && ./gradlew :composeApp:assembleDebug
```
