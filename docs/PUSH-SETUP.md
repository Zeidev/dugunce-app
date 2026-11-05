# Firebase kurulumu — Android push bildirimleri

**Proje:** Düğünce · **Paket adı:** `com.lumibyte.dugunce`
**Hedef:** Android telefona bildirim gönderebilmek (FCM)
**Süre:** ~20 dakika

Bu rehberi baştan sona takip edin. Her adımda **ne yaptığınızı ve neden**
yazıyor; bir adımı atlarsanız belirtisi de yazıyor (çünkü FCM'in en kötü
özelliği sessizce çalışmaması).

---

## 0. Önce bilmeniz gereken iki şey

**a) Paket adı birebir aynı olmalı: `com.lumibyte.dugunce`**

Firebase konsolunda Android uygulaması eklerken bu adı **kopyala-yapıştır**
yapın. Tek harf farkı (ör. `com.lumibyte.dugunceapp`) şu sonucu verir:
uygulama derlenir, çalışır, hata vermez — ama **hiçbir bildirim gelmez**.
`google-services.json` içindeki `package_name` ile `applicationId`
eşleşmezse Firebase SDK token üretmez ve bunu kimseye söylemez.

**b) Bu dosyalar depoya GİRMEZ**

`google-services.json` proje kimliği taşır. `.gitignore`'a eklendi
(`mobile/.gitignore`). Yeni bir geliştirici depoyu klonladığında dosya
yoktur; uygulama yine derlenir ve çalışır, push sessizce kapalı kalır.
Bu bilinçli bir tasarım.

---

## 1. Firebase projesi oluşturun

1. https://console.firebase.google.com adresine Google hesabınızla girin.
2. **"Create a project"** (veya "Proje ekle").
3. Proje adı: **`dugunce`** (istediğiniz ad olabilir; kullanıcı görmez).
4. **Google Analytics**: bu iş için **gerekmiyor**. Kapatabilirsiniz —
   açmanız hâlinde ek onay/veri paylaşımı soruları gelir ve kurulum
   uzar. (Analytics sonradan da açılabilir.)
5. **Create project** → birkaç saniye bekleyin → **Continue**.

---

## 2. Android uygulamasını ekleyin

> **KONSOL ARAYÜZÜ (2025 sonu yeniden tasarım):** Sol menü artık
> `Build` / `Engage` gibi eski grupları kullanmıyor; ürünler
> **Databases & Storage / Security / AI services / Hosting & Serverless /
> DevOps & Engagement / Analytics** kategorilerine dağıtıldı. Menüde
> kaybolursanız **doğrudan URL** kullanın — arayüz değişse de çalışır.
> (`_` işareti aktif projeyi otomatik seçer.)

**Doğrudan URL:**
```
https://console.firebase.google.com/project/_/settings/general
```
Sayfanın altında **"Your apps"** → **Add app** → **Android**.

1. **Project Overview** ekranında da **"Add app"** (veya `+ Add app`)
   butonu var; **Android** simgesine tıklayın.
2. **Android package name** alanına **tam olarak** şunu yazın:

   ```
   com.lumibyte.dugunce
   ```

3. **App nickname** (isteğe bağlı): `Düğünce Android`. Kullanıcı görmez,
   yalnız konsolda size kolaylık olsun diye.
4. **Debug signing certificate SHA-1**: bu adımı **şimdilik atlayın**.
   Push için gerekmiyor. (App Links/Google Sign-In için gerekir; ayrı iş.)
5. **Register app**.

### 2b. `google-services.json` dosyasını indirin

Karşınıza "Download google-services.json" butonu çıkar.

**Dosyayı şuraya koyun:**

```
mobile/composeApp/google-services.json
```

Yani `mobile/composeApp/` dizininin **içine**, `build.gradle.kts` ile aynı
seviyeye. `src/` içine değil.

> **Doğrulama:** Dosyayı bir metin düzenleyiciyle açın, içinde
> `"package_name": "com.lumibyte.dugunce"` satırını görün. Görmüyorsanız
> 2. adımda yanlış paket adı yazmışsınız — konsolda uygulamayı silip
> yeniden ekleyin (paket adı sonradan **düzeltilemez**, yeni uygulama
> eklemek gerekir).

