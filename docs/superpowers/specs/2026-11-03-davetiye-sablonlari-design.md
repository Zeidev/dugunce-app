# Davetiye şablonları — tasarım dokümanı

**Tarih:** 2026-11-03
**Durum:** Onay bekliyor
**İlgili:** Brief §3 (marka), §5.6 (misafir web davetiyesi), Aşama 6 (fotoğraflar — kapsam dışı)

---

## 1. Amaç

Misafir davetiyesi (`frontend/public/d/index.html`) bugün işlevsel ama tasarımsal
olarak zayıf: düz kart, satır listesi, düğün davetiyesi hissi yok. Bu çalışma
davetiye sayfasını **editoryal** bir tasarıma taşır ve çifte **şablon seçimi**
verir.

Tanıtım sayfası (`frontend/public/index.html`) aynı tasarım diliyle yeniden
yazılır — şu an 63 satırlık bir yer tutucu.

### Neden şimdi

Brief §3.1 "Modern Premium" diyor ama davetiye sayfası bunu yansıtmıyor. Ayrıca
çift, ürünün en çok paylaşılan yüzeyini (WhatsApp ile gönderilen davetiye)
özelleştiremiyor.

---

## 2. Kapsam

### Dahil

- Davetiye sayfası için **editoryal** tasarım dili
- **Dört sabit şablon** ve çiftin bunlardan birini seçmesi
- `weddings.template` sütunu + migration
- Şablon seçim ekranı (mobil uygulama, ayarlar altında)
- Davetiyenin seçilen şablonla render edilmesi
- Tanıtım sayfasının aynı dille yeniden yazımı

### Dahil değil

- **Fotoğraf yükleme** — Aşama 6. R2 bucket bağlı değil (`.env`'de `R2_*` yok).
  Fotoğraf alanı tasarımda **yer tutucu** olarak hazırlanır, devreye girmez.
- Serbest renk/font özelleştirmesi — kullanıcı CSS yazamaz (bkz. §4).
- Gelin/damat tarafına göre ayrı şablon — kullanıcı kararı: **ortak tek şablon**.
- Şablon önizleme galerisi dışında bir yönetim arayüzü.

### Anti-hedefler

Bu iş şu durumlarda **başarısız** sayılır:

- Davetiye sayfası yüklenirken POST atar hâle gelirse (WhatsApp önizlemesi
  davetliyi haberi olmadan "geliyorum" yapar).
- Token `#fragment` dışına çıkarsa (sunucu loglarına düşer).
- Şablon seçimi yüzünden davetli başka misafirlerin verisini görebilirse.
- Kullanıcı girdisi CSS'e enjekte edilebilirse.

---

## 3. Kısıtlar

| Kısıt | Kaynak | Etki |
|---|---|---|
| Davetiye sayfası yüklenirken yazma işlemi yapmaz | `d/index.html` yorumları | Şablon seçimi çift tarafında, davetliye yansır |
| Token `#fragment`'te | SECURITY, `d/index.html` | Değişmiyor |
| Open Graph etiketi yok | SECURITY | Değişmiyor — şablon adı bile sızmamalı |
| "Yoğun gradient ve kalabalık ekrandan kaçın" | Brief §3.1 | Gradient kullanılmaz |
| Tasarım değerleri merkezi tokenlardan | Brief §3.2 | Ham renk/ölçü yazılmaz |
| Durumlar yalnız renkle anlatılmaz | Brief §3.1 | Metin/ikon eşlik eder |
| Serv00 kısıtlı kaynak | Brief §8.2 | Şablonlar istemci tarafında, ek istek yok |

---

## 4. Yaklaşımlar ve seçim

Şablonların nasıl saklanacağı üç şekilde olabilirdi:

**A — Sabit şablonlar (kod içinde).** Şablonlar `templates.css` içinde token
setleri. `weddings.template` sütununda `'ZARIF'` gibi bir anahtar. Yeni şablon =
deploy.

**B — Token'lar veritabanında (JSONB).** Çift renk/font seçer. Esnek ama
davetiye kullanıcı verisinden CSS üretir → CSS enjeksiyonu riski ve doğrulama
yükü.

**C — Hibrit.** Sabit set + sınırlı palet seçimi.

**Seçilen: A.** Gerekçe: Brief §3.2 merkezi tokenları zaten emrediyor; "ortak
tek şablon" kararı özelleştirme ihtiyacını azaltıyor; A en güvenli ve en hızlı.
C'ye geçiş sonradan veri kaybı yaratmadan mümkün (şablon anahtarı korunur,
üstüne palet alanı eklenir).

