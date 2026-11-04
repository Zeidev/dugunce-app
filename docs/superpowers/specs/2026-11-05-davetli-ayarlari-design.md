# Davetli ayarları — tasarım dokümanı

**Tarih:** 2026-11-05
**Durum:** Onay bekliyor
**İlgili:** `2026-11-03-davetiye-sablonlari-design.md` (§5 şablon seti), Brief §5.6 (misafir web davetiyesi), SECURITY §10.2

---

## 1. Amaç

Davetiye davranışını yöneten ayarlar bugün **üç ayrı yere dağılmış** durumda:

| Ayar | Bugün nerede | Sorun |
|---|---|---|
| Şablon + font | Davetli listesinin içinde gömülü kart → `Screen.TEMPLATE` | Listenin parçası gibi görünüyor, ayar olduğu anlaşılmıyor |
| "Kaç kişi geleceksiniz" açık/kapalı | **Yok** | Kapatmanın yolu yok — her davetiye stepper gösteriyor |
| Varsayılan kişi sayısı | `DEFAULT_PARTY_SIZE = 2` (kod içinde sabit) | Çift değiştiremiyor |
| Azami kişi sayısı | `MAX_PARTY_SIZE = 10` (kod içinde sabit) + davetli başına `allowed_party_size` | İki ayrı kavram var, çift ikisini de göremiyor |

Çift, "davetiyem nasıl görünsün ve davetliden ne isteyeyim" sorusunun cevabını
**tek bir yerde** bulamıyor.

Bu çalışma, davetli sayfasına bir **ayarlar düğmesi** ekler ve arkasında
davetiye davranışının tamamını yöneten bir sayfa açar.

### Neden şimdi