**Sonra "Next" → "Next" → "Continue to console".**

---

## 3. FCM API'sini etkinleştirin

Firebase Cloud Messaging çoğu projede otomatik açıktır; yine de doğrulayın:

1. Sol menü → **DevOps & Engagement** → **Cloud Messaging**
   (bazı sürümlerde **Engage** adıyla görünür — aynı sayfa).

   **Doğrudan URL** (önerilen, menü değişse de çalışır):
   ```
   https://console.firebase.google.com/project/_/notification
   ```

2. Sayfa açılıyorsa ve bir hata vermiyorsa API etkindir.
3. Etkin değilse: https://console.cloud.google.com/apis/library/fcm.googleapis.com
   → projenizi seçin → **Enable**.

---

## 4. Service account oluşturun (sunucu tarafı)

Sunucu, bildirimi FCM'e **sizin adınıza** gönderecek. Bunun için bir
"service account" (servis hesabı) ve JSON anahtarı gerekiyor.

1. Sol menüde en üstteki **Settings** (⚙️ dişli) → **Project settings**.
   Sekme: **Service accounts**.

   **Doğrudan URL:**
   ```
   https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk
   ```
3. **"Generate new private key"** → uyarıyı okuyup **Generate key**.
4. Bir `.json` dosyası iner. Adı benzer: `dugunce-firebase-adminsdk-xxxxx.json`.

> ⚠️ **Bu dosya bir paroladır.** İçinde özel anahtar var; eline geçen
> kişi projeniz adına bildirim gönderebilir. Depoya **asla** koymayın,
> sohbete yapıştırmayın, ekran görüntüsü almayın. `.gitignore`'da
> `service-account*.json` ve `*-firebase-adminsdk-*.json` zaten yasaklı.

### 4b. Anahtarı sunucuya tek satır olarak koyun