---

## 5. Şablon seti

**11 şablon.** Hepsi aynı DOM iskeletini paylaşır; tokenlar ve font değişir.

> **Karar (2026-11-03):** Tüm şablonlar şimdilik korunuyor. Hangi şablonların
> kalacağı, hangilerinin silineceği sonraki bir turda kararlaştırılacak.
> Eleme yapılana kadar her şablon test kapsamındadır.

| # | Anahtar | Ad | Font | Karakter |
|---|---|---|---|---|
| 1 | `ZARIF` | Zarif | Parisienne | Altın çizgi, ortalanmış, ince botanik. **Varsayılan.** |
| 2 | `BOTANIK` | Botanik | Great Vibes + Allura | Okaliptüs köşesi, pembe çiçek, kır düğünü |
| 3 | `ROMANTIK` | Romantik | Dancing Script | Bordo buket, gül tonları, sıcak |
| 4 | `MINIMAL` | Minimal | Sacramento | Süsleme yok, sola yaslı, bol boşluk |
| 5 | `GECE` | Gece | Great Vibes | Koyu zemin, altın vurgu, akşam düğünü |
| 6 | `ZEYTIN` | Zeytin | Allura | Okaliptüs, adaçayı zemin, doğal |
| 7 | `EDITORYAL` | Editoryal | Playfair Display + Josefin Sans | Gazete düzeni, sola yaslı, koyu bant |
| 8 | `MONOGRAM` | Monogram | Cormorant Garamond + Josefin Sans | Altın daire monogram (AB) |
| 9 | `LUKS` | Lüks | Bodoni Moda | Siyah zemin, yüksek kontrast serif |
| 10 | `FOTOGRAFLI` | Fotoğraflı | DM Serif Display + Josefin Sans | Tam genişlik fotoğraf, gradient perde |
| 11 | `TIPOGRAFI` | Saf tipografi | Cormorant Garamond | Süsleme yok, dikey akış, minimal lüks |

### Font havuzu

10 font, hepsi **Türkçe tam kapsamlı** (`ş ğ İ ı ç ö ü Ş Ğ Ç Ö Ü` doğrulandı):

| Font | Tip | Boyut (latin+ext) |
|---|---|---|
| Parisienne | script | 37 KB |
| Great Vibes | script | 109 KB |
| Dancing Script | script | 37 KB |
| Allura | script | 48 KB |
| Sacramento | script | 38 KB |
| Playfair Display | serif display | 34 KB |
| Cormorant Garamond | serif display | 43 KB |
| DM Serif Display | serif display | 36 KB |
| Bodoni Moda | serif display | 23 KB |
| Josefin Sans | sans | 22 KB |

**Kaldırılan:** Mrs Saint Delafield — `latin-ext` dosyası 1.968 bayttı ve `Ş`
glifi yoktu. `unicode-range` bildirimi glifin var olduğunu garanti etmiyor;
font dosyası boyutu bu durumun erken uyarısıdır. Yeni font eklenirken
**gerçek render** ile doğrulanmalı, yalnız `unicode-range` ile yetinilmemeli.

### Font seçimi

Çift **şablonu** ve **fontu** ayrı ayrı seçebilir:

- Her şablonun **önerilen** bir fontu var (yukarıdaki tablo)
- Çift isterse aynı font havuzundan başka bir font seçer
- `weddings.template` (şablon) + `weddings.fontKey` (font) iki ayrı sütun
- Font boş/geçersizse şablonun önerilen fontu kullanılır

Böylece "11 şablon × 10 font" gibi bir kombinasyon patlaması oluşmaz;
şablonun renk/motif düzeni sabit kalır, yalnız tipografi değişir.

### Token eksenleri

Her şablon şu değerleri tanımlar:

```css
[data-template="ZARIF"] {
  --t-bg: #efece5;          /* sayfa zemini */
  --t-card: #fdfcfa;        /* kart yüzeyi */
  --t-ink: #2d3a2e;         /* ana metin */
  --t-muted: #7a746a;       /* ikincil metin */
  --t-accent: #a8925f;      /* vurgu (altın) */
  --t-accent-ink: #fff;     /* vurgu üstü metin */
  --t-line: #f0ece5;        /* çizgi */
  --t-radius: 2px;          /* köşe */
  --t-font-display: 'Parisienne', cursive;
  --t-font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --t-rule: 3px;            /* üst süsleme çizgisi kalınlığı */
  --t-align: center;
}
```