Bildirilen hata zinciri (`allowed_party_size` varsayılanı 1'di, "+" basmıyordu)
tek bir gerçeği gösterdi: kişi sayısı davranışı hem kodda sabit hem davetli
başına ayrı duruyor, çiftin elinde hiçbir kumanda yok. Bu, davetiye
özelleştirmesinin eksik kalan parçası.

---

## 2. Kapsam

### Dahil

- Davetli listesine **ayarlar düğmesi** (başlık aksiyonu)
- Yeni `Screen.GUEST_SETTINGS` ekranı:
  - **Davetiye görünümü** girişi → mevcut `Screen.TEMPLATE` (şablon + font)
  - **Kişi sayısı özelliği** aç/kapa anahtarı
  - **Varsayılan kişi sayısı** (1..azami)
  - **Azami kişi sayısı** (1..10)
- `weddings` tablosuna üç sütun + migration
- `weddingInputSchema` / `weddingPatchSchema` alanları
- `public-view.ts` beyaz listesine alan ekleme
- `d/index.html`: özellik kapalıyken stepper **hiç render edilmez**
- Mobil davetli detayında −/+ artık **düğünün azamisine** göre sınırlanır

### Dahil değil

- Serbest renk seçimi / CSS özelleştirmesi — şablon seti sabit kalıyor
  (`2026-11-03` dokümanı §4 kararı A).
- Davetli **başına** özellik kapatma — özellik düğün seviyesinde.
- RSVP sonrası kişi sayısı değiştirme akışının yeniden tasarımı.
- Toplu gönderim ekranında kişi sayısı seçimi (düğün varsayılanını kullanır).
- Bildirim/e-posta hatırlatmaları.

### Anti-hedefler

Bu iş şu durumlarda **başarısız** sayılır:

- Davetiye sayfası yüklenirken POST atar hâle gelirse.
- Özellik kapalıyken davetiye hâlâ `partySize` gönderirse (backend 422 verir,
  davetli "geliyorum" diyemez).
- Düğünün azamisi düşürüldüğünde mevcut davetiyelerin `allowed_party_size`
  değeri **sessizce** düşük kalır ve davetli `+`ya basamaz.
- Çift `default > max` gibi tutarsız bir kombinasyon kaydedebilirse.
- Bir kullanıcı başka düğünün ayarlarını okuyabilir/yazabilirse.

---

## 3. Kısıtlar

| Kısıt | Kaynak | Etki |
|---|---|---|
| Davetiye sayfası yüklenirken yazma yapmaz | `d/index.html` | Ayar okuma yolu (`GET /invitations/:token`) salt okuma kalır |
| Token `#fragment`'te | SECURITY §10.2 | Değişmiyor |
| `PUBLIC_FIELDS` tam beyaz liste | `public-view.test.ts` | Yeni alan listeye **açıkça** eklenir, `...row` yasak |
| Open Graph etiketi yok | SECURITY | Değişmiyor |
| Tasarım değerleri merkezi tokenlardan | Brief §3.2 | Ham renk/ölçü yazılmaz |
| Durumlar yalnız renkle anlatılmaz | Brief §3.1 | Anahtar + metin |
| Migration elle yazılır, `drizzle-kit generate` ile | `verify:migrations` | `meta/_journal.json` güncellenir |
| Backend deploy **manuel** | `deploy-backend.yml` | Migration deploy'a kadar canlıya çıkmaz |
| Mobil doğrulama yalnız metadata derlemesi | Android SDK yok | Gerçek build CI'da |

---

## 4. Yaklaşımlar ve seçim

Kişi sayısı ayarının düğün ve davetli seviyeleri arasında nasıl dağıtılacağı
üç şekilde olabilirdi.

**A — Yalnız düğün seviyesinde tek ayar.** Davetli detayındaki −/+ kalkar.
Her davetiye aynı aralığı gösterir (`1..azami`, `varsayılan`dan başlar).
En az kavram; ama 5 kişilik aileye 5, bekâr davetliye 2 verilemez — herkes
azamiye kadar getirebilir.

**B — Düğün varsayılanı + davetli başına istisna.** Düğünde özellik aç/kapa,
varsayılan ve azami belirlenir. Davetli detayındaki −/+ **kalır** ve "bu
davetli için azami" olur: yeni davetliye düğünün varsayılanı gelir, düğünün
azamisini geçemez. `invitations.allowed_party_size` bugünkü anlamını korur.

**C — Özelliği tamamen kaldır.** Davetiye her zaman iki düğme; ayar sayfasında
yalnızca görünüm. "Kaç kişi" bilgisi tamamen kaybolur.

**Seçilen: B.** Gerekçe: mevcut `allowed_party_size` şeması zaten davetli
başına ve göç gerektirmiyor; çiftin gerçek ihtiyacı ("kalabalık aileye geniş
izin, bekâra dar izin") yalnız B'de karşılanıyor; A'ya geçiş sonradan veri
kaybı olmadan mümkün (davetli değerleri düğün varsayılanına çekilir).

### B'nin çözmesi gereken türetme sorunu

Üç değer birbiriyle tutarlı olmalı:

```
1 ≤ defaultPartySize ≤ maxPartySize ≤ 10
```

ve her davetlinin etkin azamisi:

```
effectiveMax(davetli) = min(davetlinin allowed_party_size'ı, düğünün maxPartySize'ı)
```

`min` alınır çünkü düğünün azamisi **üst sınır**tır: çift azamiyi 10'dan 4'e
düşürdüğünde daha önce 10 izinli davetli de 4'e inmelidir. Aksi hâlde ayar
yalan söyler. Davetlinin kendi değeri düğün varsayılanından küçükse o korunur
(çift bilinçli olarak dar izin vermiştir).

---

## 5. Veri modeli

### 5.1 Yeni sütunlar — `weddings`

| Sütun | Tip | Varsayılan | Anlam |
|---|---|---|---|
| `party_size_enabled` | `boolean NOT NULL` | `true` | Davetiye "kaç kişi" sorusunu göstersin mi |
| `default_party_size` | `integer NOT NULL` | `2` | Yeni davetiyenin başlangıç izni |
| `max_party_size` | `integer NOT NULL` | `10` | Çiftin izin verdiği üst sınır |

Varsayılanlar bugünkü davranışı **birebir** korur: `true` + `2` + `10` =
mevcut üretim davranışı. Migration canlıya çıktığında hiçbir davetiye
görünüm değiştirmez.

Migration: `0008_party_size_settings.sql`

```sql
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "party_size_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "default_party_size" integer DEFAULT 2 NOT NULL;
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "max_party_size" integer DEFAULT 10 NOT NULL;
```

`IF NOT EXISTS` — `0007` ile aynı desen; yarıda kalan deploy tekrar
çalıştırılabilir.

### 5.2 Doğrulama kuralları

`weddingInputSchema`'ya eklenir:

| Alan | Kural | Hata mesajı |
|---|---|---|
| `partySizeEnabled` | `boolean` | — |
| `defaultPartySize` | tam sayı, `1..10` | `Kişi sayısı 1-10 arasında olmalı` |
| `maxPartySize` | tam sayı, `1..10` | `Kişi sayısı 1-10 arasında olmalı` |

**Çapraz kural** (`default ≤ max`) tek başına şemada doğrulanamaz, çünkü
`PATCH` kısmi: yalnız `maxPartySize` gönderildiğinde `defaultPartySize`
şemada yoktur. Bu yüzden kontrol **servis katmanında**, birleşik sonuç
üzerinden yapılır (`updateWedding` içinde, `findById` sonrası):

```ts
const nextDefault = patch.defaultPartySize ?? existing.defaultPartySize
const nextMax = patch.maxPartySize ?? existing.maxPartySize
if (nextDefault > nextMax) {
  throw AppError.badRequest(
    'Varsayılan kişi sayısı azamiyi geçemez', 'PARTY_SIZE_INCONSISTENT')
}
```

`AppError.badRequest` → 400; mobil aynı mesajı gösterir.

Mobil istemci Kaydet'te **her iki alanı birlikte** gönderdiği için bu duruma
normalde düşmez. Kural yine de sunucuda duruyor: API doğrudan çağrılabilir
(kıvrımlı istemci, ileride web paneli) ve istemciye güvenmek `allowed_party_size`
hatasının tekrarı olurdu.

### 5.3 Beyaz liste

`PUBLIC_FIELDS`'a üç alan eklenir: `partySizeEnabled`, `defaultPartySize`,
`maxPartySize`. `allowedPartySize` **etkin değer** olarak döner
(`min(davetli, düğün max)`), böylece istemci iki değeri birleştirmek zorunda
kalmaz ve eski istemciler bozulmaz.

---

## 6. Akışlar

### 6.1 Davetli listesi → ayarlar

`GuestListScreen` başlığında `AppIcons.Settings` ikonu (içerik açıklaması
"Ayarlar"). Basınca `Screen.GUEST_SETTINGS`.

Ayarlar düğmesi **her zaman** görünür (liste boşken de): davetiye görünümü
henüz davetli yokken de anlamlı bir ayardır.

Mevcut "Davetiye görünümü" kartı listeden **kaldırılır** — aynı giriş artık
ayarlar sayfasında. İki yerde olması "hangisi doğru" sorusu doğurur.

### 6.2 Ayar sayfası

```
┌─────────────────────────────┐
│ ‹  Davetli ayarları  KAYDET │  ← KAYDET yalnız değişiklik
├─────────────────────────────┤     varsa etkin
│ DAVETİYE                    │
│ ┌─────────────────────────┐ │
│ │ Davetiye görünümü       │ │
│ │ Zarif · Parisienne    › │ │
│ └─────────────────────────┘ │
│                             │
│ KİŞİ SAYISI                 │
│ ┌─────────────────────────┐ │
│ │ Davetliye "kaç kişi"    │ │
│ │ sorusu sorulsun    [ ●] │ │
│ │ Kapalıyken davetiye     │ │
│ │ yalnız "Geliyorum" /    │ │
│ │ "Gelemeyeceğim" gösterir│ │
│ └─────────────────────────┘ │
│                             │
│ Varsayılan    [−]  2  [+]   │  ← anahtar kapalıyken
│ Yeni davetliler bu sayıyla  │     soluk + dokunulamaz
│ başlar                      │
│                             │
│ Azami         [−] 10  [+]   │
│ Davetli en fazla bu kadar   │
│ kişi getirebilir            │
│                             │
│ ⓘ Azamiyi düşürürsen daha   │
│   önce geniş izin verdiğin  │
│   davetliler de bu sınıra   │
│   iner.                     │
└─────────────────────────────┘
```

Davranış:

- **Kaydet düğmesi** `TopBar` aksiyonu olarak sağ üstte. Yalnız
  **değişiklik varsa** etkin (`actionEnabled = dirty && !saving`). Değişiklik
  yokken soluk durur — basılıp hiçbir şey yapmayan düğme gösterilmez.
- Değişiklikler **yerel** tutulur; sunucuya yalnız Kaydet'te gidilir. Tek
  `PATCH /weddings/:id`, yalnız **değişen** alanlar. Bu, çapraz kuralı
  (§5.2) tek istekte tutarlı göndermeyi garanti eder.
- Kaydet başarılıysa `onSaved(updated)` → `state.wedding = updated` ve geri
  dönülür (`onBack()`). Kullanıcı ayarı kaydettiğini görür.
- Kaydet başarısızsa sayfada **kalınır**, yerel değerler korunur,
  `InfoBanner` hatayı gösterir. Kullanıcı girdisini kaybetmez.
- **Kaydedilmemiş değişiklikle geri**: `AlertDialog` —
  "Kaydedilmemiş değişiklikler var" / **Vazgeç** · **Kaydet**.
  Vazgeç = değişiklikleri at ve çık. Kaydet = kaydet ve çık. Değişiklik yoksa
  dialog çıkmaz, doğrudan geri döner.
- Anahtar kapalıyken varsayılan/azami satırları **görünür ama devre dışı**
  (soluk, dokunulamaz). Gizlemek yerine devre dışı: Kaydet modelinde gizli
  ama "değişmiş" bir alan kafa karıştırır; ayrıca sayfa zıplamaz ve çift
  kapatınca neyi kaybettiğini görür. `check-dead-buttons.mjs` `enabled = false`
  desenini zaten kabul ediyor.
- Varsayılan `azamiyi` geçemez: `+` butonu `default < max` koşulunda etkin.
  Azami düşürülürken varsayılan da **aynı anda** aşağı çekilir (yerel), böylece
  gönderilen yama hiçbir zaman tutarsız olmaz.
- Azami `1`'e indirilebilir (özellik açık ama tek kişi) — stepper görünür,
  `+` hep devre dışı. Çift bunu bilinçli seçebilir; uyarı metni bunu söyler.

### 6.3 Davetli detayı

−/+ aralığı `1..wedding.maxPartySize` olur; başlangıç değeri
`wedding.defaultPartySize`. `createInvitation` çağrısı yine açık
`allowedPartySize` gönderir (varsayılana güvenmez — çift iki ekran arasında
ayarı değiştirmiş olabilir).

`partySizeEnabled = false` iken davetli detayındaki kişi sayısı bloğu
**gizlenir** ve `createInvitation` `allowedPartySize: 1` gönderir. Neden 1:
`rsvp.ts` ATTENDING için `partySize` zorunlu tutuyor ve `> allowedPartySize`
reddediyor. Özellik kapalıyken davetiye `partySize` göndermeyecek; 1, "tek
kişi" anlamına gelir ve hiçbir davetliyi engellemez.

### 6.4 Davetiye sayfası (`d/index.html`)

`render()` içinde:

```js
if (!data.partySizeEnabled) {
  $('sizeBox').hidden = true
} else {
  $('sizeBox').hidden = false
  ...
}
```

`sendRsvp` içinde:

```js
if (rsvp === 'ATTENDING' && state.data.partySizeEnabled) {
  payload.partySize = Math.min(state.size, max)
}
```

Ayrıca özellik kapalıyken `state.size = 1` tutulur ve onay pill'i
`Geliyorum` yazar (`· N kişi` eki çıkmaz) — `showConfirmed()` zaten
`n > 1` koşuluna bakıyor, `confirmedPartySize` 1 olacağı için doğru çalışır.

**Geriye dönük uyumluluk:** daha önce `confirmedPartySize = 4` bildirmiş bir
davetli, çift özelliği kapattığında "Geliyorum · 4 kişi" görmeye devam eder
(geçmiş veri silinmez). Yeni bildirimler tek kişi olur.

---

## 7. Etki alanı

### Backend

| Dosya | Değişiklik |
|---|---|
| `src/db/schema.ts` | 3 sütun |
| `src/db/migrations/0008_party_size_settings.sql` | yeni |
| `src/db/migrations/meta/_journal.json` | `idx: 8` kaydı |
| `src/weddings/service.ts` | şema alanları + çapraz doğrulama |
| `src/weddings/store.ts` | `select` listelerine 3 alan (`listByUser`, `findById`) |
| `src/guests/invitation.ts` | `InvitationRow.wedding`'a 3 alan; `effectiveMax` yardımcısı |
| `src/guests/store.ts` | `findByTokenHash` join'ine 3 alan |
| `src/guests/public-view.ts` | `PUBLIC_FIELDS` + 3 alan; `allowedPartySize` etkin değer |
| `src/guests/rsvp.ts` | `partySizeEnabled = false` → `partySize` yok sayılır |

### Mobil

| Dosya | Değişiklik |
|---|---|
| `ui/nav/Screen.kt` | `GUEST_SETTINGS` |
| `App.kt` | `Screen.GUEST_SETTINGS` dalı; `GuestListScreen`'e `onOpenSettings` |
| `ui/screens/GuestScreens.kt` | başlıkta ayarlar ikonu; görünüm kartı kaldırılır |
| `ui/screens/GuestSettingsScreen.kt` | yeni |
| `ui/screens/GuestDetailScreen.kt` | aralık düğünden; özellik kapalıysa blok gizli |
| `ui/components/Structure.kt` | `TopBar`'a `actionEnabled: Boolean = true` — Kaydet düğmesi pasifken |
| `data/Models.kt` | `WeddingDto` + `WeddingPatchRequest` 3 alan |
| `data/Repository.kt` | `updateWedding` zaten genel — ek iş yok |

`TopBar` değişikliği geriye uyumlu: varsayılan `true`, mevcut iki çağrı
(`GuestScreens.kt:534`, `:658`) etkilenmez.

### Frontend

| Dosya | Değişiklik |
|---|---|
| `public/d/index.html` | `sizeBox` koşullu; `sendRsvp` koşullu |

---

## 8. Testler

### Backend (önce kırmızı)

| Test | Doğrular |
|---|---|
| `tests/weddings/party-settings.test.ts` | `partySizeEnabled`/`defaultPartySize`/`maxPartySize` kaydedilir |
| | `default > max` → 400 `PARTY_SIZE_INCONSISTENT` |
| | `max` düşürülüp `default` gönderilmezse reddedilir |
| | `0` ve `11` → 400 |
| | `1..10` sınırları kabul edilir |
| `tests/guests/public-view.test.ts` (ek) | 3 alan döner; `allowedPartySize` = `min(davetli, düğün max)` |
| | `PUBLIC_FIELDS` tam listeyi eşler |
| `tests/guests/rsvp.test.ts` (ek) | özellik kapalı + `partySize: 4` → kabul, `confirmedPartySize = 1` |
| `tests/guests/rsvp.test.ts` (ek) | özellik kapalı + `partySize` yok → kabul (zorunluluk kalkar) |
| `tests/e2e/wedding-party-settings.test.ts` | gerçek HTTP `PATCH` → `GET` yuvarlak yol (PGlite) |

### Mobil

| Test | Doğrular |
|---|---|
| `data/PartySizeSettingsTest.kt` | `WeddingDto` yeni alanları JSON'dan okur (varsayılanlar dahil) |
| | `WeddingPatchRequest` yalnız değişen alanı serileştirir |
| | Kaydet yaması `default ≤ max` tutarlılığını korur |
| `data/DtoContractTest.kt` (ek) | eski JSON (alanlar yok) → varsayılanlar |

### Frontend

`scripts/check-frontend.mjs`'e bir kontrol: `d/index.html` içinde
`partySizeEnabled` hem `render()` hem `sendRsvp()` içinde geçmeli. (Statik
sayfa; birim testi altyapısı yok, regresyon kontrolü bu şekilde.)

---

## 9. Riskler

| Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|
| Migration deploy edilmez → 500 | Orta | Yüksek | Deploy **aynı** turda; `deploy-backend.yml` tetiklenir ve doğrulanır |
| Eski istemci (yeni alanları bilmeyen) `PATCH`te alanları `null` yollar | Düşük | Orta | `weddingPatchSchema` zaten `null`'ları atıyor (mevcut davranış) |
| Azami düşürülünce mevcut davetiyeler tutarsız | Orta | Orta | `min()` türetmesi — sunucu tarafında, istemciye bırakılmaz |
| Özellik kapatılınca RSVP reddedilir | Orta | Yüksek | `rsvp.ts` `partySize`'ı yok sayar; test bunu kilitler |
| Kaydedilmemiş değişiklik sessizce kaybolur | **Orta** | **Orta** | Geri tuşunda `AlertDialog`; değişiklik yoksa dialog yok |
| Kullanıcı "kaydettim" sanıp aslında kaydetmemiş olur | Düşük | Orta | Kaydet başarılıysa ekrandan çıkılır — görünür geri bildirim |
| Ayarlar sayfası çok kalabalık | Düşük | Düşük | Üç bölüm, her biri tek kavram; görsel hiyerarşi `SectionHeader` ile |

---

## 10. Kabul kriterleri

1. Davetli listesinde ayarlar ikonu var; basınca ayarlar sayfası açılıyor.
2. Ayar sayfasından davetiye görünümüne (şablon + font) ulaşılıyor ve seçim
   davetiyeye yansıyor.
3. Kişi sayısı özelliği kapatılıp **Kaydet**'e basıldığında **yeni** davetiye
   yalnız "Geliyorum"/"Gelemeyeceğim" gösteriyor; stepper görünmüyor.
4. Özellik kapalıyken "Geliyorum"a basmak **başarılı** (422 yok).
5. Varsayılan ve azami ayarlanabiliyor; varsayılan azamiyi geçemiyor.
6. Azami düşürüldüğünde daha geniş izinli davetiyelerin etkin azamisi de
   düşüyor.
7. Özellik açıkken davetli detayındaki −/+ düğünün azamisine kadar çıkıyor.
8. Değişiklik yapılmadan **Kaydet** etkin değil; değişiklik varken geri
   tuşu uyarı gösteriyor.
9. Backend testleri, mobil testleri ve üç CI işi yeşil.
10. Migration canlıya uygulanmış ve `GET /health` sağlıklı.