Sunucu, dosya sistemi yerine `.env` içinde **base64** bir satır okuyacak
(serv00'da dosya yolu yönetmek kırılgan).

Kendi makinenizde, indirdiğiniz dosyanın bulunduğu dizinde:

```bash
base64 -w0 dugunce-firebase-adminsdk-xxxxx.json
```

Çıktı çok uzun tek satır olur (`eyJ0eXAiOiJKV1Qi...` diye başlar).
Tamamını kopyalayın.

Sonra sunucudaki `~/.env` dosyasına (deploy betiğinin okuduğu yer:
`~/domains/api.dugunce.com.tr/public_nodejs/backend/.env`) şu satırı ekleyin:

```
FCM_SERVICE_ACCOUNT_BASE64=<kopyaladığınız uzun satır>
```

Ve push'u açın:

```
PUSH_ENABLED=true
```

> **Not:** Bu `.env` satırları, push kodu yazıldıktan sonra okunacak.
> Şimdi eklemeniz zararsız — kod gelene kadar yok sayılır.

---

## 5. Android tarafını bağlayın (kod tarafı — benim işim)

Sizin bir şey yapmanız gerekmiyor, ama ne olacağını bilmeniz için:

- `mobile/gradle/libs.versions.toml`'a `firebase-messaging` eklenecek.
- `mobile/composeApp/build.gradle.kts`'e `com.google.gms.google-services`
  eklentisi gelecek.
- `google-services.json` **yoksa** derleme **kırılmamalı** — bu yüzden
  eklenti koşullu uygulanacak:

  ```kotlin
  if (file("google-services.json").exists()) {
      apply(plugin = "com.google.gms.google-services")
  }
  ```

  Neden: dosya gizli. Depoyu klonlayan herkes ve CI'da dosya yok; koşulsuz
  eklenti uygulamak **her derlemeyi** kırar.

---

## 6. İzinler ve manifest

`AndroidManifest.xml`'e eklenecek (kod tarafında):

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**Neden:** Android 13 (API 33) ve üstünde bildirim göstermek için
**çalışma zamanı izni** şart. `minSdk` 26 olduğu için eski sürümlerde bu
izin yok; kodda sürüm kontrolü yapılacak.

Ayrıca bildirime dokunulduğunda doğru ekrana gitmesi için bir
`FirebaseMessagingService` alt sınıfı eklenecek.

---

## 7. Test etme — sırayla

### 7a. Token gerçekten alınıyor mu?

Uygulamayı telefona kurun, giriş yapın. Sunucu loglarında şunu arayın:

```
device token kaydedildi: platform=ANDROID
```

Görmüyorsanız olası nedenler (sırayla kontrol edin):

| Belirti | Neden |
|---|---|
| Uygulama açılıyor, hiçbir şey olmuyor | `google-services.json` yanlış yerde (`mobile/composeApp/` altında olmalı) |
| Aynı | Dosyadaki `package_name` ≠ `com.lumibyte.dugunce` |
| Aynı | Android 13+ cihazda bildirim izni verilmemiş |
| Derleme hatası | Eklenti koşullu değil (benim düzeltmem gerekiyor) |

### 7b. Firebase konsolundan elle bildirim

En hızlı "boru hattı çalışıyor mu" testi:

1. Firebase konsolu → **DevOps & Engagement** → **Cloud Messaging** →
   **Send your first message** (veya **New campaign** → **Notifications**).
   Doğrudan URL: `https://console.firebase.google.com/project/_/notification`
2. **Notification title**: `Test`
3. **Notification text**: `Boru hattı testi`
4. **Send test message** → **+ Add an FCM registration token** →
   uygulamadan aldığınız token'ı yapıştırın → **Test**.

Token'ı görmek için: uygulama loglarında (`adb logcat`) veya geçici bir
hata ayıklama ekranında. Bu adımı kod tarafı hazır olduğunda birlikte
yapacağız.

Bildirim telefona düşerse **Firebase tarafı tamam** demektir.

### 7c. Gerçek olay testi

Boru hattı çalıştıktan sonra: bir davetli linkini açıp RSVP verin →
çiftin telefonuna "Yeni RSVP yanıtı" düşmeli.

---

## 8. Maliyet

FCM **ücretsizdir** (sınırsız mesaj). Firebase'in ücretli kısımları
(Firestore, Storage, Analytics) bu işte kullanılmıyor. Kart bilgisi
istemez.

---

## 9. Sık yapılan hatalar

**"Paket adını sonradan düzeltirim"**
Yapılamaz. Firebase'de bir Android uygulamasının paket adı oluşturulduktan
sonra **değiştirilemez**; yanlışsa silip yenisini eklemek gerekir ve
`google-services.json` yeniden indirilmelidir.

**"`google-services.json`'ı `mobile/` altına koydum"**
Yanlış yer. `mobile/composeApp/` olmalı — Gradle oradan okuyor.

**"Service account JSON'ını depoya koydum, nasılsa private repo"**
Private repo olsa bile sızabilir (fork, yedek, CI logu). Anahtar depoya
girmez; `.env`'e base64 olarak girer.

**"Analytics'i de açtım"**
Zararsız, ama kurulumu uzatır ve veri toplama onayları gerektirir.
Bu iş için gerekmiyor.

---

## 10. Bana ne zaman haber vereceksiniz

Şu üçü hazır olduğunda söyleyin, push koduna geçeyim:

- [ ] Firebase projesi açıldı, Android uygulaması `com.lumibyte.dugunce` ile eklendi
- [ ] `google-services.json` → `mobile/composeApp/` altına kondu
- [ ] Service account JSON indirildi (bana **göndermeyin**; sadece "hazır" deyin)

Sunucu `.env`'ine `FCM_SERVICE_ACCOUNT_BASE64` ve `PUSH_ENABLED=true`
satırlarını da ekleyin (Adım 4b) — kod hazır olduğunda gerekecek.

---

## Ek — iOS notu

Bu rehber yalnız Android. iOS push **ayrı bir iş** (karar: 2026-11-05,
önce Android). iOS'a geçildiğinde Apple Developer hesabı, APNs `.p8`
anahtarı ve Xcode'da "Push Notifications" yeteneği gerekecek; ayrıca
sunucunun serv00'da HTTP/2 çıkışı yapabildiği **önce ölçülmeli**.
