# DNS ve Domain Kurulumu — dugunce.com.tr

> **Tek referans:** Tüm DNS/domain işlemleri burada. Yeni bir servis eklendiğinde (serv00, R2, Pages, e-posta) bu dosyaya eklenir.

**Domain:** `dugunce.com.tr`
**DNS sağlayıcı:** Cloudflare
**Domain durumu:** ✅ Alındı (2026-11-02)
**Cloudflare durumu:** ⏳ **Nameserver yayılımı bekleniyor** (2026-11-02 itibarıyla "Pending Nameserver Update")

> ⚠️ **Bu bekleme sırasında hiçbir DNS kaydı çalışmaz.** Brevo doğrulaması, Pages custom domain, serv00 CNAME — hepsi nameserver'lar aktif olduktan sonra yapılabilir.

---

## Alt alan adı planı

| Adres | Ne sunar | Nerede barındırılır | Durum |
|---|---|---|---|
| `dugunce.com.tr` | Tanıtım + davetiye sayfaları + yardımcı PWA | Cloudflare Pages | ⏳ |
| `www.dugunce.com.tr` | → root'a yönlendirme | Cloudflare Pages | ⏳ |
| `api.dugunce.com.tr` | Node.js API | serv00 | ⏳ |
| `admin.dugunce.com.tr` | Admin SPA (React) | Cloudflare Pages | ⏳ |
| `stage-api.dugunce.com.tr` | Staging API | serv00 | ⏳ |

**Posta kayıtları** (aşağıda §2): `noreply@`, `destek@`, `kvkk@` — ayrı mailbox gerekmez, Brevo üzerinden gönderilir.

---

## 0. Ön kontrol: Cloudflare aktif mi?

Cloudflare panelinde `dugunce.com.tr` yanında **"Active"** yazmalı.

**"Pending Nameserver Update"** yazıyorsa:
- Registrar panelinde nameserver'ları Cloudflare'in verdiği adreslere çevir
- Yayılım **24–48 saat** sürebilir (genelde 2-6 saat)
- Bu tamamlanmadan **hiçbir DNS kaydı çalışmaz**

### Yayılımı kontrol etme

```bash
# Cloudflare'in verdiği nameserver'lar görünüyor mu?
dig NS dugunce.com.tr +short
# Beklenen: xxx.ns.cloudflare.com ve yyy.ns.cloudflare.com

# Alternatif (daha detaylı)
whois dugunce.com.tr | grep -i "name server"
```

**Yorumlama:**

| Çıktı | Anlam |
|---|---|
| İki `*.ns.cloudflare.com` | ✅ Aktif — devam edebilirsin |
| Registrar'ın kendi NS'i | ⏳ Henüz yayılmadı — bekle |
| Boş / hata | ⏳ Propagasyon sürüyor |

### Beklerken ne yapılabilir

Nameserver yayılımı beklerken **DNS gerektirmeyen** işler yapılabilir:

| Yapılabilir | Yapılamaz |
|---|---|
| ✅ Aşama 2 kodu (auth, JWT, şema) | ❌ Brevo domain doğrulama |
| ✅ Yerel testler | ❌ Cloudflare Pages custom domain |
| ✅ serv00'ya SSH ile bağlanma | ❌ `api.dugunce.com.tr` CNAME |
| ✅ GitHub repo kurulumu | ❌ R2 custom domain |
| ✅ Kod yazma, migration | ❌ Canlı e-posta gönderimi |

> **Not:** Cloudflare'de **DNS kayıtlarını şimdi girebilirsin** — panelde görünür ve kaydedilir. Sadece nameserver aktif olana kadar **çalışmazlar**. Yani §2'deki kayıtları önceden girip hazır bekleyebilirsin.

---

## 1. Cloudflare'da DNS kaydı girme — genel kurallar

**Yol:** Cloudflare → `dugunce.com.tr` → **DNS** → **Records** → **Add record**

| Alan | Kural |
|---|---|
| **Type** | Kaydın türü (TXT, CNAME, A) |
| **Name** | **Sadece prefix** — `mail._domainkey` yaz, `mail._domainkey.dugunce.com.tr` yazma |
| **Name (root)** | `@` kullan |
| **Content** | Sağlayıcının verdiği değer — başında/sonunda boşluk olmasın |
| **TTL** | Auto |
| **Proxy** | TXT'de uygulanmaz. CNAME/A'da **DNS only** (gri bulut) — mail ve API kayıtları proxy'lenmez |

> **Altın kural:** Kayıt değerlerini kopyalarken baş/son boşluk en sık hatadır. Yapıştırdıktan sonra kontrol et.

---

> ⏳ **Ön koşul:** Cloudflare "Active" olmalı (§0). Değilse bu bölümdeki doğrulama başarısız olur.
> **Ama** Brevo'da domain ekleyip kayıtları kopyalayabilir ve Cloudflare'e girebilirsin — kayıtlar saklanır, nameserver aktif olunca çalışır.