`--t-font-display` çalışma zamanında `weddings.fontKey` ile ezilir.

### "Aynı DOM, sadece token" — yumuşak kural

Şablonlar **aynı DOM iskeletini** paylaşır: aynı öğeler, aynı sıra, aynı
`id`'ler. **RSVP bloğu tek kaynaktır** — hiçbir şablona özel JS veya ayrı
RSVP işaretlemesi yoktur.

Buna karşılık **sınırlı şablon-özel CSS** serbesttir. Gerekçe: onaylanan
mockup'larda BOTANIK'in köşe motifi, MONOGRAM'in daire monogramı, FOTOGRAFLI'nin
tam genişlik fotoğrafı var. Bunları tokenlara sıkıştırmak mockup'ları inşa
edilemez kılardı. Şablon başına birkaç satır yapısal CSS yazılabilir.

**Sert kalan sınır:** RSVP mantığı, token okuma, hata/durum yönetimi tek
kaynakta. Şablon CSS'i bunlara dokunamaz.

### Görsel varlıklar

`frontend/public/assets/` altında:

| Klasör | İçerik | Toplam |
|---|---|---|
| `fonts/` | 10 font × 2 alt küme (latin, latin-ext) + `OFL.txt` | 468 KB |
| `motifs/` | 17 motif, PNG + WebP (şeffaf) | 2 MB / 356 KB WebP |
| `photos/` | `couple-photo` (JPG + WebP) | 128 KB |

**Sayfa başına yük:** Bir şablon yalnız kendi 2-4 font dosyasını ve 2-4
motifini yükler. Hedef: davetiye sayfası toplam **150 KB altında**.

### Motif envanteri

`rose-cream`, `hydrangea`, `anemone`, `branch-a/b/c/d`,
`botanical-tall-a/b/c`, `heart-outline`, `texture-silk/paper/leaves`,
`blossom-pink`, `corner-eucalyptus`, `bouquet-burgundy`

Renkler uygulamanın `DesignTokens.kt` değerleriyle hizalı: adaçayı `#4A5F45`,
krem `#F4F2EE`, mürekkep `#2D3A2E`, soluk `#7A746A`, çizgi `#E6E1D8`. Altın
`#a8925f` projenin kendi belge dilinden (`docs/dugunce-fikir-ozeti.html`).

---

## 6. Veri modeli

`weddings` tablosuna tek sütun:

İki sütun:

```ts
template: text('template').notNull().default('ZARIF'),
fontKey:  text('font_key').notNull().default(''),
```

`fontKey` boş dize = "şablonun önerilen fontunu kullan". Böylece yeni şablon
eklendiğinde eski kayıtlar otomatik doğru fontu alır.

Migration: `0007_wedding_template.sql`

```sql
ALTER TABLE weddings
  ADD COLUMN template text NOT NULL DEFAULT 'ZARIF',
  ADD COLUMN font_key text NOT NULL DEFAULT '';
```

Mevcut düğünler `ZARIF` + önerilen font alır — geriye dönük uyumlu.

**Neden enum değil text:** Şablon eklemek migration gerektirmesin. Doğrulama
uygulama katmanında (`z.enum([...])`). Bilinmeyen değer gelirse `ZARIF`'e düşer
(savunmacı).

---

## 7. API

### Değişen

`GET /api/v1/invitations/:token` yanıtına `template` ve `fontKey` eklenir:

```json
{
  "invitation": {
    "coupleNames": "Ayşe & Burak",
    "weddingDate": "2026-06-14T15:30:00.000Z",
    "template": "ZARIF",
    "fontKey": "PARISIENNE",
    "venueName": "Kır Bahçesi",
    "...": "..."
  }
}
```

Bilinmeyen/boş şablon → `"ZARIF"`. Boş `fontKey` → şablonun önerilen fontu.
Sunucu bu normalleştirmeyi **kendisi yapar**; istemciye geçersiz değer gitmez.

