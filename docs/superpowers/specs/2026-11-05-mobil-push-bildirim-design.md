# Mobil push bildirimleri — tasarım dokümanı

**Tarih:** 2026-11-05
**Durum:** Onaylandı — **kapsam Android-first** (kullanıcı kararı 2026-11-05)
**İlgili:** `2026-11-02-dugunce-design.md` §6b.3 (bildirim olayları), §6b.9, `SECURITY.md`

---

## 0. KAPSAM KARARI — Android-first

Kullanıcı kararı (2026-11-05): **önce yalnız Android çıkar.**

Bu karar iki şeyi değiştirir:

1. **APNs / iOS kanalı bu iş kapsamında YOK.** `apns.ts` yazılmaz,
   `node:http2` riski (bkz. §9) ortadan kalkar. iOS push ayrı bir iş olarak
   sonraya kalır.
2. **Ama iOS derlemesi KIRILMAZ.** `mobile/` hâlâ `iosArm64` +
   `iosSimulatorArm64` hedefliyor ve `mobile-ios.yml` CI'da çalışıyor.
   `commonMain`'e konan her `expect` için `iosMain`'de de `actual` ZORUNLU —
   yoksa iOS derlemesi derlenmez. Bu yüzden iOS tarafına **no-op `actual`**
   yazılır (izin istemez, token döndürmez). Böylece iOS'ta push sessizce
   devre dışı kalır, uygulama çalışmaya devam eder.

Android tarafında tasarım §5–§8 aynen geçerli; iOS'a ait satırlar
"sonraki iş" olarak işaretlendi.

---

## 1. Amaç ve neden

Çiftin telefonuna, düğünle ilgili bir olay olduğunda bildirim gitsin.

**Neden şimdi:** Mobil uygulama (KMP) çalışıyor ama tamamen çekme (pull) tabanlı.
Çift, bir davetlinin RSVP verdiğini ancak uygulamayı açıp davetli listesine
bakınca öğreniyor. Düğün öncesi haftada bu, günde birkaç kez "kontrol etme"
yükü demek. Bildirim, ürünün "gelin ve damat aynı ekranı görür" vaadinin
eksik parçası.

**Neden bu tasarım:** Spec §6b.3 bildirim olaylarını ve kurallarını zaten
tanımlamış ama hiçbir satırı uygulanmamış. Bu doküman o bölümü
**olduğu gibi** hayata geçirir; yeni ürün kararı üretmez.

---

## 2. Kapsam

### Hedefler

1. Android'de FCM ile **gerçek push** (iOS sonraki iş — §0).
2. Dört olay (spec §6b.3) bildirim üretir:
   - `RSVP_RECEIVED` — davetli yanıt verdi → çift
   - `TASK_ASSIGNED` — yardımcıya görev atandı → çift (bilgi)
   - `TASK_MESSAGE` — göreve mesaj geldi → çift
   - `TASK_STATUS_CHANGED` — görev durumu değişti → çift
3. `device_token` DB'de; çıkışta silinir.
4. Sessiz saat 22:00–09:00 (`Europe/Istanbul`), düğün öncesi hafta hariç.
5. İzin verilmezse uygulama **çalışmaya devam eder** (yalnız çekme).
6. Bildirim içeriğinde hassas veri yok (tutar, davetli adı yok).

### Non-goals (bu iş kapsamında DEĞİL)

- **Yardımcılara push.** Yardımcılar token tabanlı, hesabı yok, web'de
  çalışıyorlar (`helpers` tablosu: `access_token_hash`, `user_id` yok).
  Onlara push göndermek ayrı bir kimlik modeli gerektirir. Spec'teki
  "Web push (VAPID)" katmanı da ayrı iş.
- **WhatsApp yedeği** (spec katman 3) — ayrı özellik, mevcut `BulkSendScreen`
  manuel akışını kullanıyor.
- Zamanlanmış/toplu bildirim, kampanya, e-posta bildirimi.
- Bildirim geçmişi ekranı (uygulama içi liste).
- Okundu/teslim takibi (analytics).

### Anti-goals (teknik olarak çalışsa da başarısız sayılır)

- Bildirim gitmediği hâlde "gitti" varsaymak. Sessiz başarısızlık yasak:
  gönderim hatası loglanır ve `device_token` geçersizse **silinir**.