## 2. Brevo — e-posta gönderimi

**Amaç:** `noreply@dugunce.com.tr` adresinden magic link ve davet e-postası göndermek.

### 2.1 Brevo'da domain ekle

1. Brevo → **Settings** → **Senders, Domains & Dedicated IPs**
2. **Domains** sekmesi → **+ Add a domain**
3. Domain name: `dugunce.com.tr`
   - ❌ `https://` yazma
   - ❌ `www.` yazma
   - ❌ Sonda `/` yok
4. **Continue**
5. Kayıt yöntemi: **Manual** (Cloudflare DNS kullanıldığı için Automatic çalışmaz)
6. **Continue**

### 2.2 4 kaydı kopyala

Ekranda 4 kayıt grubu çıkar. **Hepsini kopyala** — ekrandan ayrılırsan değerler bir daha gösterilmez.

| Kayıt | Type | Ne yapar |
|---|---|---|
| **Brevo code** | TXT | Domain sahipliğini kanıtlar |
| **DKIM 1** | TXT | E-posta imzası (2048-bit anahtarın 1. yarısı) |
| **DKIM 2** | TXT | E-posta imzası (2. yarısı) |
| **DMARC** | TXT | Sahtecilik politikası |

### 2.3 Cloudflare'a gir

Her kayıt için **Add record** → Type **TXT** → Name ve Content'i Brevo'dan kopyala.