**Beyaz liste güncellenir:** `backend/src/guests/public-view.ts` içindeki
`PUBLIC_FIELDS` dizisine `'template'` ve `'fontKey'` eklenir. Bu dosyanın
tam-anahtar testi var — test de güncellenir. `...row` yayma kuralı **ihlal
edilmez**; alanlar açıkça eklenir.

`PATCH /api/v1/weddings/:id` gövdesine `template` ve `fontKey` eklenir (mevcut
`updateWedding` servisi üzerinden). Yetki: `OWNER` / `CO_OWNER` — mevcut kural
değişmiyor.

### Çift tarafı okumalar

`template` ve `fontKey`, `GET /api/v1/weddings` ve `GET /api/v1/weddings/:id`
yanıtlarına da eklenir; `WeddingDto`'ya ve `DtoContractTest`'e girer. Gerekçe: `TemplateScreen`
uygulama yeniden açıldığında mevcut seçimi işaretleyebilmeli. Aksi hâlde her
açılışta "seçili değil" görünür.

### Hata eşlemesi

`PATCH /weddings/:id` bugün Zod hatasını `toHttpError`'dan geçirmiyor —
`weddingPatchSchema.parse` fırlatıyor ve `errorHandler` **500** döndürüyor.
`template` için 400 gerektiğinden `weddings` router'ına hata eşlemesi eklenir.

**Kapsam:** eşleme **tüm düğün alanları** için eklenir (yalnız `template` için
değil). Gerekçe: bugün `coupleNames`, `weddingDate`, `mapUrl` gibi alanlara
geçersiz değer gönderen istemci 500 alıyor — bu yanlış ve hata ayıklamayı
zorlaştırıyor. Davranış değişikliği bilinçlidir ve testlerle kapsanır.

### Değişmeyen

- `POST .../rsvp` — aynı
- Token `#fragment`'te — aynı
- GET yan etkisiz — aynı
- Davetliye başka misafir verisi dönmez — aynı
- Open Graph etiketi yok — aynı

---

## 8. Davetiye sayfası

`frontend/public/d/index.html` — tek dosya, statik, bağımlılıksız kalır.

### Yapı

```
<body data-template="ZARIF" data-font="PARISIENNE">
  <div class="card">
    <div class="rule"></div>           <!-- üst süsleme çizgisi -->
    <header>
      <p class="eyebrow">EVLENİYORUZ</p>
      <h1>Elif & Mert</h1>
      <div class="divider"></div>
      <p class="salutation">Sayın <strong>Ayşe Yılmaz</strong>, ...</p>
      <p class="date">14 HAZİRAN 2026</p>
      <p class="meta">PAZAR · 18:30</p>
    </header>
    <dl class="details">...</dl>
    <ul class="program">...</ul>
    <p class="gift">...</p>
    <section class="rsvp">...</section>
  </div>

  <p class="grow"><a href="https://dugunce.com.tr">Düğünce ile düğününü planla</a></p>
</body>
```

### Büyüme bağlantısı KORUNUR

`<p class="grow">` kartın **dışında**, altında kalır. Gerekçe:
`2026-11-02-dugunce-design.md` satır 360 bu bağlantıyı `✓` (zorunlu) işaretliyor
ve satır 901 *"Asıl büyüme oradan gelir, davetli sayısından değil"* diyor. Bu
sayfa ürünün ana büyüme kanalı — şablon çalışması onu düşüremez.

Şablona göre yalnız tipografisi değişir (`--t-muted`, `--t-font-body`); bağlantı
her şablonda görünür ve erişilebilir kalır.

### Uygulama

`render()` içinde, veri geldikten sonra:

```js
document.body.dataset.template = normalizeTemplate(data.template)
document.body.dataset.font = normalizeFont(data.template, data.fontKey)
```

```js
const TEMPLATES = ['ZARIF','BOTANIK','ROMANTIK','MINIMAL','GECE','ZEYTIN',
                   'EDITORYAL','MONOGRAM','LUKS','FOTOGRAFLI','TIPOGRAFI']
const FONTS = ['PARISIENNE','GREAT_VIBES','DANCING_SCRIPT','ALLURA','SACRAMENTO',
               'PLAYFAIR','CORMORANT','DM_SERIF','BODONI','JOSEFIN']
const RECOMMENDED_FONT = {
  ZARIF:'PARISIENNE', BOTANIK:'GREAT_VIBES', ROMANTIK:'DANCING_SCRIPT',
  MINIMAL:'SACRAMENTO', GECE:'GREAT_VIBES', ZEYTIN:'ALLURA',
  EDITORYAL:'PLAYFAIR', MONOGRAM:'CORMORANT', LUKS:'BODONI',
  FOTOGRAFLI:'DM_SERIF', TIPOGRAFI:'CORMORANT',
}
function normalizeTemplate(t) { return TEMPLATES.includes(t) ? t : 'ZARIF' }
function normalizeFont(t, f) {
  return FONTS.includes(f) ? f : RECOMMENDED_FONT[normalizeTemplate(t)]
}
```

