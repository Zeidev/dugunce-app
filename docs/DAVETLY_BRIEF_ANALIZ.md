# DAVETLY_CLAUDE_BRIEF.md — Baştan Sona Analiz

**Analiz tarihi:** 2026-11-02
**Analiz edilen dosya:** `docs/DAVETLY_CLAUDE_BRIEF.md`
**Boyut:** 1.031 satır · 45.272 bayt
**SHA-256:** `ba0b2e55…6ebfe04` — orijinalle birebir aynı (doğrulandı)

---

## 1. Dosya nedir

Bir **proje ana dokümanı** — ürün tanımı, teknik mimari, iş kuralları, güvenlik gereksinimleri ve geliştirme rehberini tek dosyada topluyor. 20 bölüm.

Yapısı:

| Bölüm | İçerik |
|---|---|
| 1–3 | Ürün özeti, platformlar, marka/tasarım yönü |
| 4–5 | Roller, yetki matrisi, işlevsel gereksinimler |
| 6–7 | MVP kapsamı, iş modeli (kesinleşmedi olarak işaretli) |
| 8–10 | Teknik mimari, veritabanı şeması, API taslağı |
| 11–14 | Güvenlik, CI/CD, test, performans |
| 15–16 | Analitik, çalışma kuralları |
| 17–20 | Açık kararlar listesi, kaynaklar, kabul kriterleri, başlangıç talimatı |

**Ton:** temkinli. Sürekli "doğrula", "varsayma", "onay almadan yapma" diyor. Bu, iyi bir mühendislik refleksi.

**Hedef kitle:** Dosya açıkça "Claude Code"a hitap ediyor (§16, §20). Ama içerik araçtan bağımsız — herhangi bir kod ajanı için geçerli.

---

## 2. Kritik bulgu: dosya, bizim tasarım dokümanımızla çelişiyor

Bu bir "ek bilgi" dosyası değil. **Rakip bir spesifikasyon.** Üç noktada doğrudan zıt kararlar var:

| Konu | Bizim kararımız | Brief'in kararı | Durum |
|---|---|---|---|
| **Platform** | Android-only | Android **+ iOS** | ⚠️ ÇELİŞKİ |
| **UI teknolojisi** | Jetpack Compose (native Android) | KMP + Compose Multiplatform | ⚠️ ÇELİŞKİ |
| **Veri modeli** | **Local-first** (Room birincil) | **Server-first** (REST API) | ⚠️ ÇELİŞKİ |
| **Veritabanı** | MySQL | PostgreSQL | ⚠️ FARKLI |
| **Sohbet** | WebSocket (anlık) | Polling (WebSocket'e güvenme) | ⚠️ FARKLI |
| **Bildirim** | FCM push | Uygulama içi, push sonraki faz | ⚠️ FARKLI |
| **Premium** | v1'de var (10 davetli / 1 yardımcı) | v1'de ödeme duvarı **kurma** | ⚠️ ÇELİŞKİ |

**En önemlisi local-first.** Brief'te "offline", "çevrimdışı", "Room", "local-first" kelimeleri **hiç geçmiyor**. Bütün mimari "sunucuya sor" varsayımı üzerine kurulu. Bizim tasarımımızın merkezi kararı ise tam tersiydi.

Bu, çözülmesi gereken ilk çelişki — çünkü diğer her şeyi (senkron, çakışma, hata yönetimi, UX) etkiliyor.

---

## 3. Doğrulama: brief'in "doğrula" dedikleri

Brief §17'de 23 açık madde listeliyor. Resmî [serv00 dokümantasyonunu](https://docs.serv00.com/) okuyarak bunların bir kısmını **kapattım**:

### ✅ KAPANANLAR

**PostgreSQL gerçekten var** (§8.3, §17/1)
[pgsqlX.serv00.com](https://docs.serv00.com/PostgreSQL/) üzerinden erişilir. `devil pgsql db add NAME` ile oluşturulur, kullanıcı otomatik açılır. Uzantılar: `uuid-ossp`, `pgcrypto`, `pg_trgm`, `postgis`, `timescaledb`, `vector`. Ücretsiz plan **3 PostgreSQL veritabanı** hakkı veriyor.
→ Brief'in tercihi **uygulanabilir**. MySQL'e düşmeye gerek yok.

**Node.js çalışma dizini ve restart** (§17/2)
Uygulama dizini: `/usr/home/LOGIN/domains/DOMAIN/public_nodejs`. Restart: `devil www restart DOMAIN`. Node v16–v26 arası mevcut (varsayılan v22). Port dinlemeye zorlamak gerekmiyor — Phusion Passenger soketi kendi kuruyor.

**24 saat uyku davranışı** (§8.2) — **doğrulandı, kelimesi kelimesine:**
> "If there are no requests to the site for 24 hours, the application is automatically shut down and started again automatically on the first next visit."

→ Soğuk başlangıç gecikmesi **gerçek**. Brief haklı.

**Statik dosyalar Node'u yormuyor** (§8.1'deki web sayfası için kritik)
`public_nodejs/public` altındaki her şey nginx tarafından sunulur:
> "Requests to files in this directory will not be processed by Node.js processes and will not burden the interpreter."

→ **Bu, davetiye sayfası için önemli bir bulgu.** Misafir sayfasını `public/` altına koyarsak Node süreci hiç uyanmaz.

### ⚠️ KISMEN KAPANANLAR

**WebSocket** (§5.7, §17/14) — brief "test edilmeden bağımlı olma" diyor, haklı ama tam resim şu:

İki ayrı yol var:
1. **`nodejs` tipi sayfa** → Phusion Passenger. Passenger WebSocket'i güvenilir taşımaz.
2. **`proxy` tipi sayfa** → kendi daemon'ınız + rezerve port. Doküman açıkça diyor:
   > "The `proxy` page supports `websocket` to the application running at the target."

Yani WebSocket **mümkün**, ama ikinci yolu gerektiriyor: `devil binexec on` + `devil port add PORT TCP` + sürekli çalışan bir daemon.

**Sorun:** sürekli çalışan daemon'un ömrü garanti değil. Ücretsiz planda **15 sistem süreci** hakkı var, ve brief'in uyarısı yerinde — kalıcı süreç varsayımı riskli.

→ **Sonuç: brief haklı. MVP'de polling, WebSocket v1.1'de (test edildikten sonra).** Benim daha önceki "hibrit + WebSocket" önerimi bu noktada **düzeltiyorum**.

### ❌ HÂLÂ AÇIK

- Alan adı durumu (§17/4)
- SSH/SFTP deploy yetkileri (§17/3) — SSH var, SFTP var, ama gerçek hesapta test edilmeli
- 3 GB disk gerçekten yetiyor mu (§8.2)
- RAM 512 MB, süreç başına ne kadar?

---

## 4. Brief'in bizde olmayan güçlü yanları

Bunlar gerçek katkı. Tasarım dokümanımıza taşınmalı:

| # | Katkı | Neden önemli |
|---|---|---|
| 1 | **Güvenlik bölümü** (§11, 18 madde) | Bizde yoktu. Server-side authz, wedding isolation, IDOR/BOLA, rate limit, secret yönetimi |
| 2 | **Token'ı hash'leyerek sakla** (§9.1) | Ham token DB'de durmamalı. Bizde token modeli yoktu |
| 3 | **Taksit yuvarlama kuralı** (§5.3) | "Yuvarlama farkları son taksite eklenir, toplam tam eşitlenir." Para için kritik |
| 4 | **`NUMERIC(12,2)`, asla float** (§8.4) | Para hesabında float = hata |
| 5 | **Idempotent RSVP** (§5.6) | Aynı anda iki yanıt, sayfa yenileme — veri bozulmamalı |
| 6 | **Audit log** (§9.1) | Rol değişikliği, token iptali, finansal düzenleme izlenebilmeli |
| 7 | **"Gönderildi" işareti ≠ teslim edildi** (§5.5) | WhatsApp'ta teslim bilgisi yok; yanlış vaat vermemek |
| 8 | **Timezone / ay sonu testleri** (§5.3) | Taksit ayları ay sonunda kayabilir |
| 9 | **KVKK bölümü** (§11 sonu) | Türkiye'de kişisel veri — bizde hiç yoktu |
| 10 | **"15–20 çiftle doğrula"** (§15) | Ürün doğrulaması, kod yazmadan önce |

---

## 5. Brief'in eksikleri

| # | Eksik | Sonuç |
|---|---|---|
| 1 | **Çevrimdışı / local-first yok** | Düğün salonunda sinyal yokken uygulama ölür |
| 2 | **`wedding.plan` / satın alma alanı yok** | Düğün bazlı premium modeli şemada karşılıksız |
| 3 | **Yardımcı davet akışı belirsiz** | "E-posta/telefon veya davet bağlantısı" — karar yok. SMS = ücretli |
| 4 | **Misafir sayfası verisi sunucudan** | Bizim "veriyi URL'e göm" fikri yok → her sayfa açılışı istek |
| 5 | **Yedekleme stratejisi zayıf** | "7 gün sağlayıcı yedeği" + "kendi yedeğini al" — nasıl, nereye? |
| 6 | **MVP 16 madde** | Tek geliştirici, yerel derleme yok → çok büyük |
| 7 | **Disk hesabı yok** | 3 GB'ın yetip yetmediği hiç hesaplanmamış |
| 8 | **`plus_one_count` belirsiz** | "Ürün kararı" denmiş, karar verilmemiş |

---

## 6. Brief içi tutarsızlıklar

1. **§2.1 iOS hedefliyor, ama §2.2 Apple Developer hesabı gerektiğini söylüyor.** Kullanıcının sert kısıtı "hiç para çıkmayacak". iOS yılda $99 — bu çelişki brief'te çözülmemiş.
2. **§7 "ödeme duvarı kurma" diyor, ama §4.4 yetki matrisi ve §6.1 MVP premium'a hiç değinmiyor.** Gelir modeli tamamen ertelenmiş — ürün "para kazanacak" hedefiyle çelişiyor.
3. **§16.4 backend-first sıralama öneriyor** (önce backend + DB, sonra auth, sonra harcama…, mobil en son). Bu, aylarca görünür bir uygulama olmadan çalışmak demek. Motivasyon riski.

---

## 7. Karar gereken noktalar

Brief ile bizim dokümanımız arasında **7 çelişki** var. Her biri için önerim:

| # | Çelişki | Önerim | Gerekçe |
|---|---|---|---|
| 1 | Android-only ↔ Android+iOS | **Android-only ile başla**, KMP'ye geçiş yolu açık tutulsun | iOS = $99/yıl, sert kısıta aykırı |
| 2 | Compose ↔ KMP+CMP | **Jetpack Compose**, veri katmanı platformdan bağımsız | KMP bugün karmaşıklık vergisi; yarın taşınabilir |
| 3 | Local-first ↔ Server-first | **Local-first** | 100k istek/gün kısıtı + sinyalsiz mekân gerçeği |
| 4 | MySQL ↔ PostgreSQL | **PostgreSQL** | serv00'da doğrulandı, ilişkisel model daha güçlü |
| 5 | WebSocket ↔ Polling | **Polling** (v1), WebSocket v1.1 | Brief haklı; daemon ömrü garanti değil |
| 6 | FCM ↔ uygulama içi | **FCM** (ücretsiz, kritik) | Bildirimsiz görev uygulaması "unutmama" vaadini tutamaz |
| 7 | Premium v1'de ↔ sonra | **Limitler kodda var, ödeme duvarı sonra** | Brief'in bu noktası doğru: önce ürün çalışsın |

---

## 8. Öneri: nasıl birleştirilir

İki doküman **çakışan** değil, **tamamlayan** hale getirilebilir:

- **Brief** = ürün ve güvenlik anayasası (roller, yetki, veri modeli, API, güvenlik)
- **Tasarım dokümanı** = mimari kararlar (local-first, senkron, ücretsiz altyapı, premium modeli)

Birleştirme sırası:

1. Brief'teki güvenlik + taksit + token + KVKK bölümlerini tasarım dokümanına taşı
2. Tasarım dokümanındaki local-first + premium + Android-only kararlarını brief'e işle
3. 7 çelişkiyi tek tek kapat (yukarıdaki tablo)
4. Ortaya çıkan tek doküman `docs/PRODUCT_SPEC.md` olsun
5. Sonra plana geç

---

## 9. Özet yargı

**Brief iyi bir doküman.** Güvenlik disiplini, para hassasiyeti ve "doğrulanmamış varsayıma yaslanma" refleksi bizim dokümanda eksikti. Özellikle **taksit yuvarlama**, **token hash**, **idempotent RSVP** ve **KVKK** maddeleri gerçek boşlukları kapatıyor.

**Ama üç yerde yanlış:** local-first'ün tamamen yokluğu, iOS'u hedef sayması (maliyet kısıtıyla çelişki) ve MVP'nin tek geliştirici için aşırı genişliği.

**Ve bir yerde bizden daha doğru:** WebSocket'e güvenmemek. Ben "gerçek WebSocket var, o yüzden serv00 Cloudflare'den iyi" demiştim. Dokümanı okuyunca gördüm ki bu ancak `proxy` tipi + sürekli daemon ile mümkün — ve o da garanti değil. **Polling ile başlamak doğru.**

**Sonuç:** Brief ana omurga olabilir; ama önce 7 çelişki kapatılmalı. Kapatılmadan plan yazılırsa, iki farklı mimariyi aynı anda uygulamaya çalışırız.
