# Deep Link Kurulumu

> Magic link e-postasındaki bağlantı, uygulama kuruluysa **doğrudan uygulamada** açılmalı. Kurulu değilse tarayıcıda açılıp 6 haneli kod gösterilmeli.

**Durum:** ⏳ Placeholder değerler — Aşama 7'de (mobil uygulama) doldurulacak.

---

## Nasıl çalışır

```
Kullanıcı e-postadaki linke tıklar
   ↓
https://dugunce.com.tr/auth#<token>
   ↓
┌──────────────────────┬──────────────────────┐
│ Uygulama KURULU      │ Uygulama YOK         │
│ → Universal/App Link │ → Tarayıcı açılır    │
│ → Uygulama açılır    │ → 6 haneli kod       │
│ → POST /auth/verify  │ → Kullanıcı kodu girer│
└──────────────────────┴──────────────────────┘
```

**Token `#fragment`'te** — sunucuya gitmez, erişim loglarına düşmez (SECURITY §3.5).

---

## iOS — Universal Links

### 1. Team ID'yi al

Apple Developer → **Membership** → **Team ID** (10 karakter, ör. `A1B2C3D4E5`)

### 2. `apple-app-site-association` dosyasını doldur

`frontend/public/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["A1B2C3D4E5.app.dugunce"],
        "components": [
          { "/": "/auth*", "comment": "Magic link" },
          { "/": "/invite*", "comment": "Davet kodu" }
        ]
      }
    ]
  }
}
```

**Değiştirilecek:** `TEAMID` → gerçek Team ID.

### 3. Xcode yapılandırması

`iosApp/iosApp/iosApp.entitlements`:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:dugunce.com.tr</string>
</array>
```

### 4. Doğrula

```bash
# Apple CDN üzerinden kontrol
curl -s "https://app-site-association.cdn-apple.com/a/v1/dugunce.com.tr" | head -20

# Doğrudan
curl -s "https://dugunce.com.tr/.well-known/apple-app-site-association" | jq .
```

**Kurallar:**
- Dosya **HTTPS** ile sunulmalı, **yönlendirme olmadan**
- `Content-Type: application/json`
- Dosya adı **uzantısız** (`apple-app-site-association`, `.json` değil)

---

## Android — App Links

### 1. SHA-256 parmak izini al

```bash
# Debug keystore
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android \
  | grep SHA256

# Release keystore
keytool -list -v -keystore <release.keystore> -alias <alias> \
  | grep SHA256
```

Çıktı: `SHA256: AA:BB:CC:...` → iki nokta üst üsteleri kaldır, küçük harfe çevir.

### 2. `assetlinks.json`'u doldur

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.dugunce",
      "sha256_cert_fingerprints": ["AA:BB:CC:..."]
    }
  }
]
```

**Değiştirilecek:** `PLACEHOLDER_SHA256_FINGERPRINT` → gerçek parmak izi.

**Not:** Debug ve release parmak izleri **farklıdır**. İkisini de ekle:

```json
"sha256_cert_fingerprints": [
  "AA:BB:...debug...",
  "CC:DD:...release..."
]
```

### 3. AndroidManifest.xml

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="dugunce.com.tr" android:pathPrefix="/auth" />
  <data android:scheme="https" android:host="dugunce.com.tr" android:pathPrefix="/invite" />
</intent-filter>
```

### 4. Doğrula

```bash
curl -s "https://dugunce.com.tr/.well-known/assetlinks.json" | jq .

# Android cihazda
adb shell pm get-app-links app.dugunce
```

---

## Yayınlama

Bu iki dosya **Cloudflare Pages** üzerinden sunulur:

```
https://dugunce.com.tr/.well-known/apple-app-site-association
https://dugunce.com.tr/.well-known/assetlinks.json
```

**Kurallar:**
- `.well-known` dizini **root'ta** olmalı (alt dizinde değil)
- Yönlendirme (redirect) olmamalı — Apple/Google takip etmez
- `robots.txt` bunları engellememeli

---

## Test

### iOS

```bash
# Simülatörde
xcrun simctl openurl booted "https://dugunce.com.tr/auth#test-token"
```

### Android

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "https://dugunce.com.tr/auth#test-token" app.dugunce
```

---

## Sorun giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| Link tarayıcıda açılıyor | AASA/assetlinks yanlış | `curl` ile kontrol et, Content-Type'a bak |
| Android "doğrulanmadı" | SHA-256 yanlış | Release keystore'un parmak izini ekle |
| iOS çalışmıyor | Entitlement eksik | `associated-domains` ekle, yeniden imzala |
| Sadece bir kez çalışıyor | Apple cache | `?mode=developer` ile test et |

---

## Şu anki durum

| Dosya | Durum |
|---|---|
| `apple-app-site-association` | ⏳ `TEAMID` placeholder |
| `assetlinks.json` | ⏳ `PLACEHOLDER_SHA256_FINGERPRINT` |

### Düzeltme (2026-11-02)

`assetlinks.json` içindeki `package_name` **`app.dugunce`** yazıyordu; gerçek
`applicationId` **`com.dugunce.app`** (`composeApp/build.gradle.kts`). Yanlış
paket adıyla Android hiçbir zaman uygulamayı açmaz — link sessizce tarayıcıda
kalırdı. Düzeltildi.

### Paket adı değişikliği (2026-11-05)

`applicationId` **`com.dugunce.app` → `com.lumibyte.dugunce`** olarak
değiştirildi (kullanıcı kararı; Play Store'da yayınlanmamış olduğu için
mümkündü — yayınlanmış bir paket adı DEĞİŞTİRİLEMEZ).

`assetlinks.json` `package_name`'i de güncellendi; ikisi eşleşmezse App Links
doğrulanmaz ve linkler tarayıcıda kalır. **Firebase konsolunda Android
uygulaması eklenirken de bu ad birebir yazılmalı.**

**Parmak izi neden hâlâ placeholder:** release keystore henüz yok. Debug
keystore her CI koşusunda yeniden üretildiği için parmak izi sabit değil;
onu yazmak işe yaramaz. Sıra:

1. Release keystore üret (`keytool -genkeypair ...`)
2. Parmak izini al: `keytool -list -v -keystore release.jks | grep SHA256`
3. `assetlinks.json`'a yaz, CI'a keystore'u secret olarak ekle
4. `https://dugunce.com.tr/.well-known/assetlinks.json` üzerinden doğrula

Aynı şey `apple-app-site-association` içindeki `TEAMID` için de geçerli —
Apple Developer hesabı açılmadan doldurulamaz.

Bu dosyalar Aşama 7'de (mobil uygulama) gerçek değerlerle doldurulacak. O zamana kadar magic link web üzerinden çalışır (6 haneli kod yolu) — **işlevsel engel yok.**
