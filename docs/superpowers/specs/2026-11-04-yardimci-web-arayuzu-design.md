# Yardımcı Web Arayüzü — Mobil Uygulama Deneyimi

**Tarih:** 2026-11-04
**Durum:** Onaylandı (yaklaşım B)
**Dosya:** `frontend/public/h/index.html` (tek dosya, build yok)

---

## 1. Amaç ve gerekçe

Yardımcı sayfası (`/h#<token>`) çiftin görevlerini gören, durum güncelleyen ve
çiftle mesajlaşan kişinin kullandığı arayüz. Uygulama kurmaz, hesap açmaz —
linke tıklar, işini yapar.

**Bugünkü durum:** İşlevsel ama bir *belge* gibi davranıyor. Üç beyaz kart,
sistem fontu, tek sütun. Landing sayfasıyla (`/`) hiçbir görsel akrabalığı yok.
Sohbet açıldığında tüm liste aşağı itiliyor; durum değiştirmek sayfayı
zıplatıyor.

**Hedef:** Telefonda açılan, gerçek bir mobil uygulama gibi hissettiren;
marka diliyle akraba; mevcut davranışı bozmayan bir arayüz.

**Neden şimdi:** Yardımcı, çiftin düğün hazırlığındaki en sık temas noktası.
Sayfa "çalışıyor" ama kullanması yorucu.

---

## 2. Hedefler / Hedef olmayanlar

**Hedefler**
- Telefonda tek elle, kaydırmadan kullanılabilir.
- Landing ile aynı görsel dil (Playfair + Josefin, krem/altın/sage).
- Görev detayı ve sohbet, listeyi bozmadan açılsın.
- Mevcut tüm işlevler korunsun: durum değiştirme, mesajlaşma, canlı
  güncelleme, oturum kalıcılığı, CSRF.
- Tek dosya kalsın — build adımı yok, CDN yok.

**Hedef olmayanlar**
- Masaüstü iki panel düzeni (telefon öncelikli; masaüstünde ortalanmış
  tek sütun yeterli).
- Yeni backend uçları veya veri modeli değişikliği.
- Görev oluşturma/silme (yardımcının yetkisi yok — yalnız durum).
- Karanlık tema (bu turda değil; `prefers-color-scheme` ileride).

**Anti-hedefler** (teknik olarak çalışsa bile başarısız sayılır)
- Sayfa yüklenirken yazma isteği atan bir akış (WhatsApp önizleme botu
  otomatik RSVP/gönderim tetikler — `invitation-no-side-effect` kuralı).
- Token'ın URL'de kalması (fragment dışına çıkması).
- `innerHTML` ile kullanıcı verisi basmak (XSS).
- Çalışmayan buton göstermek ("bastım, bir şey olmadı" — projede üç kez
  yaşandı).

---

## 3. Kısıtlar

- **Tek dosya:** `index.html` içinde `<style>` + `<script type="module">`.
  Harici CSS/JS dosyası yok. Fontlar `/assets/fonts/*.woff2` üzerinden.
- **Bağımlılık yok:** framework, CDN, build aracı yok. Vanilla JS.
- **API sabit:** `https://api.dugunce.com.tr/api/v1` (mevcut).
- **Güvenlik:** token `#fragment`'te; `GET` yan etki yaratmaz; CSRF
  `sessionStorage`'da; `credentials: 'include'`.
- **Erişilebilirlik:** WCAG AA (gövde ≥ 4.5:1), dokunma hedefi ≥ 44px,
  `prefers-reduced-motion` desteği, klavye ile kullanılabilir.
- **Tarayıcı:** iOS Safari 15+, Android Chrome 100+ (mevcut hedef kitle).

---

## 4. Yaklaşımlar

### A) Marka hizalaması + cila
Landing paleti ve fontları uygulanır, kartlar rafine edilir. Yapı aynı kalır.

- **Artı:** En düşük risk; "bozmadan" isteğine birebir uyar.
- **Eksi:** Yalnız makyaj. Sohbet açılınca sayfa hâlâ zıplıyor, durum
  değiştirmek hâlâ listeyi yeniden çiziyor.

### B) Mobil uygulama deneyimi ✅ *(seçilen)*
A'nın görsel dili + uygulama davranışı: sabit başlık, sayaçlı filtre
sekmeleri, alttan açılan görev sayfası, ayrı sohbet ekranı.

- **Artı:** Telefonda gerçekten iyi. Liste kaydırma konumunu korur; durum
  değişimi sayfayı zıplatlamaz. Landing ile akraba.
- **Eksi:** Daha büyük değişiklik; dikkatli test gerekir.

### C) Sohbet odaklı
Ana ekran mesajlaşma; görevler ikincil sekme.

- **Artı:** Yardımcının "ne yapacağım" sorusuna doğrudan cevap.
- **Eksi:** Sayfanın asıl işi görev takibi zayıflar; durum güncellemek
  gizlenir. Reddedildi.

**Karar:** B. Telefonda açılacak bir sayfa için doğru denge; A yetersiz,
C işlevi gölgeler.

---

## 5. Tasarım

### 5.1 Görsel dil (landing ile aynı)

