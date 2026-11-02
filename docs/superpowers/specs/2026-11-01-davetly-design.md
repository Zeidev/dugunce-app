# Davetly — Tasarım Dokümanı (Taslak / Süreç İçi)

**Durum:** TASLAK — fikir geliştirme devam ediyor. Onaylanmadı.
**Tarih:** 2026-11-01
**Son güncelleme:** 2026-11-02 (builder check: 9 açık soru kapatıldı)

> Bu belge bir **çalışma notudur**. Fikir geliştikçe güncellenir.
> Onaylandığında `writing-plans` ile uygulama planına dönüşecek.
> Onay olmadan hiçbir kod yazılmaz.
>
> ⚠️ **Güvenlik kuralları için bağlayıcı belge: [`docs/SECURITY.md`](../SECURITY.md)**
> Belge hiyerarşisi: `SECURITY.md` > bu belge > `DAVETLY_CLAUDE_BRIEF-v2.md`

---

## 1. Fikir

Düğün/nişan hazırlığı yapan çiftler için, üç kritik işi tek yerde toplayan **Android + iOS** uygulaması:

1. **Harcama takibi** — gelin/damat tarafı ayrımıyla kim ne ödedi, hangi kart hangi ay ne kadar taksit
2. **Davetli yönetimi** — toplu ekleme, WhatsApp'tan davet, RSVP'nin kendiliğinden dolması
3. **Görev + görev içi sohbet** — damat/baldız gibi yardımcılara görev verilir, sohbet o görevin içinde kalır

**Farklılaştırıcı:** 3. özellik. WhatsApp'ta iki gün sonra unutulan mesaj yerine, görevin kendi bağlamında kalan konuşma.

**Kaynak fikir:** Instagram'da görülen bir tanıtım videosu.

---

## 2. Neden / Neden şimdi

- Türkiye'de 2024'te **568.395 çift** evlendi (TÜİK)
- Ortalama düğün maliyeti **500.000 TL'yi** aştı — harcama kaosu gerçek bir problem
- Düğün organizasyonu WhatsApp + Excel + defter arasında dağılmış durumda
- Ürün **tek seferlik** bir ihtiyaca cevap veriyor: düğün bitince ihtiyaç da bitiyor

---

## 3. Hedefler / Hedef olmayanlar

### Hedefler
- Üç özelliği de çalışan, stabil bir ilk sürüm
- Altyapı maliyeti sıfır (10.000 kullanıcıya kadar)
- RSVP sayfası her zaman ücretsiz — büyüme motoru
- **Server-first:** sunucu tek doğruluk kaynağı, istemci önbellek tutar

### Hedef olmayanlar (ilk sürüm)
- Genel sohbet / grup sohbeti
- Fotoğraf galerisi, anı defteri
- Web'den çift girişi
- Otomatik WhatsApp gönderimi (API ücretli)

### Anti-hedefler (başarısız sayılır)
- Kullanıcı verisi kaybı
- Misafirin "Geliyorum"a basıp kaydın kaybolması
- Taksit hesabının yanlış olması (para = güven)
- Reklamla dolu bir arayüz

---

## 4. Kısıtlar