Şablon CSS'i `<style>` içinde `[data-template="..."]`, fontlar
`[data-font="..."]` seçicileriyle tanımlı.

**Font yükleme:** Sayfa yalnız **seçili şablonun fontunu** indirir. `@font-face`
kuralları `latin` + `latin-ext` çifti olarak yazılır; `font-display: swap`
zorunlu. Tarayıcı `unicode-range` sayesinde yalnız gerekli alt kümeyi çeker.

```css
@font-face {
  font-family: 'Parisienne';
  src: url('/assets/fonts/parisienne-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, ...;
  font-display: swap;
}
```

### Korunacaklar

- `#fragment` token okuma
- GET'in yan etkisizliği (yorumla belgelenmiş)
- `noindex`, `no-referrer`, Open Graph yok
- `prefers-reduced-motion` desteği
- Erişilebilirlik: `aria-live`, `aria-pressed`, `role="status"`, 48px dokunma alanı
- Klavye erişimi ve odak halkaları

---

## 9. Mobil uygulama

Ayarlar altında **"Davetiye görünümü"** ekranı:

- **11 şablonun** küçük önizlemeleri (yerel render, ağ yok)
- Seçili olan işaretli
- **Font seçimi:** şablonun önerilen fontu varsayılan; çift 10 fonttan birini seçebilir
- Font değiştiğinde önizleme anında güncellenir
- Seçim `PATCH /weddings/:id` ile kaydedilir (`template` + `fontKey`)
- Kaydetme başarılıysa "Davetiyeniz güncellendi" mesajı

Yeni ekran: `ui/screens/TemplateScreen.kt`
`Screen` enum'una `TEMPLATE` eklenir — `ScreenCoverageTest` kapsamına girer.

Fotoğraf alanı bu ekranda **yer tutucu** olarak görünür ("Aşama 6'da geliyor"),
tıklanınca bilgi verir. Devre dışı olduğu açıkça yazar.

---

## 10. Tanıtım sayfası

`frontend/public/index.html` yeniden yazılır. Bugünkü hâli 63 satırlık bir yer
tutucu ("Yakında" + üç özellik kutusu).

**Onaylanan tasarım:** `landing-v3` (arşiv: `.superpowers/brainstorm/…/content/landing-v3.html`)

### Tasarım kararı

Üç aday çizildi ve karşılaştırıldı:

| Aday | Tema | Sonuç |
|---|---|---|
| v1 | Açık krem, simetrik kartlar | Sıcak ama yapı olarak muhafazakâr |
| v2 | Tamamen koyu | **Elenmedi ama tema reddedildi** — Brief §3.2 "açık tema" diyor, uygulama da açık |
| **v3** | **Açık + koyu vurgu blokları** | **Seçildi** |

v3, v2'nin yapısal cesaretini (dev tipografi, asimetrik satırlar, hareket)
korur ama açık zeminde. Koyu zemin yalnız **iki blokta**: istatistik bandı ve
final CTA. Böylece sayfa ritim kazanır, koyu bir ürün gibi görünmez.

### Bölümler

1. **Sticky nav** — scroll'da cam efektine geçer (`backdrop-filter: blur`),
   mobilde hamburger menü (≤1040px)