```
--cream:#f4f2ee      --surface:#fff        --surface-alt:#faf8f4
--ink:#2d3a2e        --muted:#7a746a       --line:#e6e1d8
--sage:#4a5f45       --sage-deep:#3b4c37   --sage-soft:#eef2ec
--gold:#a8925f       --gold-soft:#f0ece0
--danger:#a35b4a     --doing:#b8863b
```

- **Başlık:** Playfair Display (serif) — landing ile aynı.
- **Gövde:** Josefin Sans — landing ile aynı.
- Her ikisi de `/assets/fonts/` altında `latin` + `latin-ext` olarak mevcut
  (Türkçe karakterler kapsanıyor — GESCE dersinden sonra doğrulandı).

### 5.2 Yapı

```
┌─────────────────────────────┐
│  DÜĞÜNCE · GÖREVLERİM       │  ← sabit üst başlık
│  Merhaba Fatma              │     (kaydırınca daralır)
│  Ayşe & Mehmet düğünü       │
├─────────────────────────────┤
│ [Tümü 5] [Yapılacak 3] ...  │  ← yapışkan filtre sekmeleri
├─────────────────────────────┤
│  ▢ Salon rezervasyonu       │  ← görev kartları
│    Yapılıyor · 15 Ağustos   │     (dokun → alttan sayfa)
│  ─────────────────────────  │
│  ▢ Çiçek siparişi ver       │
│    Yapılacak · 1 Eylül      │
└─────────────────────────────┘
```

**Görev sayfası (alttan açılır):**
```
┌─────────────────────────────┐
│         ═══                 │  ← tutamak
│  Salon rezervasyonunu onayla│
│  ─────────────────────────  │
│  Durum                      │
│  [Yapılacak][Yapılıyor][Bitti]  ← büyük, tek elle
│  ─────────────────────────  │
│  Açıklama                   │
│  Otel ile görüşüp kapora…   │
│  ─────────────────────────  │
│  💬 Mesajlar (2)      →     │  ← ayrı ekrana gider
└─────────────────────────────┘
```

**Sohbet ekranı (tam ekran):** Başlıkta görev adı + geri oku. Mesajlar
arasında kaydırma; altta sabit giriş alanı (klavye açılınca yukarı kayar).

### 5.3 Davranış

| Durum | Davranış |
|---|---|
| Liste kaydırma | Konum korunur; durum değişince liste yeniden çizilmez, kart yerinde güncellenir |
| Durum değiştirme | Kart üzerinde iyimser güncelleme; hata olursa geri alınır + toast |
| Görev sayfası | Alttan yukarı animasyon; arka plana dokun veya aşağı çek → kapanır |
| Sohbet | Ayrı ekran; geri oku listeye döner (kaydırma korunur) |
| Canlı güncelleme | 15 sn polling (mevcut); yeni mesaj varsa sohbette belirir |
| Sekme gizlenince | Polling durur (mevcut) |
| Bağlantı geçersiz | Tam ekran hata durumu, landing dilinde |

### 5.4 Erişilebilirlik

- Durum butonları `aria-pressed`, görev kartı `role="button"` + `tabindex="0"`
  ve `Enter`/`Space` desteği.
- Görev sayfası `role="dialog"` + `aria-modal="true"`; açılınca odak içine
  girer, `Escape` kapatır, kapanınca odak tetikleyiciye döner.
- Sayaçlar `aria-label` ile okunur ("3 yapılacak görev").
- Renk tek başına anlam taşımaz — durum her zaman yazıyla da yazar.

---

## 6. Uygulama planı (özet)

1. **Görsel katman:** renk değişkenleri, font `@font-face`, tipografi ölçeği.
2. **Kabuk:** sabit başlık + yapışkan filtre sekmeleri + liste.
3. **Görev kartı:** durum rozeti, son tarih, dokunma hedefi.
4. **Görev sayfası:** alttan açılan panel, durum seçici, açıklama.
5. **Sohbet ekranı:** tam ekran, sabit giriş, otomatik kaydırma.
6. **Durum yönetimi:** iyimser güncelleme + geri alma; kaydırma korunur.
7. **Hata/boş/yükleniyor** durumları yeni dilde.
8. **Doğrulama:** gerçek backend'e karşı (PGlite) tarayıcıda uçtan uca.

Her adım mevcut işlevi bozmadan ilerler; sayfa her adımda çalışır kalır.

---

## 7. Doğrulama

- **İşlev:** token → oturum → liste; durum değiştir; mesaj gönder/al;
  sayfa yenile (oturum korunur); polling yeni mesajı getirir.
- **Güvenlik:** sayfa yüklenirken yalnız `GET`; token `#fragment`'te kalır;
  `innerHTML` ile veri basılmaz.
- **Erişilebilirlik:** kontrast ölçümü (AA), klavye ile tam tur,
  `prefers-reduced-motion` açıkken animasyonsuz.
- **Cihaz:** 390×844 (iPhone 14), 360×800 (Android), 320×568 (küçük).
- **Regresyon:** `frontend/public` için mevcut kontroller; mobil CI etkilenmez.

---

## 8. Açık kalanlar (uygulama sırasında)

- Karanlık tema bu turda yok; değişkenler hazır olduğu için sonradan eklenebilir.
- Sohbette "yazıyor…" göstergesi backend desteklemiyor — yok.
- Görev sayfasında fotoğraf/ek dosya yok (backend'de yok).