- Push yüzünden uygulamanın açılışını yavaşlatmak veya izin istemeyi
  zorunlu kılmak.
- Bildirim metnine misafir adı/tutar koymak (kilit ekranında görünür).

---

## 3. Kısıtlar

| Kısıt | Etki |
|---|---|
| Backend **serv00 paylaşımlı hosting**, Passenger | `firebase-admin` (~50 MB + grpc native) riskli. **Kullanılmayacak.** |
| Backend bağımlılıkları yalın (8 paket) | Yeni bağımlılık **sıfır** hedefi. |
| iOS hedefleri derlemede kalıyor | `expect` başına `iosMain`'de no-op `actual` şart (§0). |
| `google-services.json` **gizli** | Depoya girmez; kurulum adımı. |
| KMP `expect/actual` deseni mevcut | Token alımı bu desenle yapılır. |
| `admin/` `check-admin.mjs` kuralları | Bu iş admin'i etkilemez. |

---

## 4. Yaklaşımlar

### Değerlendirilen ve elenenler

- **Firebase her iki platformda + `firebase-admin`.** Tek SDK, tek API.
  Elendi: serv00'da grpc native ikilisi kırılgan; iOS'a Firebase SDK boyutu.
- **Yalnız Android, iOS sonra.** En küçük kapsam. Elendi: iPhone'daki eş
  bildirim almaz, "aynı ekran" vaadi yarım kalır.

### Seçilen: Android FCM (HTTP v1), sunucuda SDK yok

> **KAPSAM NOTU (§0):** Aşağıdaki APNs satırları ilk sürümde
> UYGULANMAYACAK. Karar kaydı olarak burada duruyor.

Android `firebase-messaging` kullanır (FCM zorunlu, alternatifi yok).
iOS'ta Firebase **yok**: `UNUserNotificationCenter` + native APNs token.

Sunucu iki protokolü de Node yerleşikleriyle konuşur:

| Kanal | Kimlik doğrulama | Uç |
|---|---|---|
| FCM HTTP v1 | Service account JSON → RS256 JWT imzala → OAuth2 access token (1 saat önbellek) | `POST https://fcm.googleapis.com/v1/projects/<id>/messages:send` |
| APNs | `.p8` anahtarı → ES256 JWT (1 saat yenile) | `POST https://api.push.apple.com/3/device/<token>` (HTTP/2) |

**Neden bu:** serv00'a yeni bağımlılık eklemez; imzalama `node:crypto` ile
yapılır, taşıma `fetch` (FCM) ve `node:http2` (APNs). Karşılığında iki
gönderim yolu ve iki kimlik formatı yazılır (~200 satır).

---

## 5. Nasıl çalışır

### 5.1 Veri modeli

Yeni migration `0011_push_notifications.sql`:

```
device_tokens
  id           uuid pk
  user_id      uuid fk users(id) on delete cascade
  token        text not null unique      -- FCM registration / APNs token
  platform     text not null             -- 'ANDROID' | 'IOS'
  created_at   timestamptz
  last_seen_at timestamptz               -- her uygulama açılışında tazelenir
  index (user_id)
```

`users` tablosuna iki tercih alanı (nullable değil, varsayılanlı):

```
notifications_enabled  boolean not null default true
quiet_hours_override  boolean not null default false   -- düğün öncesi hafta için
```

NEDEN AYRI TABLO, `users.device_token` DEĞİL: bir kullanıcının birden çok
cihazı olabilir (telefon + tablet); tek sütun ikincisini ezer. Ayrıca token
başına `platform` ve `last_seen_at` gerekir.

### 5.2 Uçlar

```
POST   /api/v1/notifications/device      { token, platform }   → 204
DELETE /api/v1/notifications/device      { token }             → 204
GET    /api/v1/notifications/preferences                        → { enabled, quietHoursOverride }
PATCH  /api/v1/notifications/preferences { enabled?, quietHoursOverride? } → 200
```

Hepsi `requireAuth`. `DELETE` çıkışta da çağrılır (spec: "çıkışta silinir");
ayrıca `/auth/logout` sunucu tarafında o kullanıcının **tüm** token'larını
siler — istemci silmeyi unutsa bile.