### Sert kısıtlar
| Kısıt | Kaynak |
|---|---|
| **Altyapı maliyeti sıfır** (barındırma, veritabanı, CDN) | Kullanıcı kararı |
| 10.000 kullanıcıda da ücretsiz kalmalı | Kullanıcı kararı |
| **Android + iOS** (v1'den itibaren) | Kullanıcı kararı (2026-11-02) |
| Kotlin + Jetpack Compose + Material 3 | Kullanıcı kararı |
| WhatsApp gönderimi kullanıcının kendi WhatsApp'ından | Kullanıcı kararı |

> **Not (2026-11-02):** "Hiç para çıkmayacak" kısıtı **altyapı** için geçerlidir. Mağaza hesapları (Apple Developer $99/yıl, Play $25) bu kısıtın dışında tutuldu — kullanıcı kararı: *"iOS dağıtım ücretini düşünme, sadece projeye odaklan."*

### Altyapı kısıtları
| Kaynak | Limit |
|---|---|
| serv00 disk | 3 GB |
| serv00 RAM | 512 MB |
| serv00 işletim sistemi | **FreeBSD** |
| serv00 Node.js | **v16–v26** (varsayılan v22) |
| serv00 PostgreSQL | 3 veritabanı (doğrulandı) |
| serv00 yedek | 7 gün |
| Cloudflare Workers | 100.000 istek/gün |
| Cloudflare D1 (yedek plan) | 5 GB, 100.000 satır yazma/gün |
| Play hesabı | Mevcut (tek seferlik ücret ödenmiş) |

### serv00 çalışma ortamı — doğrulanmış gerçekler

| Konu | Gerçek | Kaynak |
|---|---|---|
| OS | **FreeBSD** | serv00 docs |
| Node | v16–v26, varsayılan v22 | [Node.js dokümanı](https://docs.serv00.com/Node.js/) |
| Uygulama dizini | `/usr/home/LOGIN/domains/DOMAIN/public_nodejs` | aynı |
| Restart | `devil www restart DOMAIN` | aynı |
| Statik dosyalar | `public/` altı nginx'ten sunulur (Node yorulmaz) | aynı |
| Uyku | 24 saat istek yoksa kapanır | aynı |
| PostgreSQL host | `pgsqlX.serv00.com` (sunucu numarasına bağlı) | [PostgreSQL dokümanı](https://docs.serv00.com/PostgreSQL/) |
| **PG uzak erişim** | **Sadece SSH tüneli ile** (`ssh -L 8543:pgsqlX.serv00.com:5432`) | aynı |
| PG kullanıcı | DB adıyla **otomatik oluşur**, ayrı rol açma yok | aynı |
| PG uzantılar | `uuid-ossp`, `pgcrypto`, `pg_trgm`, `postgis`… | aynı |

> ⚠️ **Kritik sonuç (builder check):** PostgreSQL'e **doğrudan dış erişim yok** — yalnızca SSH tüneli.
> Bu, şunları belirler:
> - **Migration'lar CI'dan doğrudan çalışamaz.** SSH tüneli üzerinden ya da deploy sonrası host üzerinde çalışır.
> - **CI'da entegrasyon testleri** serv00'ya bağlanamaz → GitHub Actions'ta **service container PostgreSQL** kullanılır, şema eşitliği migration'larla korunur.
> - **`pg_dump` yedeği** SSH üzerinden alınır ve dışarı taşınır.
> - **En az ayrıcalıklı DB hesabı** uygulama düzeyinde kurulamaz (rol açma yok) → ayrıcalık ayrımı **uygulama katmanında** yapılır.
> - **Immutable audit log** DB trigger'ı ile değil, **append-only tablo + yetki** ile sağlanır.

### serv00'da çalışmayan yaygın kütüphaneler

| Kütüphane | Sorun | Alternatif |
|---|---|---|
| **Prisma** | Native query engine, FreeBSD build yok | **Drizzle ORM** veya `pg` + `node-pg-migrate` |
| **sharp** | libvips native, FreeBSD'de güvenilmez | `@napi-rs/canvas`, `jimp` (saf JS) |
| **argon2 (native)** | node-gyp derlemesi gerekir | **`@node-rs/argon2`** (prebuilt) veya `argon2-browser` (WASM) |

> **Aşama 1'de doğrulanacak:** bu üç kütüphane gerçek serv00 hesabında kurulup çalıştırılacak. Çalışmazsa alternatife geçilir — **kod yazmadan önce**.

### serv00 ToS riskleri
- **Madde 5:** "aşırı kaynak kullanan" siteler bloke edilebilir ← asıl risk
- **Madde 13:** 90 gün giriş yapılmazsa hesap silinir
- **Madde 17:** gerekçesiz silme hakkı
- **Karar:** Varsayım = serv00 stabil kalır. Backend taşınabilir yazılır.

---

## 5. Yaklaşımlar (değerlendirildi)

| # | Yaklaşım | Karar |
|---|---|---|
| 1 | Tek kod tabanı, herkes web (PWA) | ✗ — native deneyim istenmedi |
| 2 | Android native + web RSVP | ✗ — iOS da istendi |
| 3 | Web-first + sonra sarmalayıcı | ✗ — native önce istendi |
| 4 | **KMP + Compose Multiplatform (Android + iOS)** | ✓ **SEÇİLDİ** (2026-11-02) |

**Neden 4:** İki platformu tek kod tabanıyla hedeflemek ancak KMP ile mümkün. Compose Multiplatform for iOS [1.8.0 ile Stable](https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/) oldu; Room da [2.7'den beri KMP destekli](https://developer.android.com/kotlin/multiplatform/room).

**Bedeli:**
- iOS derlemesi macOS + Xcode ister → GitHub Actions macOS runner (public repo'da ücretsiz, private'da $12/ay kota ÷ $0.062/dk ≈ 193 dk/ay)
- App Store yayını **$99/yıl** → kullanıcı kararı: bu maliyet kabul edildi
- KMP kurulum ve Gradle karmaşıklığı, tek geliştirici için artan bilişsel yük

### Altyapı yaklaşımları
| # | Yaklaşım | Karar |
|---|---|---|
| 1 | Tamamen Cloudflare | ✗ — 100k istek tavanı, Durable Objects karmaşıklığı |
| 2 | **serv00 (API+PostgreSQL) + Cloudflare (proxy+statik)** | ✓ **SEÇİLDİ** |
| 3 | Firebase Spark | ✗ — okuma başına ücret, chat kotayı yer |
| 4 | Sıfır sunucu (WhatsApp'a dönüş) | ✗ — ürünün özü ölür |

**Neden 2:** sınırsız istek, PostgreSQL (serv00'da doğrulandı), statik dosyalar nginx'ten gidiyor (Node yorulmuyor). Cloudflare statik katman olarak önde durunca serv00'nin yükü kullanıcı sayısıyla doğrusal büyümüyor.

**Düzeltme (2026-11-02):** Önceden "gerçek WebSocket" gerekçesiyle bu yaklaşımı önermiştim. Serv00 dokümanı okunduğunda görüldü ki WebSocket ancak `proxy` tipi sayfa + rezerve port + **sürekli çalışan daemon** ile mümkün — ve ücretsiz planda süreç ömrü garanti değil. **v1'de polling kullanılacak**, WebSocket v1.1'e ertelenecek.

---

## 6. Mimari

**Dört yüzey, iki barındırma katmanı.** Yardımcı ve misafir uygulama indirmez — ikisi de mobil tarayıcıda açılan web sayfasıdır. Admin ayrı bir SPA'dır. **Statik yüzeyler Cloudflare Pages'te, dinamik katman serv00'da.**

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ ÇİFT             │ │ YARDIMCI         │ │ MİSAFİR          │ │ ADMIN            │
│ KMP Mobil App    │ │ Web (PWA)        │ │ Web (statik)     │ │ React SPA        │
│ Android + iOS    │ │ Token'lı link    │ │ Token'lı link    │ │ 2FA zorunlu      │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │                    │
         │            ┌───────┴────────────────────┘                    │
         │            │  WhatsApp ile gönderilen link                   │
         │            │                                                 │
         ▼            ▼                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cloudflare (DNS + proxy + CDN + SSL)                                       │
│  ├─ Pages: admin.davetly.com  (React SPA, GitHub otomatik deploy)           │
│  ├─ Pages: davetly.com        (tanıtım + davetiye + yardımcı PWA)           │
│  ├─ /api/* → api.davetly.com → serv00                                       │
│  └─ R2 (özel bucket) ← görev fotoğrafları                                   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  serv00 (Node.js + Express + TS)   → api.davetly.com                        │
│  ├─ REST API (/api/v1)          ├─ /api/v1/admin/...                        │
│  ├─ GET /health                 ├─ Web push (VAPID)                         │
│  ├─ Presigned URL (R2)          ├─ Polling (sohbet)                         │
│  └─ PostgreSQL                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Barındırma kararı (kullanıcı onaylı, 2026-11-02)

| Bileşen | Nerede | Gerekçe |
|---|---|---|
| **Admin SPA** | **Cloudflare Pages** | CDN, otomatik GitHub deploy, uyku riski yok |
| **Tanıtım sitesi** | Cloudflare Pages | Statik, CDN, ücretsiz |
| **Davetiye + yardımcı PWA** | Cloudflare Pages | Statik, edge cache, Node yorulmaz |
| **Backend API** | serv00 (`api.davetly.com`) | Node.js + PostgreSQL gerekiyor |
| **Veritabanı** | serv00 PostgreSQL | Doğrulandı |
| **Fotoğraflar** | Cloudflare R2 | Özel bucket, presigned URL |

**Neden Pages (serv00 yerine):**

| | Cloudflare Pages | serv00 |
|---|---|---|
| Statik SPA | Çok uygun | Uygun |
| CDN | Cloudflare ağı | Ek yapılandırma |
| SSL | Otomatik | Yapılandırmaya bağlı |
| Otomatik dağıtım | GitHub entegrasyonu | CI/CD kurulumu gerekir |
| Uyku riski | **Yok** (statik) | 24 saat hareketsizlik |

**Pages ücretsiz plan sınırları** ([kaynak](https://developers.cloudflare.com/pages/platform/limits/)): 500 build/ay, 1 eşzamanlı build, 20.000 dosya, 25 MiB/dosya, 100 custom domain/proje. Statik istekler **sınırsız ve ücretsiz**.

**Güvenlik notu:** Admin paneli Cloudflare'de barındırılıyor diye güvenlik Cloudflare'e bırakılmaz. Giriş, 2FA, rol kontrolü ve audit **serv00 API'sinde** yapılır. Gizli anahtar React uygulamasına konmaz. İstenirse `admin.davetly.com` önüne Cloudflare Access eklenebilir — ama uygulama içi yetkilendirmenin yerine geçmez.

**Yüzey tablosu:**

| Yüzey | Teknoloji | Barındırma | Kullanıcı | Auth |
|---|---|---|---|---|
| Mobil app | KMP + Compose Multiplatform | Play / App Store | Çift | Magic link |
| Yardımcı sayfası | Web (PWA) | Cloudflare Pages | Yardımcı | Token'lı link |
| Davetiye sayfası | Statik web | Cloudflare Pages | Misafir | Token'lı link |
| Admin paneli | React + TypeScript SPA | Cloudflare Pages | Ürün sahibi | Parola + TOTP 2FA |
| Backend API | Node.js + Express + TS | serv00 | — | JWT / cookie |

**Kazanç:** KMP'de yardımcı ekranları yazılmıyor → ekran sayısı belirgin düşüyor, iOS yardımcı sorunu ortadan kalkıyor. Statik yük Cloudflare'de olduğu için serv00'nin kaynak kullanımı düşük kalıyor → ToS Madde 5 riski azalıyor.

### Yardımcı web sayfası

`https://davetly.com/gorev/<token>` — tahmin edilemez token, yalnızca o yardımcının görevlerine erişir.

İçerik:
- Görevlerim (yalnızca kendisine atanmış olanlar)
- Görev detayı: açıklama, son tarih, konum
- Durum güncelleme: bekliyor / devam ediyor / tamamlandı
- Görev sohbeti (yalnızca o görev)
- Fotoğraf / not ekleme
- Bildirim: web push (izin verilirse) + WhatsApp yedeği

**PWA + "Ana ekrana ekle"** — iOS'ta web push yalnızca ana ekrana eklenmiş web uygulamalarında çalışır ([WebKit duyurusu](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), iOS 16.4+). Android Chrome'da normal çalışır.

**Bildirim stratejisi (üç katman):**
1. Web push (VAPID, ücretsiz) — izin verilirse
2. PWA ana ekrana eklenmişse iOS'ta da push
3. Hiçbiri yoksa: çift "hatırlat" butonuyla aynı linki WhatsApp'tan tekrar gönderir

### Token güvenliği (yardımcı)

- Token **tahmin edilemez** (kriptografik rastgele, min 128 bit)
- Yalnızca ilgili yardımcının görevlerine erişir
- Diğer yardımcıların görevleri görünmez
- **Bütçe ve misafir listesine erişim kesinlikle yok**
- Çift linki **iptal edebilir**
- Link kaybolursa **yenisi üretilebilir**
- DB'de **hash** olarak saklanır, ham token tutulmaz
- Loglara yazılmaz

**Bilinçli risk:** Link erişim yetkisi taşıdığı için başkasına iletilebilir. v1'de kabul edildi (misafir davetiyesiyle aynı model). Hassas işlemler için ileride tek kullanımlık doğrulama eklenebilir.

### Görev fotoğrafları (R2)

Fotoğraflar **yalnızca görevlere** bağlıdır. Düğün albümü / genel galeri yoktur.

**Depolama: Cloudflare R2 (özel bucket).** Fotoğraf serv00'ya yüklenmez — tarayıcı doğrudan R2'ye PUT eder. **Ama doğrulama için serv00 R2'den okur.**

```
Yardımcı → (1) POST /photos/presign   → yetki + kota kontrolü → kısa ömürlü PUT URL
         → (2) PUT doğrudan R2'ye      → istemci sıkıştırır (1600px)
         → (3) POST /photos/confirm    → serv00 dosyayı R2'den ÇEKER,
                                          MIME + boyut + decode + EXIF strip yapar
         → (4) DB'ye task_photos kaydı → yalnızca burada "fotoğraf var" sayılır
```

> **Builder check düzeltmesi (2026-11-02):** "Fotoğraf serv00'ya hiç uğramaz" iddiası ile "sunucu decode + EXIF strip yapar" çelişiyordu. **Çözüm:** yükleme doğrudan R2'ye (bayt trafiği serv00'dan geçmez), ama **doğrulama sırasında serv00 nesneyi R2'den indirip işler.** Bu, serv00'ye ~1 MB'lık indirme + decode maliyeti getirir; kabul edildi.

**Görüntü işleme kütüphanesi — FreeBSD kısıtı:**
`sharp` (libvips native) FreeBSD'de güvenilir değil. **Seçim: `@napi-rs/canvas` veya saf JS `jimp`.**
→ Aşama 1'de serv00 üzerinde **gerçek test** yapılır. Çalışmazsa yedek plan: **istemci tarafı canvas re-encode + sunucuda yalnızca magic-byte ve boyut doğrulaması** (daha zayıf ama çalışır).

| | Ücretsiz | Premium |
|---|---|---|
| Düğün başına toplam | **50 MB** | **500 MB** |
| Tek fotoğraf | 3 MB | 5 MB |
| Görev başına | 3 | 10 |

**Yükleme kuralları:**
- Kabul: JPEG, PNG, WebP. **SVG ve çalıştırılabilir dosya reddedilir.**
- İstemcide sıkıştırma, uzun kenar **1600 px**
- Gerçek MIME + boyut **sunucuda** doğrulanır (istemciye güvenilmez)
- **EXIF/GPS metadata sunucuda temizlenir**
- Kota kontrolü hem yükleme öncesi hem sonrası
- Yarım kalan yükleme DB'de "tamamlanmış fotoğraf" olarak görünmez

**Güvenlik:**
- Bucket **özel**, public erişim kapalı
- Görüntüleme için **kısa süreli imzalı URL**
- Yardımcı yalnızca kendi görevlerinin fotoğraflarını görür
- Çift kendi düğününün tüm fotoğraflarını görür
- Dosya adları tahmin edilemez (`wedding_id/task_id/uuid`)
- Token iptal edilirse yardımcı yeni fotoğraf yükleyemez

**Kota düşüşü:** Aynı düğündeki tüm yardımcıların fotoğrafları **ortak kotadan** düşer. Premium biterse fotoğraflar silinmez, yeni yükleme kapanır.

**R2 ücretsiz katman (tüm Davetly hesabı için ortak):** 10 GB depolama, 1M Class A, 10M Class B, **egress ücretsiz** ([R2 fiyatlandırma](https://developers.cloudflare.com/r2/pricing/)).

**Kapasite hesabı (gerçekçi):** Sıkıştırılmış bir görev fotoğrafı ~400–800 KB. Düğün başına tipik tüketim 5 görev × 3 fotoğraf × 700 KB ≈ **10–12 MB**.
→ 10 GB ÷ 12 MB ≈ **~800 düğün** (gerçekçi)
→ Teorik tavan: 10 GB ÷ 50 MB = **200 ücretsiz düğün** · 10 GB ÷ 500 MB = **20 premium düğün**

**Aşılırsa:** $0.15/GB/ay. 20 GB'a çıkınca ~$1.5/ay. Bu noktada premium geliri vardır; kural bilinçli olarak gevşetildi.

**İzleme:** Aylık R2 kullanımı kontrol edilir. Limit yaklaşırsa (a) eski düğün fotoğrafları silinir, (b) R2 ücretli plana geçilir.

**Temizlik:** R2 lifecycle kuralları + periyodik cron ile DB-depolama tutarlılığı sağlanır (silinmiş kayıt ↔ yetim dosya).

### Davetiye sayfası — kritik tasarım

**Karar (builder check sonrası düzeltildi, 2026-11-02):** URL'de **opaque token**, gömülü payload **değil**.

```
https://davetly.com/d#<token>
```

| Konu | Karar | Gerekçe |
|---|---|---|
| Veri nerede | Sunucuda (DB) | Gömülü payload iptali/düzenlemeyi yansıtamaz |
| Token biçimi | **Opaque, ≥128 bit** | Tahmin edilemez |
| Token konumu | **`#fragment`** | Fragment sunucuya gitmez → erişim loglarına düşmez |
| Sayfa açılışı | Statik HTML (Pages) + `GET /invitations/:token` (1 istek) | Revoke anında etkili |
| "Geliyorum" | `POST /invitations/:token/rsvp` | GET yan etki yaratmaz (link preview güvenli) |

**Eski tasarım (iptal):** `davetly.com/d/<base64-veri>` — "0 uygulama isteği" vaadi iptal edildi. Sebebi: gömülü payload'da davetli adı değişse veya token iptal edilse bile eski link çalışmaya devam ederdi. Güvenlik > 1 istek tasarrufu.

**Yardımcı token'ı ayrı:** 7 karakterlik kod **yalnızca CO_OWNER (2. eş)** içindir. Yardımcı erişimi ≥128 bit hash'lenmiş token iledir (SECURITY §1.2).

**Davetiye sayfası içeriği (B · Bilgi Kartı düzeni, onaylı):**

| Alan | Kaynak | Zorunlu |
|---|---|---|
| Çift isimleri | `wedding.couple_names` | ✓ |
| Tarih + saat | `wedding.wedding_date` + `timezone` | ✓ |
| Mekân adı + adres | `venue_name`, `venue_address` | ✓ |
| Harita bağlantısı | `map_url` veya lat/lng'den üretilen Google Maps linki | ✓ |
| Program / akış | `wedding.program` (JSON: `[{time, title, note}]`) | — |
| Hediye notu | `gift_note` | — |
| **Geliyorum / Gelemeyeceğim** | RSVP butonları | ✓ |
| Kişi sayısı seçici | `allowed_party_size` kadar | ✓ |
| "Davetly ile düğününü planla" | Büyüme bağlantısı | ✓ |

**Teknik:**
- Türkçe tarih formatı (`Intl.DateTimeFormat('tr-TR')`)
- Harita: ücretli API yok — Google Maps/Apple Maps yönlendirme URL'i
- Program boşsa bölüm gösterilmez
- Sayfa < 100 KB, ilk boyama < 1 sn (3G)
- `noindex, nofollow` + `Referrer-Policy: no-referrer`
- Open Graph etiketi **yok** (WhatsApp önizlemesinde davetiye detayı sızmasın)

### Senkron modeli: **Server-first + offline-aware** (SEÇİLDİ 2026-11-02)

**Sunucu tek doğruluk kaynağı.** Yerel veritabanı **salt okunur önbellek** değil — *repository katmanı* olarak kurulur ki ileride offline yazma eklenebilsin. Ama v1'de karmaşık çift yönlü senkron yazılmaz.

| Veri | Okuma | Yazma |
|---|---|---|
| Harcamalar | API + yerel önbellek | API (v1) → kuyruk (v1.1) |
| Davetliler | API + yerel önbellek | API (v1) → kuyruk (v1.1) |
| Görevler | API + yerel önbellek | API |
| Sohbet mesajları | **Polling** (v1), WebSocket (v1.1) | API |
| RSVP sonuçları | Polling (sıklık açık) | Misafir → API |

#### v1'de offline'da ne olur
- ✅ Daha önce yüklenmiş bütçe/görev verisi **görüntülenir**
- ✅ Yeni harcama **taslağı** oluşturulabilir (henüz gönderilmez)
- ⚠️ Görev/mesaj değişikliği **kuyruğa alınır** — v1.1'de gönderilir
- ❌ İnternet yokken kesinleşmiş yazma yok

#### Değişmez kurallar
- **RSVP yanıtı sunucuya ulaşmadan kesinleşmiş sayılmaz.**
- **Taksit ve bütçe hesabının nihai sonucu sunucudan gelir.**
- **Yardımcı yetkileri yalnızca sunucu tarafından kontrol edilir.**
- **Çakışan değişiklikler sessizce birbirinin üzerine yazılmaz.**

#### Neden bu model
Server-first seçilmesinin sebebi çok kiracılı gerçek: aynı düğünde gelin + damat + yardımcı + misafir aynı veriye dokunuyor. Local-first burada senkron, çakışma çözümü ve veri birleştirme yükünü **çok erken** getirirdi. Buna karşılık yerel önbelleği baştan **repository katmanı** olarak kurmak, ileride offline yazmayı eklemeyi ucuzlatır — bugün ekstra maliyeti neredeyse sıfır.

#### v1.1'e ertelenen
- Offline yazma kuyruğu ve gönderim
- Çakışma tespiti (versiyon/ETag)
- Gerçek zamanlı sohbet (WebSocket)

### Uyku önleme (UptimeRobot + `/health`)

serv00, **24 saat istek gelmezse** Node uygulamasını kapatır ([resmî doküman](https://docs.serv00.com/Node.js/)):
> "If there are no requests to the site for 24 hours, the application is automatically shut down and started again automatically on the first next visit."

**Çözüm:**
1. `GET /health` endpoint'i — sadece `{"status":"ok","app":"davetly-api"}` döner, **DB'ye dokunmaz**
2. UptimeRobot HTTP monitor → `/health`, aralık **1 saat**
3. UptimeRobot ücretsiz plan: **50 monitor, 5 dk minimum aralık**, ticari kullanıma açık ([kaynak](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan))

**Aralık seçimi:** 1 saat. 24 saatlik sınıra karşı 24 kat tampon, sunucuya gereksiz yük yok.

**Çözmediği durumlar:** sunucu yeniden başlatması, uygulama çökmesi, kaynak limiti aşımı. Bunlar için ayrı izleme gerekir (v1.1).

**Alternatif (daha ucuz):** serv00'da `crontab` var ([doküman](https://docs.serv00.com/Cron/)). Saatte bir `fetch https://api.davetly.com/health` çalıştıran bir cron job, dış servise hiç gerek bırakmaz. UptimeRobot'un avantajı: uygulama düşerse **alarm** verir. İkisi birlikte kullanılabilir.

---

## 6b. Detaylandırılmamış özellikler (denetim #2 ile eklendi)

> Bu bölüm, üç temel özelliğin **belgede adı geçen ama tanımlanmamış** parçalarını kapatır.

### 6b.1 Toplu davetli ekleme

Ürün vaadinde "toplu ekleme" var. İki yol:

| Yol | Akış | v1 |
|---|---|---|
| **Manuel çoklu** | Formda "+" ile satır ekle, 10-20 kişiyi tek ekranda gir | ✓ |
| **Rehberden seç** | Android/iOS kişi seçici, seçilenler isim+telefon ile dolar | ✓ |
| CSV/Excel yükleme | Dosya seç → sütun eşle → önizle → içe aktar | v1.1 |

**Kurallar:**
- Toplu ekleme **transaction** içinde; biri hata verirse hiçbiri eklenmez
- Limit kontrolü **toplu ekleme öncesi** (10 kişi sınırı)
- Telefon numarası normalize edilir (E.164), tekrar eden atlanır
- Rehber erişimi **isteğe bağlı**, reddedilirse manuel yol çalışır

### 6b.2 WhatsApp mesaj şablonları

**Davetiye mesajı (misafire):**
```
Merhaba [Ad], düğünümüze seni de aramızda görmek isteriz. 🌸
Davetiyemiz ve katılım yanıtın için:
[link]
— [Gelin] & [Damat]
```

**Görev mesajı (yardımcıya):**
```
Merhaba [Ad], düğün hazırlıkları için sana bir görev verildi:
[Görev başlığı]
Detaylar ve durum güncellemesi için:
[link]
— [Gelin] & [Damat]
```

**Hatırlatma mesajı (aynı link, farklı metin):**
```
Merhaba [Ad], [görev/davetiye] hatırlatması:
[link]
```

**Kurallar:**
- Şablonlar Türkçe, karakter sınırı yok (WhatsApp kullanıcının kendi uygulaması)
- URL encode doğru yapılır
- Kullanıcı **göndermeden önce metni düzenleyebilir**
- "Gönderildi" işareti = kullanıcının "gönderdim" demesi, **teslim bilgisi değil**

### 6b.3 Bildirim olayları

Hangi olayda kime bildirim gider:

| Olay | Kime | Kanal |
|---|---|---|
| Yardımcıya görev atandı | Yardımcı | Web push + WhatsApp (manuel) |
| Göreve mesaj geldi | Karşı taraf | Web push |
| Görev durumu değişti | Çift | Push (FCM/APNs) |
| RSVP yanıtı geldi | Çift | Push (FCM/APNs) |
| Yardımcı erişimi iptal edildi | Yardımcı | — (sessiz) |
| Premium satın alındı | Çift | — (uygulama içi) |

**Kurallar:**
- Bildirim izni **istenmezse** uygulama çalışır (sadece polling)
- Push token'ı DB'de saklanır (`device_token`), çıkışta silinir
- Bildirim içeriğinde **hassas veri yok** (tutar, misafir adı yok) — "Yeni bir RSVP yanıtı var"
- Sessiz saat: 22:00–09:00 arası bildirim gönderilmez (düğün öncesi hafta hariç)

### 6b.4 Düğün sonu akışı

`wedding.status` üç değerli: `ACTIVE | ARCHIVED | DELETED`

| Durum | Ne olur |
|---|---|
| **ACTIVE** | Normal kullanım |
| **ARCHIVED** | Düğün tarihi + 30 gün sonra otomatik. Salt okunur. Yardımcı erişimi **kesilir**, davetiye linkleri **ölür**. Veri durur. |
| **DELETED** | Çift siler. 30 gün geri alma penceresi, sonra kalıcı silme (fotoğraflar R2'den dahil) |

**Kurallar:**
- Arşivleme otomatik (cron), kullanıcı müdahalesi gerekmez
- Arşivden geri alma: düğün tarihinden 90 gün içinde mümkün
- KVKK saklama süreleri `SECURITY.md` §6.3 ile uyumlu

### 6b.5 Kredi kartı modeli

`card` tablosu tanımlandı (§7). Kurallar:

- **Tam kart numarası ASLA saklanmaz** — sadece `last_four`
- CVV, son kullanma tarihi **saklanmaz**
- Kart silinirse harcamalar silinmez, `card_id` null olur
- "Bu ay hangi kartta ne kadar taksit var" → `installment.due_month` + `card_id` gruplaması
- Hesap kesim günü (`statement_day`) bilgi amaçlı — otomatik hesaplama v1'de yok

### 6b.6 Kota gösterimi

`wedding_quota` tablosu kullanılır:

- Düğün ayarlarında: **"12,4 MB / 50 MB kullanıldı"**
- %80'de uyarı: "Fotoğraf alanınız doluyor"
- %100'de: yükleme butonu kapanır, "Premium'a geç" bağlantısı
- Kota, silinen fotoğraflarda **anında düşer** (soft delete → kota azaltılır)

### 6b.7 Arama ve filtreleme

| Ekran | Filtreler |
|---|---|
| Davetliler | Ad arama · taraf (gelin/damat) · RSVP durumu |
| Harcamalar | Kategori · taraf · ay · kart |
| Görevler | Durum · sorumlu · son tarih |
| Fotoğraflar | Görev bazlı (galeri yok) |

**Kurallar:** server-side filtreleme + sayfalama (cursor). İstemcide tüm listeyi çekme yok.

### 6b.8 Onboarding akışı

Değer sırası (§9) onboarding'e yansır — **davetlilerle başlamaz.**

```
1. Karşılama            → 3 ekran: ne yapar, kime yarar, ücretsiz sınırlar
2. Magic link giriş     → e-posta → link → uygulama açılır
3. Düğün oluştur        → isimler, tarih, mekân (2 dk, atlanabilir alanlar)
4. İLK HARCAMA          → "Düğün için ilk harcamanı ekle"
                          ← değer burada kanıtlanır
5. Bütçe özeti          → taksit tablosu gösterilir, "işte bu"
6. Davetli ekleme       → 10 kişi limiti BURADA açıkça söylenir
7. Bitir                → ana panel
```

**Kurallar:**
- Adım 4 atlanamaz (değer kanıtı), adım 6 atlanabilir
- Limitler onboarding'de **açıkça** yazılır (gizlenmez)
- Onboarding 4 dakikadan kısa
- Boş durum ekranları: açıklayıcı metin + ilk eylem butonu

### 6b.9 Minimum sürüm ve zorunlu güncelleme

- API, `X-App-Version` başlığını okur
- Minimum sürümün altındaysa `426 Upgrade Required` + mağaza linki
- Zorunlu güncelleme yalnızca **güvenlik açığı veya kırıcı API değişikliğinde**
- Yumuşak uyarı: yeni sürüm varsa uygulama içi banner (zorunlu değil)

### 6b.10 İzleme ve alarm

| Ne izlenir | Nasıl | Alarm |
|---|---|---|
| API ayakta mı | UptimeRobot `/health` (1 saat) | E-posta |
| DB erişilebilir mi | `/health/deep` (günde 1, cron) | E-posta |
| 5xx oranı | Uygulama logu + günlük özet | Eşik %2 |
| Disk kullanımı | serv00 `df` (cron, günlük) | %80 |
| R2 kotası | Cloudflare dashboard (haftalık manuel) | %80 |
| Yedek başarılı mı | Cron çıktısı kontrolü | Eksikse alarm |

**Log kuralları:** yapılandırılmış JSON, seviye (error/warn/info), **maskeleme** (token/telefon/e-posta). `console.log` üretimde yasak.

---

## 7. Veri modeli (taslak)

> **Denetim #2 (2026-11-02):** Aşağıdaki tablolar daha önce **referans veriliyor ama tanımlı değildi** — `users`, `refresh_token`, `wedding_members`, `person`, `expense_category`, `card`. Şimdi eklendi.

```
users (çift üyeleri — sadece hesabı olanlar)
  ├─ id (UUID)
  ├─ email (unique — magic link için)
  ├─ display_name
  ├─ email_verified_at (nullable)
  ├─ status: ACTIVE | SUSPENDED | DELETED
  ├─ last_login_at
  └─ created_at, updated_at

refresh_token (oturum yenileme — mobil bearer + web cookie)
  ├─ id, user_id
  ├─ token_hash                    ← ham token saklanmaz
  ├─ device_label (nullable)       ← "Pixel 8", "Chrome/macOS"
  ├─ expires_at, revoked_at (nullable)
  ├─ last_used_at
  └─ created_at

magic_link_token (tek kullanımlık giriş token'ı)
  ├─ id, user_id
  ├─ token_hash                    ← ham token saklanmaz
  ├─ short_code_hash (nullable)    ← 6 haneli yedek kod (deep link çalışmazsa)
  ├─ attempts (varsayılan 0, max 3)
  ├─ expires_at (5 dk), used_at (nullable)
  └─ created_at

NOT: GET isteği token'ı TÜKETMEZ (e-posta tarayıcıları linki yakmasın).
     Tüketim yalnızca POST /auth/verify ile olur.

wedding
  ├─ id (UUID), couple_names
  ├─ wedding_date, timezone (IANA, ör. Europe/Istanbul)
  ├─ venue_name, venue_address, venue_lat/lng, map_url
  ├─ gift_note, rsvp_deadline (nullable)
  ├─ program JSONB (nullable)      ← [{time, title, note}] — davetiye sayfasında gösterilir
  ├─ plan: FREE | PREMIUM          ← satın alma buraya bağlı
  ├─ purchased_at, purchase_token  ← mağaza makbuzu
  ├─ purchase_platform: PLAY | APPSTORE | MANUAL
  ├─ status: ACTIVE | ARCHIVED | DELETED
  ├─ created_at, updated_at
  └─ UNIQUE (id)                   ← composite FK hedefi

wedding_members (kim hangi düğünde)
  ├─ id, wedding_id, user_id
  ├─ role: OWNER | CO_OWNER        ← ikisi de tam yetkili
  ├─ joined_at
  ├─ UNIQUE (wedding_id, user_id)  ← tekrar üyelik engellenir
  └─ UNIQUE (id, wedding_id)

person (harcamayı yapan gerçek kişi — opsiyonel detay)
  ├─ id, wedding_id
  ├─ name                          ← "Elif'in annesi", "Mert"
  ├─ side: BRIDE | GROOM | SHARED
  └─ created_at

expense_category (kategori — sistem + kullanıcı)
  ├─ id, wedding_id (nullable — null ise sistem kategorisi)
  ├─ name, icon, sort_order
  ├─ is_system (bool)
  └─ created_at

card (kredi/banka kartı)
  ├─ id, wedding_id
  ├─ label                         ← "Ziraat ****1234"
  ├─ bank_name (nullable)
  ├─ last_four (nullable)          ← ASLA tam kart numarası
  ├─ statement_day (nullable)      ← hesap kesim günü
  ├─ is_active
  └─ created_at

invite (davet kodu — hem 2. eş hem yardımcı için aynı tablo)
  ├─ id, wedding_id
  ├─ code (7 karakter, tahmin edilemez)
  ├─ role: CO_OWNER | HELPER        ← aynı mekanizma, farklı rol
  ├─ display_name (nullable)        ← çift önceden isim girer
  ├─ expires_at, used_at (nullable)
  └─ created_by, created_at

NOT: 2. eş (CO_OWNER) davet edildiğinde magic link ile hesap açar,
     sonra bu kodu girer → aynı düğünün ikinci sahibi olur.
     Yardımcı (HELPER) hesap açmaz, kodu/linki doğrudan kullanır.

expense
  ├─ id, wedding_id, title, description
  ├─ amount NUMERIC(12,2)          ← asla float
  ├─ currency (varsayılan TRY)
  ├─ category_id → expense_category
  ├─ paid_by_side: BRIDE | GROOM | SHARED
  ├─ paid_by_person_id → person (nullable)
  ├─ payment_method: CASH | CARD | TRANSFER | OTHER
  ├─ payment_status: PAID | PENDING | PARTIAL
  ├─ card_id (nullable) → card
  ├─ installment_count (nullable)
  ├─ first_installment_month (nullable)
  ├─ purchase_date
  ├─ created_by, created_at, updated_at
  ├─ deleted_at (nullable)         ← soft delete
  └─ UNIQUE (id, wedding_id)

installment  (taksit dağılımı — otomatik üretilir)
  ├─ id, wedding_id, expense_id
  ├─ installment_number
  ├─ amount NUMERIC(12,2)
  ├─ due_month (YYYY-MM)
  ├─ status: PENDING | PAID
  ├─ paid_at (nullable)
  ├─ UNIQUE (expense_id, installment_number)
  └─ UNIQUE (id, wedding_id)

guest (davetli — kişi başı kayıt, 1 kayıt = 1 limit slotu)
  ├─ id, wedding_id, name
  ├─ phone (nullable)              ← WhatsApp mesajı buraya gider
  ├─ side: BRIDE | GROOM
  ├─ invite_status: NOT_SENT | SENT
  └─ rsvp: PENDING | ATTENDING | DECLINED

guest_invitation (davetiye — token'lı link)
  ├─ id, wedding_id, guest_id
  ├─ token_hash                    ← ham token DB'de tutulmaz
  ├─ allowed_party_size            ← davetlinin getirebileceği azami kişi
  ├─ confirmed_party_size          ← RSVP'de bildirilen gerçek kişi sayısı
  ├─ rsvp_at (nullable)
  ├─ expires_at, revoked_at (nullable)
  └─ created_at

NOT: Limit KAYIT (guest) sayısına uygulanır, kişi sayısına değil.
     allowed_party_size ≠ confirmed_party_size — ikisi AYRI alan (SECURITY §10.2).
     RSVP yalnızca POST ile değişir; GET/link-preview yan etki yaratmaz.

task
  ├─ id, wedding_id, title, description
  ├─ assignee_helper_id (nullable) → helper
  │    ⚠️ v1: TEK sorumlu. `UNIQUE` kısıt tek atamayı garanti eder.
  │       Çoklu atama v1.1 (join table). Şema buna hazır tutulur.
  ├─ status: TODO | DOING | DONE
  ├─ due_date, priority
  ├─ assigned_at (nullable)        ← yeniden atamada mesaj erişim sınırı
  ├─ created_by, created_at, updated_at
  └─ UNIQUE (id, wedding_id)       ← composite FK için gerekli

helper (yardımcı — HESAP YOK, sadece token)
  ├─ id, wedding_id, display_name
  ├─ access_token_hash             ← ham token DB'de tutulmaz
  ├─ token_revoked_at (nullable)
  ├─ created_by, created_at
  └─ last_seen_at

NOT: Yardımcı users tablosuna GİRMEZ. Hesabı yoktur, girişi yoktur.
     Erişimi yalnızca token'lı link iledir. Bu, auth karmaşıklığını
     ciddi ölçüde azaltır.

message
  ├─ id, wedding_id, task_id       ← wedding_id ZORUNLU (composite FK)
  ├─ created_at
  ├─ sender_kind: COUPLE | HELPER
  ├─ sender_user_id (nullable)     ← çift üyesiyse
  ├─ sender_helper_id (nullable)   ← yardımcıysa
  ├─ body (max 4000 karakter, HTML yok)
  ├─ idempotency_key (nullable)    ← tekrar gönderim kopya oluşturmaz
  └─ read_at

task_photo (görev fotoğrafı — dosya R2'de, kayıt burada)
  ├─ id, wedding_id, task_id       ← composite FK
  ├─ uploaded_by_helper_id (nullable)
  ├─ uploaded_by_user_id (nullable)
  ├─ storage_key                   ← R2 yolu (wedding_id/task_id/uuid)
  ├─ file_size, mime_type
  ├─ created_at
  └─ deleted_at (nullable)         ← soft delete, kota düşer

NOT: task_messages ve task_photos, (task_id, wedding_id) composite FK ile
     tasks tablosuna bağlanır. Yanlış wedding_id ile yazma DB'de reddedilir.

wedding_quota (kota takibi — düğün başına tek satır)
  ├─ wedding_id
  ├─ used_bytes
  └─ updated_at

NOT: Fotoğraf binary'si PostgreSQL'e KONMAZ. Sadece metadata.
```

### Yardımcı görünürlüğü

**v1: yalnızca kendi görevleri.** Diğer yardımcıların görevlerini görmez, birbirinden haberdar olmaz.

Gerekçe: basitlik + gizlilik. Çift iki yardımcıya farklı işler verirse, birbirlerinin işini görmeleri gereksiz karmaşa ve mahremiyet sorunu yaratır.

---

## 8. Kararlar (kullanıcı onaylı)

| Karar | Seçim |
|---|---|
| Platform | **Android + iOS — KMP + Compose Multiplatform** (2026-11-02) |
| Davetiye sayfası | B · Bilgi Kartı düzeni |
| Altyapı | serv00 (Node+Express+TS, PostgreSQL) + Cloudflare proxy |
| Senkron | **Server-first + offline-aware** (yerel DB repository katmanı; offline yazma v1.1) |
| Hesap modeli | **Ayrı hesaplar** (gelin + damat ayrı, ikisi de OWNER) |
| Satın alma | **Düğün bazlı** — biri öder, ikisi de premium görür |
| Yardımcı erişimi | **Token'lı web link (PWA), uygulama yok, hesap yok** |
| Yardımcı yetkisi | Sadece kendi görevi + o görevin sohbeti |
| Yardımcı görünürlüğü | **Yalnızca kendi görevleri** — diğer yardımcıları görmez |
| Çift auth | **Magic link (Brevo)** |
| **Fotoğraf depolama** | **Cloudflare R2, özel bucket, presigned URL** |
| **Fotoğraf kapsamı** | **Yalnızca görev fotoğrafı** — albüm/galeri yok |
| Premium kapısı | Davetli (10 kişi) + yardımcı (1) + görev (1) + fotoğraf (50 MB) |
| Veritabanı | PostgreSQL (serv00'da doğrulandı) |
| Backend dili | Node.js + Express + TypeScript |

### Benim önerdiğim çağrılar (onay bekliyor)
| Konu | Önerim |
|---|---|
| Premium fiyat | 149 TL tek seferlik |
| RSVP sayfası | Her zaman ücretsiz |
| Push bildirim | Çift: FCM (Android) + APNs (iOS) · Yardımcı: Web Push (VAPID) |
| Taksit | Otomatik aylara dağıtılır |
| Onboarding sırası | Harcamalar → görevler → davetliler |
| E-posta sağlayıcı | Brevo (300/gün ücretsiz) |

### Kullanıcı onaylı son kararlar (2026-11-01, geç oturum)
| Konu | Karar |
|---|---|
| Ücretsiz davetli limiti | **10 kişi** |
| Yardımcı ekleme | **1 ücretsiz (tadımlık), 5 premium** |
| Görev | **1 ücretsiz, sınırsız premium** |

### Kullanıcı onaylı son kararlar (2026-11-02)
| Konu | Karar |
|---|---|
| Platform kapsamı | **Android + iOS** (brief ile uyumlu) |
| Senkron modeli | **Server-first + offline-aware** |
| **Yardımcı erişimi** | **Uygulama YOK, hesap YOK — sadece WhatsApp'tan gelen token'lı web link** |
| Yardımcı görünürlüğü | Yalnızca kendi görevleri (v1) |
| **2. eş daveti** | **Davet kodu** (yardımcıyla aynı mekanizma, CO_OWNER rolü) |
| **v1 kapsamı** | **Üç özellik birden** (harcama + davetli + görev/fotoğraf) **+ admin paneli** |
| **Admin paneli** | **v1'de KESİN** — ayrı React + TS web app, `admin.davetly.com`, e-posta+parola+TOTP 2FA |
| **Admin yetki** | Tek `SUPER_ADMIN` (v1), genişletilebilir RBAC altyapısı |
| **Parola hash** | Argon2id |
| **Audit log** | Zorunlu — kritik işlemler kayda girer |
| Çift auth | **Magic link + Brevo** |
| E-posta | Brevo (300/gün ücretsiz) |
| **Fotoğraf** | **Yalnızca görev fotoğrafı, R2'de özel bucket** |
| **Fotoğraf kotası** | **Ücretsiz 50 MB / Premium 500 MB (düğün başına)** |
| **Admin barındırma** | **Cloudflare Pages** (`admin.davetly.com`) |
| **Statik yüzeyler** | **Cloudflare Pages** (tanıtım + davetiye + yardımcı PWA) |
| **Backend barındırma** | **serv00** (`api.davetly.com`) |
| **Subdomain planı** | `davetly.com` (tanıtım) · `admin.davetly.com` · `api.davetly.com` |

---

## 9. Gelir modeli

**Tek seferlik "Düğün Paketi" — 149 TL**

| | Ücretsiz | Premium |
|---|---|---|
| Davetli | **10 kişi** | Sınırsız |
| **Yardımcı (işbirlikçi)** | **1 (tadımlık)** | 5 |
| **Görev** | **1 görev** (o yardımcıya) | Sınırsız |
| Görev sohbeti | ✓ (1 görevde) | ✓ (tüm görevlerde) |
| **Görev fotoğrafı** | **50 MB / düğün** | **500 MB / düğün** |
| Harcama takibi | Sınırsız | Sınırsız |
| RSVP sayfası | Sınırsız | Sınırsız |
| CSV dışa aktarma | — | ✓ |

- Play komisyonu ~%15, App Store komisyonu ~%15–30 (mağaza keser)
- Abonelik yok — ürün tek seferlik
- **iOS satın alma:** StoreKit 2. Android ile aynı ürün mantığı, ayrı mağaza kaydı.
- **Vergi durumu doğrulanmalı** (açık konu)

### Satın alma akışı (builder check sonrası eklendi, 2026-11-02)

`wedding.plan` alanı ve tüm kapılar (10 davetli / 1 yardımcı / 1 görev / 50 MB) satın almaya bağlı — ama akış tanımsızdı. **Karar: v1'de var.**

```
1. Çift "Premium'a geç" → mağaza satın alma akışı (Play Billing / StoreKit 2)
2. Makbuz backend'e gönderilir
3. Backend mağaza API'siyle doğrular
4. Doğrulanırsa wedding.plan = PREMIUM (idempotent)
5. Aynı makbuz ikinci kez kullanılamaz
```

| Konu | Karar |
|---|---|
| Doğrulama | **Google Play Developer API** (servis hesabı) + **App Store Server API** (JWS) |
| Yetkilendirme birimi | **Düğün** (kullanıcı değil) — 2. eş ödeme yapmaz |
| Ürün tipi | Non-consumable (tek seferlik) |
| Restore | Aynı mağaza hesabıyla geri yükleme desteklenir |
| Idempotency | `purchase_token` global olarak tek kullanım |
| Makbuz doğrulanamazsa | Premium açılmaz, kullanıcıya net hata |

**Apple non-consumable sınırı:** Aynı Apple ID bir ürünü bir kez satın alır. İkinci düğün için aynı hesap yeniden ödeyemez → **restore ile açılır**, ama aynı kullanıcı ikinci düğün açarsa mağaza izin vermez. Bu bilinçli kabul (düğün tek seferlik ürün).

**Mağaza kimlik bilgileri:** GitHub Secrets (`PLAY_SERVICE_ACCOUNT_JSON`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY`).

**Test:** Play/App Store **sandbox** hesaplarıyla CI dışında manuel doğrulama. Sandbox makbuzları üretimde reddedilir.

### Ücretsiz sürümün değer sırası (kritik)

Duvarın **yeri** değil, **zamanı** önemli. Değer duvardan önce gelmeli:

| Sıra | Özellik | Ücretsiz |
|---|---|---|
| 1 | Harcamalar | Sınırsız ← değer burada kanıtlanır |
| 2 | Görevler | 1 görev + 1 yardımcı ← tadımlık |
| 3 | Davetliler | 10 kişi ← duvar burada |
| 4 | Yardımcı ekleme | 2. yardımcı ve 2. görev premium ← duvar burada |

Çift önce harcamalarını girer, taksit tablosunu görür, "bu işimi görüyor" der. Sonra davetli eklemeye geçer, duvara çarpar. O anda **zaten ikna olmuş** durumda.

**Tadımlık mantığı:** 1 yardımcı + 1 görev, özelliğin çalıştığını gösterir. Bir kez baldızına görev verip "aa bu ne güzel" diyen kişi, ikinci görev için ödeme yapar. Hiç görmeyen kişi neden ödesin bilmez.

**Onboarding bu sırayı takip eder** — davetlilerle değil, harcamalarla başlar.

### Şeffaflık şartı
10 kişi limiti ve yardımcının premium olduğu **mağaza sayfasında ve onboarding'de açıkça** yazılır. Gizlenirse tuzak hissi olur; açık yazılırsa normal iş modeli olur.

### Büyüme telafisi
10 davetli = 10 reklam (100 olsaydı 100 reklam). Telafi: davetiye sayfasının altına "Davetly ile düğününü planla" bağlantısı. Asıl büyüme oradan gelir, davetli sayısından değil.

---

## 10. Yetki matrisi

| | Çift (OWNER) | Yardımcı (token'lı link) | Misafir (token'lı link) |
|---|---|---|---|
| Harcamalar | ✓ | — | — |
| Davetliler / RSVP | ✓ | — | — |
| Tüm görevler | ✓ | — | — |
| Kendi görevi | ✓ | ✓ | — |
| Görev sohbeti | ✓ | ✓ (kendi görevi) | — |
| Diğer yardımcıların görevleri | ✓ | — | — |
| Kişi ekleme | ✓ | — | — |
| Satın alma | ✓ | — | — |
| Kendi davetiyesi + RSVP | ✓ (yönetir) | — | ✓ |

**Not:** Yardımcı ve misafir aynı erişim modelini kullanır — tahmin edilemez token'lı link, hesap yok. Fark: token'ın kapsamı (yardımcı → görevler, misafir → davetiye + RSVP).

---

## 11. Ölçülebilir kalite hedefleri

| Hedef | Ölçüt |
|---|---|
| Çökme yok | Kritik akışlarda crash-free (her iki platform) |
| Çevrimdışı görüntüleme | İnternet yokken son veri görünür, yazma engellenir |
| Hızlı açılış | Soğuk açılış < 1 sn |
| Veri kaybı yok | PostgreSQL + sunucu yedeği |
| Test kapsamı | Para ve taksit hesabı için birim testleri (commonTest) |
| Material 3 | Adaptif, açık/koyu tema, erişilebilirlik |
| Platform eşliği | iOS'ta Android'de olan her şey çalışır |
| Uptime | `/health` 7/24 yanıt verir |
| Yardımcı sayfası | Mobil tarayıcıda 2 sn altında açılır, kurulum gerektirmez |
| Token güvenliği | Tahmin edilemez, iptal edilebilir, hash'lenmiş |
| Fotoğraf güvenliği | Özel bucket, imzalı URL, düğün izolasyonu |
| Fotoğraf yükleme | 1600 px sıkıştırma, sunucu tarafı MIME doğrulama |

---

## 12. Açık konular

| # | Konu | Durum |
|---|---|---|
| 1 | ~~50 hane limiti~~ | ✅ **KAPANDI** — 10 kişi (kayıt başına) |
| 2 | Premium fiyat 149 TL doğru mu? | Öneri |
| 3 | RSVP senkron sıklığı | Öneri: 5 dk |
| 4 | Vergi mükellefiyeti (TR) | Doğrulanmalı |
| 5 | Düğün sonrası veri silme süresi | Öneri: 90 gün |
| 6 | ~~İlk sürüm kapsamı~~ | ✅ **KAPANDI** — v1'de **üç özellik birden** |
| 7 | ~~Headcount limiti nasıl sayılır?~~ | ✅ **KAPANDI** — 1 kayıt = 1 slot |
| 8 | ~~iOS $99/yıl — "hiç para çıkmayacak" kısıtıyla çelişki~~ | ✅ **KAPANDI** — kullanıcı: "iOS ücretini düşünme" |
| 9 | iOS derlemesi için macOS erişimi (GitHub Actions yeterli mi?) | Doğrulanmalı |
| 10 | ~~Auth yöntemi~~ | ✅ **KAPANDI** — Çift: magic link (Brevo). Yardımcı/misafir: token'lı link, hesap yok |
| 11 | ~~Çiftin ikinci üyesini davet akışı~~ | ✅ **KAPANDI** — **davet kodu** (yardımcıyla aynı mekanizma, farklı rol) |
| 12 | ~~Local-first ↔ server-first uzlaşması~~ | ✅ **KAPANDI** — **Server-first + offline-aware** (2026-11-02) |
| 13 | UptimeRobot + `/health` kurulumu | ✅ Karar verildi — 1 saat aralık |
| 14 | `crontab` alternatifi değerlendirilsin mi? | Öneri: UptimeRobot + cron birlikte |
| 15 | `/health` DB'ye dokunmalı mı? | Öneri: hayır (v1), v1.1'de `/health/deep` |
| 16 | Yerel DB: Room mu SQLDelight mı? | ✅ **Room** (KMP desteği resmî, Android tarafında bilinen teknoloji) — *benim çağrım* |
| 17 | Offline taslak nereye yazılır? | ✅ **Room'da `pending_` önekli tablo** — ayrı kuyruk sistemi kurulmaz — *benim çağrım* |
| 18 | Geliştirme sıralaması | ✅ **Aşama 1–8 güvenlik öncelikli sıralama** (`SECURITY.md` §7) |
| 19 | ~~Yardımcı uygulama indirecek mi?~~ | ✅ **KAPANDI** — Hayır, sadece web link (PWA) |
| 20 | Alan adı | ⚠️ **HENÜZ ALINMADI** — Brevo hesabı açıldı ama alan adı yok. Magic link gönderimi için gerekli |
| 21 | ~~Yardımcı fotoğraf ekleme v1'de mi v1.1'de mi?~~ | ✅ **KAPANDI** — v1'de, R2 ile |
| 22 | Web push (VAPID) anahtarları nerede saklanacak? | Karar bekliyor (GitHub Secrets) |
| 23 | **R2 ücretsiz 10 GB — kaç düğün kaldırır?** | ⚠️ Gerçekçi ~800 düğün / teorik 200 ücretsiz · 20 premium → izlenmeli |
| 24 | Fotoğraf kotası kullanıcıya nasıl gösterilecek? | Öneri: düğün ayarlarında "X MB / 50 MB" |
| 25 | R2 lifecycle + cron temizliği v1'de mi? | Öneri: v1'de basit cron |
| 26 | ~~Admin frontend hosting~~ | ✅ **KAPANDI** — Cloudflare Pages |
| 27 | ~~Statik yüzey barındırma~~ | ✅ **KAPANDI** — tanıtım + davetiye + yardımcı PWA hepsi Cloudflare Pages |
| 28 | Subdomain planı | ✅ `davetly.com` · `admin.davetly.com` · `api.davetly.com` |
| 29 | Cloudflare Access admin önüne eklenecek mi? | Öneri: v1'de hayır, 2FA yeterli |

### Builder check ile kapanan konular (2026-11-02)

| # | Soru | Karar |
|---|---|---|
| B1 | Satın alma v1'de mi? | ✅ **v1'de**, Aşama 2.5, mağaza makbuz doğrulamalı |
| B2 | Fotoğraf doğrulaması nerede çalışır? | ✅ **serv00 R2'den indirip işler** (yükleme R2'ye direkt, doğrulama sunucuda) |
| B3 | serv00'da ne çalışır? | ✅ **Doğrulandı:** FreeBSD, Node v16-26, Prisma/sharp/argon2(native) **çalışmaz** → Drizzle + jimp/canvas + @node-rs/argon2 |
| B4 | PG'ye erişim? | ✅ **Sadece SSH tüneli** → migration'lar host'ta, CI testleri service container ile |
| B5 | Auth taşıma? | ✅ **Mobil bearer + Keychain/Keystore, admin/yardımcı cookie**; GET linki tüketmez, POST tüketir |
| B6 | Davetiye URL'inde ne var? | ✅ **Opaque token, `#fragment`**; gömülü payload iptal edildi |
| B7 | Staging var mı? | ✅ **3 DB'den biri staging** (`davetly_stage`) |
| B8 | iOS nasıl derlenir? | ✅ **Tag + manuel**, ayda ~10 build kotası, Android her push |
| B9 | Görev başına kaç sorumlu? | ✅ **v1: tek** (`UNIQUE`), çoklu atama v1.1 |

---

## 13. Geliştirme sıralaması (kullanıcı onayladı, 2026-11-02)

> **Güvenlik öncelikli sıralama** — `SECURITY.md` §7 ile uyumlu.
> Her aşama, güvenlik testleri geçmeden "tamam" sayılmaz.

### Aşama 1 — Güvenli altyapı + **serv00 doğrulama**

**Aşama 1a — Ortam doğrulaması (kod yazmadan önce, zorunlu):**
1. serv00'da Node sürümü sabitlenir (`node22`), `npm ci` çalışıyor mu?
2. **Drizzle ORM** (veya `pg` + `node-pg-migrate`) kurulup çalışıyor mu?
3. **`@node-rs/argon2`** (prebuilt) kurulup hash üretiyor mu? Çalışmazsa WASM alternatifi
4. **`@napi-rs/canvas` veya `jimp`** kurulup görüntü decode + EXIF strip yapıyor mu?
5. `pg` sürücüsü `pgsqlX.serv00.com:5432`'ye bağlanıyor mu?
6. `pg_dump` çalışıyor mu, çıktı SSH ile dışarı alınabiliyor mu?
7. **SSH tüneli** üzerinden migration çalıştırılabiliyor mu?

> Bu 7 madde geçmeden Aşama 2'ye başlanmaz. Yanlış varsayım burada 1 gün kaybettirir; Aşama 3'te fark edilirse 2 hafta.

**Aşama 1b — Altyapı:**
Repo/ortam · migration sistemi · merkezi hata yönetimi · güvenli loglama (maskeleme) · `/health` · **yedekleme + geri yükleme denemesi**

### Aşama 2 — Kimlik ve yetkilendirme
Magic link girişi · oturum yönetimi · düğün üyelikleri · çift/yardımcı izinleri · **tenant izolasyonu testleri** · **deep link dosyaları (AASA + assetlinks)**

### Aşama 2.5 — Satın alma (yeni)
Play Billing + StoreKit 2 entegrasyonu · makbuz doğrulama (Play Developer API, App Store Server API) · `wedding.plan` idempotent yetkilendirme · restore akışı · sandbox testi

### Aşama 3 — Bütçe ve taksit
Harcama kayıtları · **decimal para hesabı** · taksit planları · transaction ve tutarlılık testleri

### Aşama 4 — Davetli ve RSVP
Davetli modeli · güvenli davetiye token'ları · public davetiye sayfası · RSVP idempotency · WhatsApp paylaşımı

### Aşama 5 — Yardımcı ve görevler
Yardımcı web erişimi · davet ve iptal · görev atama · görev bazlı mesajlaşma · **yetki izolasyonu testleri**

### Aşama 6 — Görev fotoğrafları
R2 private bucket · kota + yükleme izinleri · presigned URL · **görüntü doğrulama + EXIF temizliği** · erişim/silme testleri

### Aşama 7 — Admin ve mobil
Admin SPA + 2FA + RBAC + audit · KMP mobil uygulama · GitHub Actions · test dağıtımı

### Aşama 8 — Yayın öncesi güvenlik denetimi
**14 zorunlu test** (`SECURITY.md` §8) · web güvenlik testleri · yedekten geri dönüş · yük testi · KVKK ve mağaza kontrolleri

### Staging ortamı (builder check sonrası eklendi)

**Sorun:** Test 12 (yedekten geri yükleme) ve migration denemeleri için üretim dışı bir ortam gerekiyor. Hiçbir yerde tanımlı değildi.

**Çözüm — serv00'nin 3 veritabanı hakkı kullanılır:**

| Ortam | Veritabanı | API | Amaç |
|---|---|---|---|
| Production | `davetly_prod` | `api.davetly.com` | Canlı |
| **Staging** | `davetly_stage` | `stage-api.davetly.com` | Migration + restore testi |
| Test/scratch | `davetly_test` | — | Deneme, silinebilir |

**Kurallar:**
- Migration **önce staging'de** çalışır, sonra prod
- Yedek geri yükleme **staging'e** yapılır (prod'a asla)
- Staging'de gerçek kullanıcı verisi **kullanılmaz** — anonim örnek veri
- Staging, Cloudflare Pages preview deployment ile eşleşir
- CI entegrasyon testleri **GitHub Actions service container PostgreSQL** kullanır (serv00'ya bağlanmaz — SSH tüneli gerekir, CI'dan yapılamaz)

---

**Admin alt adımları (Aşama 7 içinde):**
1. `admin_accounts` + RBAC tabloları + migration
2. Argon2id parola hash + login endpoint
3. TOTP enrollment (QR) + doğrulama + kurtarma kodları
4. Session yönetimi (HttpOnly cookie + CSRF)
5. İlk SUPER_ADMIN için tek seferlik CLI provisioning
6. Admin API uçları: overview, users, weddings, system/health, audit-logs
7. React SPA iskeleti + login/2FA ekranları
8. Dashboard + kullanıcı/düğün listeleri
9. Audit log yazımı (kritik işlemler)
10. Yetki testleri (2FA'sız erişim reddi, RBAC, IDOR)

**Fotoğraf alt adımları (Aşama 6 içinde):**
1. R2 hesabı + özel bucket
2. Presigned PUT üretimi (Node.js)
3. Görev fotoğrafı yükleme ekranı (PWA)
4. İstemci sıkıştırma + sunucu doğrulama (MIME, decode, EXIF strip)
5. Kota takibi (PostgreSQL)
6. Görüntüleme (presigned GET) + silme
7. Ücretsiz/premium kota kontrolü
8. Yetki ve güvenlik testleri

**Not:** Backend önce geliyor. Bu, aylarca görünür bir uygulama olmadan çalışmak demek — motivasyon riski bilinçli kabul edildi. Karşılığında her modül hazır olduğunda test edilebilir bir API var.

**Önemli avantaj (2026-11-02):** Yardımcı web olduğu için Aşama 5 **mobil uygulamadan önce** tamamlanabilir. Yani KMP'ye dokunmadan, tarayıcıda çalışan gerçek bir ürün parçası elde edilir. Bu, motivasyon riskini ciddi ölçüde azaltır.

---

## 14. Marka ve tasarım yönü

**Yön: Modern Premium** — sade, zarif, güven veren, romantik ama klişe değil.

**Renkler:**
- Adaçayı yeşili (sage green) — ana
- Kırık beyaz / off-white — zemin
- Bej ve sıcak nötr tonlar — vurgu

**İlkeler:**
- Gereksiz süsleme, yoğun gradient, kalabalık ekran yok
- Büyük dokunma alanları, net hiyerarşi
- Bütçe ekranlarında rakamlar kolay taranmalı
- Durumlar **yalnızca renkle anlatılmaz** — metin/ikon da eşlik eder
- Erişilebilir kontrast, dinamik yazı boyutu, ekran okuyucu etiketleri
- **Türkçe karakter ve uzun metin** her ekranda test edilir

**Tasarım sistemi (v1):** renk tokenları, tipografi ölçeği, boşluk ölçeği, köşe yuvarlaklıkları, buton/kart/metin alanı/durum etiketi bileşenleri, açık tema (karanlık tema v1.1).

Değerler ekranlara gömülmez — merkezi tema/token kullanılır.

---

## 15. API taslağı (özet)

Tam sözleşme `docs/API.md`'de. Taban: `/api/v1`

| Grup | Uçlar |
|---|---|
| Auth (çift) | `POST /auth/magic-link` · `POST /auth/verify` · `POST /auth/logout` · `GET /me` |
| Weddings | `POST/GET/PATCH /weddings`, `GET /weddings/:id` |
| Expenses | `GET/POST /weddings/:id/expenses`, `PATCH/DELETE /expenses/:eid`, `GET /expense-summary`, `GET /installments` |
| Guests | `GET/POST /weddings/:id/guests`, `PATCH/DELETE /guests/:gid` |
| Invitations (public) | `GET /invitations/:token` · `POST /invitations/:token/rsvp` |
| Helpers | `POST /weddings/:id/helpers` · `DELETE /helpers/:hid` · `GET /helper/:token/tasks` · `PATCH /helper/:token/tasks/:tid` |
| Tasks | `GET/POST /weddings/:id/tasks`, `PATCH/DELETE /tasks/:tid` |
| Messages | `GET/POST /tasks/:tid/messages` |
| Photos | `POST /tasks/:tid/photos/presign` · `POST /photos/confirm` · `GET /photos/:pid/url` · `DELETE /photos/:pid` |
| Admin | `POST /admin/auth/login` · `POST /admin/auth/verify-2fa` · `GET /admin/overview` · `GET /admin/users` · `GET /admin/weddings` · `GET /admin/audit-logs` |
| Purchase | `POST /purchases/verify` (Play/App Store makbuzu) · `POST /purchases/restore` |
| Sağlık | `GET /health` |

**Kurallar:** sayfalama/filtreleme standardı · tutarlı hata JSON'u · public uçlara rate limit · yetki hatasında 404/403 stratejisi bilinçli seçilir.

### 15.1 Auth taşıma sözleşmesi (builder check sonrası eklendi)

Üç farklı istemci, üç farklı taşıma. Karıştırılırsa CORS/CSRF kapsamı yanlış kurulur.

| İstemci | Taşıma | Saklama |
|---|---|---|
| **Mobil (KMP)** | **Bearer token** (access + refresh) | Android Keystore / iOS Keychain |
| **Admin SPA** | **HttpOnly cookie** | Tarayıcı (JS erişemez) + CSRF token |
| **Yardımcı PWA** | **HttpOnly cookie** (token → session) | Tarayıcı |
| **Misafir davetiye** | Oturum yok, URL'de token | — |

**Magic link akışı:**
```
1. POST /auth/magic-link {email}     → e-posta gönderilir (her durumda 200 döner)
2. Kullanıcı linke tıklar
3a. Mobil uygulama kurulu  → deep link → uygulama açılır
3b. Uygulama yok           → web sayfası açılır, 6 haneli kod gösterilir
4. POST /auth/verify {token | code}  → Bearer çifti (mobil) VEYA cookie (web)
```

| Konu | Karar | Gerekçe |
|---|---|---|
| **GET linki tüketir mi?** | **Hayır** — sadece sayfa açar | E-posta güvenlik tarayıcıları tek kullanımlık linki yakıp kullanıcıyı dışarıda bırakır |
| Token tüketimi | **POST /auth/verify** anında | Açık kullanıcı eylemi |
| Deep link | `davetly.com/auth#<token>` — fragment | Token loglara düşmez |
| Deep link dosyaları | `apple-app-site-association` + `assetlinks.json` (Pages'te) | iOS/Android universal link |
| Kod yedeği | 6 hane, 5 dk geçerli, 3 deneme | Deep link çalışmazsa kurtarma yolu |
| Access token ömrü | 15 dk | Kısa |
| Refresh token ömrü | 90 gün, rotasyonlu | Düğün hazırlığı ~6-12 ay |
| Refresh iptali | Sunucuda, cihaz bazında | Çalınan cihazı tek tek çıkar |

**Deep link kurulumu için gerekenler (Aşama 2 öncesi):** Apple Team ID, Android paket adı + SHA-256 imza parmak izi.

---

## 16. Güvenlik, gizlilik ve KVKK

> ⚠️ **Bu bölüm özettir.** Bağlayıcı güvenlik spesifikasyonu: **[`docs/SECURITY.md`](../SECURITY.md)**
> Çelişki durumunda `SECURITY.md` geçerlidir. Aşağıdaki liste sadece hızlı referanstır.

### 16.1 Değişmez güvenlik kuralları

1. **Server-side authorization** — her endpoint'te rol, üyelik, kaynak kapsamı
2. **Wedding isolation** — bir düğünün verisi başka düğüne sızmaz
3. **Helper isolation** — yardımcı bütçe/davetli/başka görev göremez
4. **Token güvenliği** — yüksek entropi, DB'de **hash**, iptal/yenileme, rate limit
5. **Parola** — Argon2id (admin) / magic link (çift), asla düz metin
6. **Transport** — HTTPS zorunlu
7. **Secrets** — `.env` / GitHub Secrets, koda yazılmaz
8. **Input validation** — tüm girdiler backend'de doğrulanır (Zod)
9. **SQL injection** — parametreli sorgu / ORM
10. **XSS** — misafir sayfasında kullanıcı metni güvenli render, ham HTML yok
11. **CSRF** — cookie auth varsa koruma
12. **Rate limiting** — login, RSVP, token, davet kabul, fotoğraf presign
13. **Logging** — parola, token, telefon, davet URL'si **loglanmaz**
14. **Data minimization** — gereksiz kişisel veri toplanmaz
15. **IDOR/BOLA** — her kaynağın sahiplik kontrolü; istemciden gelen `wedding_id`'ye güvenilmez
16. **Backups** — sağlayıcı yedeğine tek başına güvenilmez, şifreli ayrı kopya
17. **Dependency security** — güncel tutulur, açıklar izlenir
18. **No secrets in Git** — `.env` gitignore'da, `.env.example` sadece anahtar adları

### 16.2 KVKK

Türkiye'de kişisel veri işlendiği için yayın öncesi uzman görüşü gerekir:
- Aydınlatma metni
- Veri işleme amacı ve saklama süresi
- Kullanıcı hakları (silme, dışa aktarma)
- Gerekiyorsa açık rıza / yurt dışı aktarım (serv00 = AB, Cloudflare = global)
- **Misafir telefon numarası** kişisel veridir — gereksiz toplama, erişim kısıtı, silme politikası

> Bu doküman hukuki danışmanlık değildir.

---

## 17. Yönetici paneli (Admin)

**Karar:** Ayrı web uygulaması, `admin.davetly.com`. Aynı Node.js backend, `/api/v1/admin/...` uçları.

### 17.1 Kapsam (v1 — kesin)

> **Kullanıcı kararı (2026-11-02):** Admin paneli **v1'de kesinlikle yer alır.** v1.1'e ertelenmez.

**v1 admin modülleri:**
- Genel bakış: toplam kullanıcı, aktif düğün, ücretsiz/premium sayıları, yeni kayıtlar
- Kullanıcı yönetimi: arama, filtre, hesap durumu, askıya alma
- Düğün yönetimi: kimlik, tarih, sahip/üyeler, görev/davetli sayıları
- Sistem sağlığı: API health, DB durumu, son yedek zamanı, son hatalar
- Audit log görüntüleme
- R2 depolama kullanımı (düğün bazında)

**v1.1'e ertelenen:** ödeme/iade yönetimi, destek talepleri, promosyon kodları, duyurular, personel daveti, gelişmiş analitik.

### 17.2 Kimlik doğrulama
- **E-posta + parola + zorunlu TOTP 2FA** (RFC 6238)
- Argon2id parola hash
- Kurtarma kodları: yalnızca **hash** saklanır, tek kullanım
- 2FA tamamlanmadan hiçbir admin endpoint'i veri döndürmez
- Oturum: `HttpOnly`, `Secure`, uygun `SameSite` + CSRF koruması
- **Herkese açık admin kaydı yok** — ilk admin tek seferlik CLI provisioning ile oluşturulur

### 17.2.1 Barındırma ve güvenlik sınırı

Admin SPA **Cloudflare Pages**'te (`admin.davetly.com`), backend **serv00**'da (`api.davetly.com`).

| Katman | Sorumluluk |
|---|---|
| Cloudflare Pages | Sadece statik dosya sunumu |
| serv00 API | Giriş, 2FA, yetki, RBAC, audit — **hepsi burada** |

**Kurallar:**
- React uygulamasında **hiçbir gizli anahtar / API secret bulunmaz**
- Frontend'de menü gizlemek güvenlik değildir; her istek backend'de doğrulanır
- CORS: yalnızca `admin.davetly.com` kaynağına izin
- Cookie `Domain`/`SameSite` ayarları cross-origin akışa göre yapılandırılır
- Opsiyonel: `admin.davetly.com` önüne **Cloudflare Access** eklenebilir — uygulama içi yetkilendirmenin yerine geçmez

**Deploy akışı (yerel derleme yok):**
```
Kod düzenle → git push → GitHub → Cloudflare Pages otomatik build → yayın
```
Build komutu: `npm run build` · Çıktı: `dist` · Node sürümü Pages ayarlarından sabitlenir.

### 17.3 Roller (genişletilebilir RBAC)
v1'de tek rol: `SUPER_ADMIN`. İleride: `SUPPORT`, `OPERATIONS`, `BILLING`.
Roller **izinlere** eşlenir (`users.read`, `users.suspend`, `weddings.read`, `billing.manage`, `admins.manage`). Frontend menüsünü gizlemek güvenlik değildir — her istek backend'de kontrol edilir.

### 17.4 Tablolar

**9 admin tablosu** (şema `SECURITY.md` §4 ve brief §21.6 ile uyumlu):

```
admin_accounts         id, user_id → users, status, created_by_admin_id,
                       last_login_at, created_at
admin_roles            id, code (SUPER_ADMIN|SUPPORT|OPERATIONS|BILLING), name
admin_permissions      id, code (users.read | users.suspend | weddings.read |
                       billing.manage | admins.manage | …)
admin_role_permissions admin_role_id, admin_permission_id
admin_user_roles       admin_account_id, admin_role_id, assigned_by_admin_id
admin_mfa_factors      id, admin_account_id, factor_type (totp),
                       secret_encrypted ← ŞİFRELİ, confirmed_at
admin_recovery_codes   id, admin_account_id, code_hash ← HASH, used_at
admin_sessions         id, admin_account_id, session_token_hash ← HASH,
                       expires_at, revoked_at, last_seen_at, ip_hash
admin_audit_logs       id, admin_account_id, action, target_type, target_id,
                       reason, metadata (hassas veri YOK), ip_hash, created_at
                       ← APPEND-ONLY: UPDATE/DELETE yetkisi yok
```

**Ek: uygulama düzeyi audit (çift/yardımcı işlemleri)**

```
audit_log
  ├─ id, wedding_id (nullable)
  ├─ actor_kind: USER | HELPER | ADMIN | SYSTEM
  ├─ actor_id (nullable)
  ├─ action (ör. "helper.revoked", "expense.deleted", "plan.upgraded")
  ├─ entity_type, entity_id
  ├─ metadata (JSONB — hassas veri YOK)
  └─ created_at
  ← APPEND-ONLY: uygulama UPDATE/DELETE yetkisi verilmez
```

TOTP secret **şifreli** saklanır. Session token **hash**'lenir. Audit log'da parola/token/secret/kişisel içerik bulunmaz.

### 17.5 Sınır
Admin paneli **gözetim aracı değildir.** Çiftin bütçesi, görev sohbeti veya fotoğrafları varsayılan olarak gösterilmez. Gerçekten gerekliyse gerekçe + kapsam + erişen admin kayda geçer.

---

## 18. Test stratejisi

### Backend (unit/integration)
- Kullanıcı yalnızca üyesi olduğu düğünü görür
- Yardımcı bütçe/davetli endpoint'ine erişemez
- Yardımcı yalnızca atandığı görevi ve mesajları görür
- Başka düğünün ID'si ile veri okunamaz (IDOR)
- İptal edilen token çalışmaz
- Başka misafirin token'ı ile kayıt okunamaz
- RSVP tekrar gönderildiğinde veri bozulmaz (idempotent)
- **Taksit toplamı harcama toplamına kuruş hassasiyetinde eşit**
- Silinen/iptal edilen üyelik erişimi anında keser
- Fotoğraf kotası aşılamaz, MIME doğrulanır
- Admin 2FA'sız veri alamaz

### Mobil
- Giriş/kayıt akışı, boş durumlar, ağ kesintisi, tekrar deneme
- Yükleme/hata/başarı durumları
- Türkçe metin taşmaları, küçük ekran, büyük yazı boyutu
- Android/iOS platform farkları

### Web (misafir + yardımcı)
- Android/iOS tarayıcıda responsive
- Yavaş bağlantı, geçersiz/iptal token
- RSVP başarı/hata akışları, XSS denemeleri, tekrarlı istekler

---

## 19. CI/CD ve dağıtım

**Geliştirme akışı:** CachyOS'ta düzenle → Git commit → GitHub push → GitHub Actions / Cloudflare Pages → yayın.

> Kullanıcı **yerelde derleme yapmıyor** — ne mobil ne web. Her şey CI'da.

| Workflow | Nerede çalışır | İçerik |
|---|---|---|
| `backend-ci.yml` | GitHub Actions | install, lint, typecheck, test, build |
| `android-ci.yml` | GitHub Actions | APK (test) / AAB (mağaza) |
| `ios-ci.yml` | GitHub Actions (macOS) | Xcode/KMP build |
| `admin-ci.yml` | GitHub Actions | React lint + build (test amaçlı) |
| `deploy-backend.yml` | GitHub Actions | main sonrası serv00 deploy (ilk etapta manuel onay) |
| **Admin SPA deploy** | **Cloudflare Pages** | GitHub push → otomatik build + yayın |
| **Davetiye + yardımcı PWA** | **Cloudflare Pages** | GitHub push → otomatik build + yayın |

**Backend deploy:** SSH/SFTP + `devil www restart DOMAIN`. Anahtarlar GitHub Secrets'ta. Migration öncesi yedek, geri dönüş planı.

**Cloudflare Pages deploy:** GitHub reposu bağlanır, build komutu ve çıktı dizini ayarlanır. Her push otomatik yayınlanır. Preview deployment'lar ücretsiz ve sınırsız.

**Mobil dağıtım:** Android = Play internal testing → production. iOS = TestFlight → App Store.

### iOS derleme bütçesi (builder check sonrası eklendi)

**Sorun:** macOS runner dakikası ücretli. Private repo'da aylık $12 dahil kota ÷ $0.062/dk ≈ **193 dk** macOS. Bir KMP iOS build ~15-20 dk → **ayda ~10 build.** Bu, "her push'ta iOS build" için yetersiz.

**Karar:**
- **Repo private** kalır (kaynak kod ticari ürün)
- `ios-ci.yml` **her push'ta çalışmaz** — sadece:
  - `workflow_dispatch` (manuel)
  - `v*` tag push (sürüm)
  - `ios/**` veya `shared/**` değişen PR'lar
- Android build her push'ta çalışır (ücretsiz Linux runner)
- Yerel Mac yok → iOS hata ayıklama **CI logları + TestFlight** üzerinden yapılır (yavaş ama mümkün)

**Gereken (Aşama 7 öncesi):** Apple Developer hesabı, distribution certificate, provisioning profile, App Store Connect API key, **Team ID** (deep link için).

> **Risk kabulü:** macOS kotası dolarsa iOS build ay sonuna kadar durur. Bu bilinçli — Android öncelikli, iOS tag'lerde.

**Ortam değişkenleri:**

| Yer | Ne saklanır |
|---|---|
| GitHub Secrets | serv00 SSH anahtarı, Play/App Store signing, **App Store Connect API key**, **Play servis hesabı JSON**, DB şifresi |
| serv00 `.env` | DB bağlantısı, JWT secret, Brevo API key, R2 anahtarları, VAPID, mağaza doğrulama anahtarları |
| Cloudflare Pages | **Sadece public değişkenler** (API URL) — secret yok |
| Cloudflare dashboard | R2 token'ları, DNS |

---

## 20. Kabul kriterleri (v1 "hazır" sayılmadan)

> **Ayrıca bkz:** `SECURITY.md` §8 — **14 zorunlu güvenlik testi.** Bunlar geçmeden yayına çıkılmaz.

- Çift kayıt olup düğün oluşturabiliyor
- Harcama ekleyip düzenleyebiliyor; **taksitler doğru aylara dağılıyor, toplamlar tutuyor**
- Davetli ekleyip güvenli davetiye linki üretebiliyor
- WhatsApp mesajı kullanıcının kendi uygulamasında hazırlanıyor (otomatik gönderim yok)
- Misafir uygulama indirmeden davetiyeyi açıp RSVP verebiliyor
- **RSVP yalnızca POST ile değişiyor; GET/link-preview yan etki yaratmıyor**
- **`allowed_party_size` ve `confirmed_party_size` ayrı tutuluyor**
- Çift RSVP sonuçlarını görüyor
- Çift yardımcı davet edip görev atayabiliyor
- **Yardımcı uygulama indirmeden** token'lı linkten görevlerini görüp durum güncelleyebiliyor
- Yardımcı bütçe ve davetli verisine **API üzerinden de** erişemiyor
- **Yardımcı yalnızca atandığı görevleri görüyor; düğün üyeliği tüm görevlere erişim vermiyor**
- Başka düğünün ID'si ile veri okunamıyor; **composite FK yanlış wedding_id yazımını DB'de reddediyor**
- Token iptali ve rol iptali erişimi kesiyor
- Görev fotoğrafı yüklenebiliyor, kota ve MIME kontrolü çalışıyor
- **Fotoğraf yüklemesinde EXIF temizleniyor, decode doğrulaması yapılıyor**
- Admin 2FA olmadan panele giremiyor
- **Normal kullanıcı admin paneline veya admin API'lerine erişemiyor**
- **Admin herkese açık kayıtla oluşturulamıyor** (tek seferlik CLI provisioning)
- **Geçersiz/tekrar kullanılan kurtarma kodu reddediliyor**
- **Kritik admin işlemleri audit log üretiyor**; log'da parola/token/secret yok
- **Audit log normal admin işlemleriyle değiştirilemiyor/silinemiyor**
- **Admin paneli çiftin bütçe/sohbet/fotoğraf içeriğini varsayılan göstermiyor**
- **Admin dashboard metrikleri gerçek DB sorgularından geliyor** (demo sayı yok)
- **Auth/admin/RSVP yanıtları CDN cache'ine girmiyor** (`Cache-Control: no-store`)
- **Güvenlik header'ları ayarlı** (CSP, HSTS, Referrer-Policy, nosniff, X-Frame-Options)
- **CORS `*` değil, açık origin listesi**
- GitHub Actions backend test/build ve Android build çalıştırıyor
- Üretim secret'ları repoda değil
- DB yedekleme/geri yükleme denenmiş
- Misafir ve yardımcı sayfaları mobil tarayıcıda çalışıyor
- **iOS'ta Android'de olan her şey çalışıyor**

---

## 21. Analitik ve ürün doğrulama

Kod yazmadan **önce** gerçek çiftlerle doğrula: **15–20 çift** ile görüşme veya prototip testi.

Ölçülecek metrikler:
- Düğün oluşturmayı tamamlayan oran
- İlk harcamayı ekleme oranı
- İlk davetliyi ekleme + davetiye linki üretme oranı
- RSVP dönüşüm oranı
- En az bir yardımcı davet etme oranı
- Haftalık aktif çift
- Bırakma noktaları

v1'de kapsamlı üçüncü taraf analitik zorunlu değil — gizlilik ve maliyet gözetilir.

---

## 22. Sonraki adımlar

**Kapanan kararlar (2026-11-02):** v1 kapsamı = üç özellik birden · 2. eş = davet kodu · platform = Android+iOS · senkron = server-first+offline-aware · yardımcı = PWA · fotoğraf = R2 · admin paneli = React + 2FA

**Kalan engeller:**
1. ⚠️ **Alan adı alınmadı** — Brevo magic link ve `admin.` / `api.` alt alan adları için gerekli. **Aşama 2'yi (auth) bloke eden tek somut eksik.**
2. ⏳ KVKK saklama süreleri — `SECURITY.md` §6.3'te öneri var, onay bekliyor
3. ⏳ Admin hesap kurtarma prosedürü — `SECURITY.md` §4.9

**Çözülen (2026-11-02):** Admin hosting → Cloudflare Pages · Yerel DB → Room · Offline taslak → Room `pending_` · Geliştirme sırası → 8 aşamalı güvenlik öncelikli

**Sonraki adımlar:**
1. ⏳ Builder check (taze subagent ile gözden geçirme)
2. ⏳ Kullanıcı onayı
3. ⏳ `writing-plans` → uygulama planı