2. **Hero** — `min-height:100vh`, dev serif başlık (`clamp` 42-82px), bir
   kelime **outline** (`-webkit-text-stroke`), sağda üç davetiye kartı yelpaze
   düzeninde (hover'da açılır) + iki istatistik çipi
3. **Kayan şerit (marquee)** — 6 istatistik, sonsuz döngü
4. **Özellikler** — asimetrik numaralı satırlar (`01 | başlık | açıklama + etiket`)
5. **Şablon galerisi** — 4 gerçek şablon önizlemesi, her biri kendi fontuyla
6. **Koyu istatistik bandı** — 3 modül · 11 şablon · 10 font · 0₺
7. **Misafir deneyimi** — solda metin, sağda telefon çerçevesi içinde davetiye
8. **SSS** — accordion (ilk soru açık, klavye erişimi, `aria-expanded`)
9. **Final CTA** — koyu blok, platform rozetleri
10. **Footer** — 4 sütun + alt satır: `© 2026 Düğünce` · **LumiByte** (ortalı,
    kalın) · boş

### Kısıtlar

- **E-posta toplama YOK.** Bekleme listesi formu istenmedi; backend endpoint
  de yok. CTA yalnız platform rozetleri gösterir.
- **"Türkçe" / "Türkiye" ifadesi kullanılmaz.** Sayfa zaten Türkçe yayınlanıyor;
  bu bilgi gereksiz. Kayan şeritte `10 davetiye fontu`, CTA rozetinde
  `Reklamsız` kullanılır.
- **Open Graph etiketi yok** — davetiyedeki kural burada da geçerli.
- **Görsel varlıklar** `assets/` altından gelir (font + motif); raster
  şablon görseli üretilmez, önizlemeler HTML/CSS ile çizilir.

### Mobil uyum

Üç kırılım noktası: **1040px** (tablet), **620px** (telefon), **380px** (küçük).

| Öğe | Masaüstü | Mobil |
|---|---|---|
| Nav | 4 link + CTA | Hamburger menü |
| Şablon galerisi | 4 sütun ızgara | Yatay kaydırmalı (`scroll-snap`) |
| Hero yelpazesi | 410px | 280px → 240px |
| Telefon çerçevesi | 262px | 224px → 200px |
| Footer alt satırı | 3 sütun | Tek sütun, ortalı |

**Yatay taşma testi zorunlu:** `document.documentElement.scrollWidth ===
clientWidth` olmalı. Glow/daire dekorları `min(…, 92-96vw)` ile sınırlanır.

### Dikey ritim

Bölüm boşluğu **76px** (mobilde 52px). İlk taslakta 130px idi; sayfa 4968px'e
çıkıyordu. Sıkılaştırma sonrası masaüstü 4782px, mobil 5080px.

---

## 11. Yazı tipi kararı — webfont KULLANILIR (revize)

**Önceki karar** (cihaz serifi kabul edilir) **iptal edilmiştir.** Gerekçe:
onaylanan tasarımların taşıyıcısı el yazısı ve display serif fontlar; Android'de
bunların hiçbir karşılığı yok. Cihaz serifiyle bu tasarımlar inşa edilemezdi.

**Yeni karar:** Fontlar projede barındırılır (`frontend/public/assets/fonts/`),
`@font-face` ile `latin` + `latin-ext` alt kümeleri ayrı ayrı tanımlanır.

### Getirdiği kısıtlar

| Konu | Durum |
|---|---|
| Ek ağ isteği | **Var** — şablon başına 2-4 font dosyası (20-110 KB) |
| `font-display: swap` | Zorunlu — metin hemen görünür, font sonra gelir |
| Alt küme seçimi | Yalnız `latin` + `latin-ext`; `cyrillic`, `greek`, `vietnamese` **yüklenmez** |
| Toplam sayfa ağırlığı | Hedef 150 KB altı; en ağır şablon (BOTANIK) ~145 KB |
| Önbellek | `_headers`'a `Cache-Control: public, max-age=31536000, immutable` |

### Türkçe doğrulaması

10 fontun tamamı `latin` + `latin-ext` kapsamıyla `ş ğ İ ı ç ö ü Ş Ğ Ç Ö Ü`
karakterlerini içerir. **Doğrulama yöntemi:** her font gerçek tarayıcıda
`Şükrü Şule İğdır Çöğür` metniyle çizilip gözle kontrol edildi.

**Uyarı:** `unicode-range` bildirimi glifin dosyada var olduğunu **garanti
etmez**. Mrs Saint Delafield bu yüzden elendi (1.968 baytlık `latin-ext`,
`Ş` glifi yok). Yeni font eklenirken dosya boyutu kontrol edilmeli ve gerçek
render ile doğrulanmalı.

### Geri dönüş

Fontlar yüklenemezse `font-family` yığınındaki sistem serifine düşer; sayfa
bozulmaz, yalnız tipografi sadeleşir.

---

## 12. Şablon seçimi premium kapısına bağlı DEĞİL

Şablon seçimi **tüm düğünlerde açıktır** (FREE dahil). Gerekçe:

- Brief §7 ve `DUGUNCE_BRIEF_ANALIZ.md` premium kapsamını **davetli sayısı,
  yardımcı sayısı ve fotoğraflar** olarak tanımlıyor; şablonlar bu listede yok
- Davetiye sayfası *"her zaman ücretsiz — büyüme motoru"* (design spec satır 44).
  Şablonu ücretli yapmak, ürünün ana büyüme kanalını zayıflatır
- Şablonlar istemci tarafında sabit token setleri — marjinal maliyeti sıfır,
  kapıya bağlamak yapay bir sürtünme olur

Bu karar Aşama 2.5'te (satın alma) yeniden değerlendirilebilir; o zaman yeni
premium şablonlar ayrı bir set olarak eklenebilir, mevcut 11'i ücretsiz kalır.

**Font seçimi de ücretsizdir** — şablonla aynı gerekçe.

---

## 13. Testler

**Backend:**
- `PATCH /weddings/:id` geçerli şablonu ve fontu kaydeder
- Geçersiz şablon → 400
- Geçersiz font → 400
- `GET /invitations/:token` `template` + `fontKey` döner
- Boş/bozuk şablon → `ZARIF` (savunmacı)
- Boş/geçersiz font → şablonun önerilen fontu
- `PUBLIC_FIELDS` tam-anahtar testi güncellenir
- Yetkisiz kullanıcı `PATCH` edemez

**Mobil:**
- `TemplateScreen` navigasyon kapsamında
- 11 şablonun tamamı için anahtar ↔ etiket eşlemesi
- 10 fontun tamamı için anahtar ↔ etiket eşlemesi
- Bilinmeyen şablon → `ZARIF`, bilinmeyen font → önerilen font
- `DtoContractTest`: `template` + `fontKey` alanları

**Elle:**
- 11 şablonun tamamı mobil cihazda render
- Her font Türkçe karakterlerle doğru çiziliyor (`Şükrü Şule İğdır Çöğür`)
- Davetiye sayfası yüklenirken **hiç POST yok** (ağ sekmesi)
- WhatsApp önizlemesi çift/tarih sızdırmıyor
- Sayfa ağırlığı 150 KB altında (DevTools Network)
- Font yüklenemezse sayfa bozulmuyor (DevTools'ta font isteğini blokla)

---

## 14. Uygulama sırası

1. Migration: `template` + `font_key` sütunları
2. API: `PATCH` + `GET` alanları, `PUBLIC_FIELDS`, hata eşlemesi, testler
3. Varlık yerleşimi: `assets/` klasörü + `_headers` önbellek kuralı
4. Davetiye sayfası: editoryal DOM + 11 token seti + font yükleme
5. Mobil: `TemplateScreen` (şablon + font seçimi) + `Screen` enum + testler
6. Tanıtım sayfası

Her adım bağımsız doğrulanabilir.

---

## 15. Yapıcıya bırakılanlar

- `MINIMAL` şablonun tam tipografik ölçeği
- Migration dosya adının son eki (`drizzle-kit generate` üretir)
- Şablon önizlemelerinin mobilde tam çizimi (basit renk kutusu + tipografi
  örneği yeterli)
- **11 şablonun hangilerinin kalacağı** — ayrı bir karar turu; hepsi şimdilik
  korunuyor ve test kapsamında

---

## 16. Onaylanan tasarımlar

| Ne | Dosya | Durum |
|---|---|---|
| Tanıtım sayfası | `.superpowers/brainstorm/…/content/landing-v3.html` | ✅ onaylandı |
| 11 davetiye şablonu | `.superpowers/brainstorm/…/content/ornek-sablonlar.html` + `modern-sablonlar.html` | ✅ onaylandı |
| Font havuzu | `frontend/public/assets/fonts/` (10 font × 2 alt küme) | ✅ doğrulandı |
| Motifler | `frontend/public/assets/motifs/` (17 motif, WebP) | ✅ kesildi |

**Arşiv:** `landing-v1` ve `landing-v2` `.superpowers/brainstorm/…/content/`
altında duruyor; v3 seçildi.

---

## 17. Sonraki adım

Onay tamamlandı. `writing-plans` ile uygulama planı yazılır.