### 5.3 Olay akışı

Tetikleyiciler mevcut servis fonksiyonları; **iş kuralı değişmez**:

| Olay | Bağlanma noktası | Alıcı |
|---|---|---|
| RSVP | `submitRsvp()` başarılı yazmadan SONRA | düğünün tüm üyeleri (`wedding_members`) |
| Görev atandı | `assignTask()` sonrası | atamayı yapan hariç üyeler |
| Görev mesajı | `sendMessage()` sonrası — **YALNIZ `sender.kind === 'HELPER'`** | düğünün tüm üyeleri |
| Görev durumu | `updateTask()` sonrası | durumu değiştiren hariç üyeler |

**Görev mesajında yön önemli.** `sendMessage()` hem çiftten hem yardımcıdan
gelir (`sender.kind`: `COUPLE` | `HELPER`). Bildirim yalnız **yardımcı
yazdığında** gider: çift kendi yazdığı mesajın bildirimini almamalı, ve
yardımcının hesabı olmadığı için ona push gönderilemez. Yani spec'teki
"karşı taraf" ifadesi, mobil push'ta tek yönlü olarak gerçekleşir —
çift → yardımcı yönü **kapsam dışı** (yardımcı web'de polling ile görür).

**KURAL: gönderim iş akışını BLOKLAMAZ.** `submitRsvp` içinde `await` ile
push göndermek, FCM yavaşsa davetliye 20 sn bekletir. Bu yüzden gönderim
`void notify(...)` ile **arka planda** yapılır; hata loglanır, istek
başarısız olmaz.

### 5.4 Sessiz saat

`Europe/Istanbul` (mevcut `lib/month.ts` `DEFAULT_TIMEZONE`). 22:00–09:00
arası gönderilmez. **Düğün öncesi hafta** (düğün tarihinden 7 gün önce)
kural devre dışı — spec §6b.3.

NEDEN düğün öncesi hafta: son hafta RSVP ve görev trafiği zirvede; gece
gelen bir yanıt sabaha kadar beklememeli.

### 5.5 Bildirim içeriği

Hassas veri YOK (spec kuralı):

```
Başlık:  "Yeni RSVP yanıtı"
Gövde:   "Bir davetli yanıt verdi."        ← isim/sayı YOK
data:    { type: "RSVP_RECEIVED", weddingId: "<uuid>" }
```

Uygulama bildirime dokunulduğunda `data.weddingId` ile ilgili ekrana gider.
Kilit ekranında davetli adı görünmez.

---

## 6. Mobil taraf

### 6.1 `expect/actual` köprüsü (mevcut desen)

`commonMain`:
```kotlin
expect object PushNotifications {
    suspend fun requestPermission(): Boolean
    suspend fun currentToken(): String?
}
```

- `androidMain`: `FirebaseMessaging.getInstance().token` + `POST_NOTIFICATIONS`
  izni (API 33+). `google-services.json` yoksa **uygulama çökmez** —
  `currentToken()` `null` döner ve push sessizce devre dışı kalır.
- `iosMain`: **no-op `actual`** — `requestPermission()` `false`, `currentToken()` `null`.
  iOS push sonraki iş (§0). No-op yazılmasının nedeni iOS DERLEMESİNİN
  kırılmaması: `expect` tanımı tüm hedeflerde `actual` ister.

NEDEN "json yoksa çökmez": `google-services.json` gizli dosya. Yeni bir
geliştirici depoyu klonladığında dosya yok; uygulamanın derlenip çalışması
gerekir. Aksi hâlde push, geliştirmeyi tamamen bloklar.

### 6.2 Token yaşam döngüsü

- Giriş sonrası: izin iste → token al → `POST /notifications/device`.
- Uygulama açılışı: token varsa `last_seen_at` tazele (aynı uç, upsert).
- Çıkış: `DELETE /notifications/device` + yerel token temizliği.
- FCM token yenilenirse (`onNewToken`): yeni token'ı gönder.

### 6.3 İzin isteme zamanı

**İlk açılışta DEĞİL.** Kullanıcı dashboard'u ilk kez gördükten sonra,
ayarlarda açık bir "Bildirimleri aç" satırı + bir kez sorulan nazik
istem. NEDEN: ilk açılışta sorulan izin, ne olduğunu anlamadan
reddediliyor ve bir daha sorulamıyor (iOS'ta kalıcı).

### 6.4 Ayarlar ekranı

`SettingsScreen`'e iki satır: "Bildirimler" (aç/kapat) ve "Sessiz saatler"
bilgi metni. Mevcut tema satırlarının deseniyle.

---

## 7. Kurulum adımları (kullanıcının yapacakları)

Bunlar kod değil, hesap/anahtar işleri. Her biri için ayrıntılı talimat
`docs/PUSH-SETUP.md` olarak yazılacak.

| # | Adım | Çıktı |
|---|---|---|
| 1 | Firebase projesi aç, Android uygulaması ekle (`com.lumibyte.dugunce`) | `google-services.json` |
| 2 | Aynı projede service account oluştur, "Firebase Cloud Messaging API" rolü | service account JSON |
| 3 | ~~Apple Developer'da APNs Auth Key~~ | **Bu iş kapsamında YOK** (iOS sonraki iş) |
| 4 | Anahtarları sunucuya koy (serv00 `.env`, depoya GİRMEZ) | — |
| 5 | `google-services.json`'ı `mobile/composeApp/` altına koy | — |
| 6 | ~~iOS capability + APNs anahtarı~~ | **Bu iş kapsamında YOK** |

`.gitignore`'a: `google-services.json`, `*.p8`, `service-account*.json`.

**Anahtarlar yoksa:** sunucu `PUSH_ENABLED=false` ile çalışır; uçlar
mevcut olur ama gönderim yapılmaz, log'a tek satır uyarı yazılır.

---

## 8. Test stratejisi

- **Birim (backend):** JWT imzalama (FCM/APNs) sabit vektörlerle; sessiz
  saat hesabı (22:00, 08:59, 09:00, düğün öncesi hafta istisnası);
  gönderim hatası → token silme.
- **Sözleşme (backend):** dört uç, `requireAuth`, upsert, çıkışta temizlik.
  `fetch`/`http2` stub'lanır — ağa çıkılmaz (mevcut test deseni).
- **Mobil (commonTest):** token yaşam döngüsü, `MockEngine` ile uç çağrısı.
- **Gerçek cihaz:** Android'de bildirimin gerçekten düştüğü **elle**
  doğrulanır (CI'da yapılamaz). Rapor bunu açıkça "elle doğrulandı" diye
  işaretler.

---

## 9. Riskler

| Risk | Karşılık |
|---|---|
| ~~serv00'da HTTP/2 engeli~~ | **KAPSAM DIŞI** (§0): Android yalnız `fetch` kullanır, `node:http2` gerekmez. iOS'a geçildiğinde ölçülecek. |
| FCM service account JSON sunucuda büyük | `.env`'e tek satır base64; dosya sistemi gerekmez. |
| iOS capability eklenmeden derleme | Kod `#if` ile değil, `expect/actual` ile; iOS'ta Firebase yok, APNs native — capability eklenmezse yalnız token gelmez, çökme olmaz. |
| Sessiz saatte biriken bildirim kaybolur | Kabul edildi (spec böyle). Kayıp değil, ertelenmiyor — bilinçli sadeleştirme. |
| Kullanıcı bildirimi kapatırsa | `notifications_enabled=false` → gönderim atlanır, token durur. |
| Çok düğünlü kullanıcı | `wedding_members` çok üyeliğe izin veriyor. RSVP bildirimi **o düğünün** üyelerine gider (tüm kullanıcının değil); `data.weddingId` hangi düğün olduğunu taşır. |

---

## 10. Yapılacaklar (özet)

1. Migration `0011` + `device_tokens` + `users` tercih alanları.
2. `backend/src/notifications/` — `fcm.ts`, `service.ts`,
   `router.ts`, `quiet-hours.ts`. (`apns.ts` YOK — §0.)
3. Tetikleyici bağlantıları (4 nokta, `void notify(...)`).
4. `/auth/logout` → kullanıcının token'larını sil.
5. Mobil `expect/actual` + token yaşam döngüsü + ayarlar satırları.
6. `docs/PUSH-SETUP.md` (kurulum talimatı).
7. Testler + `.gitignore`.