**Örnek Name değerleri** (Brevo'nun verdiğiyle birebir aynı olmalı):

| Brevo'daki ad | Cloudflare Name |
|---|---|
| `dugunce.com.tr` veya `@` | `@` |
| `brevo-code` (veya benzeri) | `brevo-code` |
| `mail._domainkey` | `mail._domainkey` |
| `_dmarc` | `_dmarc` |

> Brevo DKIM için iki ayrı isim verebilir (ör. `brevo1._domainkey` ve `brevo2._domainkey`). **İkisini de ayrı kayıt olarak gir.**

### 2.4 Doğrula

1. Brevo'da **Verify records**
2. DNS yayılımı bekle: **5 dakika – 24 saat** (genelde ~10 dk)
3. **Authenticate domain**
4. Status **Authenticated** olana kadar kontrol et

**Terminalden kontrol:**

```bash
dig TXT dugunce.com.tr +short
dig TXT _dmarc.dugunce.com.tr +short
dig TXT mail._domainkey.dugunce.com.tr +short
```

Değerler görünüyorsa Brevo da görecek.

### 2.5 Gönderen adresi ekle

Domain **Authenticated** olduktan sonra:

Brevo → **Senders** → **Add sender**
- From Name: `Düğünce`
- From Email: `noreply@dugunce.com.tr`

Domain doğrulandığı için **6 haneli kod istemez.**

### 2.6 Sık yapılan hatalar

| Hata | Sonuç |
|---|---|
| DKIM kayıtlarından biri eksik | Doğrulama **geçmez** — anahtar ikiye bölünmüş |
| Kopyalarken boşluk kalması | Kayıt geçersiz |
| `www.` veya `https://` ile domain girmek | Brevo reddeder |
| Name alanına tam domain yazmak | Yanlış subdomain'e kayıt olur |
| DMARC'ı `p=reject` yapmak (erken) | Kendi maillerin de reddedilir |

### 2.7 DMARC politikası

Brevo `p=none` verir. **Değiştirme.**

```
v=DMARC1; p=none; rua=mailto:dmarc@dugunce.com.tr
```

- `p=none` → sadece raporla, engelleme yok
- 2-4 hafta gözlem sonrası `p=quarantine`, sonra `p=reject`
- Erken sıkılaştırma → SPF/DKIM tam doğru değilse **kendi mailin de gider**

---

## 3. Cloudflare Pages — web yüzeyleri

**Amaç:** Tanıtım sitesi, davetiye sayfaları, yardımcı PWA ve admin SPA'yı Cloudflare ağından sunmak.

### 3.1 Pages projesi oluştur

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub reposunu seç
3. Build ayarları:
   - Framework preset: **Vite** (veya None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Save and Deploy**

### 3.2 Custom domain bağla

Pages projesi → **Custom domains** → **Set up a custom domain**

| Proje | Domain |
|---|---|
| Tanıtım + davetiye | `dugunce.com.tr` |
| Admin SPA | `admin.dugunce.com.tr` |

Cloudflare, CNAME kaydını **otomatik** oluşturur — elle girmen gerekmez.

> **Not:** Root domain (`@`) için Cloudflare CNAME flattening kullanır, sorun çıkmaz.

### 3.3 www yönlendirmesi

Cloudflare → **Rules** → **Redirect Rules** → **Create rule**

- **When:** `http.host eq "www.dugunce.com.tr"`
- **Then:** Static redirect → `https://dugunce.com.tr`
- Status: `301`

Alternatif: Pages → Custom domains → `www.dugunce.com.tr` ekle, Cloudflare otomatik yönlendirir.

### 3.4 Pages ücretsiz plan sınırları

| Kaynak | Limit |
|---|---|
| Build | 500/ay, 1 eşzamanlı |
| Dosya | 20.000 |
| Dosya boyutu | 25 MiB |
| Custom domain | 100/proje |
| **Statik istek** | **Sınırsız, ücretsiz** |

---

## 4. serv00 — API

**Amaç:** `api.dugunce.com.tr` → serv00'daki Node.js uygulaması.

### 4.1 serv00'da domain ekle

1. serv00 paneli (DevilWEB) → **WWW Websites** → **Add website**
2. Domain: `api.dugunce.com.tr`
3. Website type: **Node.js**
4. Node.js binary: `node22`
5. **Add**

> serv00, domain'i kendi DNS'inde barındırmak isterse nameserver delegasyonu isteyebilir. **İstemiyoruz** — DNS Cloudflare'de kalacak.

### 4.2 Cloudflare'da CNAME ekle

Cloudflare → DNS → **Add record**

| Alan | Değer |
|---|---|
| Type | **CNAME** |
| Name | `api` |
| Target | serv00'ın verdiği hedef (ör. `sX.serv00.com`) |
| Proxy | **DNS only** (gri bulut) |

> **Neden gri bulut:** serv00 kendi SSL sertifikasını yönetiyor. Cloudflare proxy açık olursa SSL çakışması ve `devil www restart` sorunları çıkar. İleride Cloudflare proxy'ye geçilebilir ama önce çalışsın.

### 4.3 SSL

serv00 otomatik Let's Encrypt verir. `https://api.dugunce.com.tr/health` çalışıyorsa hazır.

### 4.4 Staging

Aynı adımlar `stage-api.dugunce.com.tr` için tekrarlanır (serv00'da ikinci website).

---

## 5. Cloudflare R2 — fotoğraflar

**Amaç:** Görev fotoğraflarını özel bucket'ta saklamak.

### 5.1 Bucket oluştur

1. Cloudflare → **R2** → **Create bucket**
2. Name: `dugunce-photos`
3. Location: **Automatic** (veya EU)
4. **Public access: KAPALI** (özel kalacak — SECURITY §1.4)

### 5.2 Custom domain (opsiyonel)

Fotoğraflar **presigned URL** ile sunulacak, public domain gerekmiyor. İleride CDN hızlandırma için `cdn.dugunce.com.tr` eklenebilir.

### 5.3 CORS

Presigned PUT için R2 bucket CORS ayarı:

```json
[{
  "AllowedOrigins": ["https://dugunce.com.tr"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

---

## 6. Doğrulama kontrol listesi

Her servis kurulduktan sonra:

```bash
# E-posta (Brevo doğrulaması sonrası)
dig TXT _dmarc.dugunce.com.tr +short
dig TXT mail._domainkey.dugunce.com.tr +short

# Web
curl -sI https://dugunce.com.tr | head -3
curl -sI https://admin.dugunce.com.tr | head -3

# API
curl -s https://api.dugunce.com.tr/health
# Beklenen: {"status":"ok","app":"dugunce-api"}

# DNS genel
dig dugunce.com.tr +short
dig api.dugunce.com.tr +short
```

| Kontrol | Beklenen |
|---|---|
| `dugunce.com.tr` | 200, HTTPS |
| `admin.dugunce.com.tr` | 200, HTTPS |
| `api.dugunce.com.tr/health` | `{"status":"ok","app":"dugunce-api"}` |
| `dig TXT _dmarc...` | `v=DMARC1; p=none; ...` |
| Brevo status | `Authenticated` |

---

## 7. Yapılmaması gerekenler

- ❌ DNS kaydı girerken Name alanına tam domain yazmak
- ❌ Mail/API kayıtlarında Cloudflare proxy açmak (turuncu bulut)
- ❌ DKIM kayıtlarından birini atlamak
- ❌ DMARC'ı erken `p=reject` yapmak
- ❌ Brevo domain eklerken `https://` veya `www.` yazmak
- ❌ R2 bucket'ı public yapmak (görev fotoğrafları kişisel veri)
- ❌ serv00'a nameserver delegasyonu vermek (DNS Cloudflare'de kalmalı)

---

## 8. Maliyet özeti

| Kalem | Maliyet |
|---|---|
| Domain `dugunce.com.tr` | Yıllık kayıt ücreti (alındı) |
| Cloudflare DNS | Ücretsiz |
| Cloudflare Pages | Ücretsiz (statik sınırsız) |
| Cloudflare R2 | 10 GB'a kadar ücretsiz |
| Brevo | 300 e-posta/gün ücretsiz |
| serv00 | Ücretsiz |

> Tek tekrarlayan gider: domain yenileme. Diğer her şey ücretsiz katmanlarda.
