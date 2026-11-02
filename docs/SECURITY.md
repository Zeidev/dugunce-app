# Davetly — Güvenlik ve Mimari Denetimi

**Durum:** Bağlayıcı güvenlik spesifikasyonu
**Tarih:** 2026-11-02
**Kapsam:** Tüm platform (backend, mobil, web, admin, altyapı)

> Bu belge **normatiftir**. Tasarım dokümanı (`docs/superpowers/specs/2026-11-01-davetly-design.md`) ile çelişirse **bu belge geçerlidir**.
> Hiçbir modül, bu belgedeki ilgili güvenlik kuralları uygulanmadan "tamam" sayılmaz.

---

## 0. Temel ilke

**Davetly'nin en büyük teknik riski teknoloji seçimi değildir.** Yanlış kişiye yanlış düğünün verisini göstermek veya bir yardımcıya gereğinden fazla yetki vermektir.

İlk çalışan sürümün başarı ölçütü güzel ekranlar değil, **doğru yetkilendirme ve veri izolasyonudur.**

**Kimlik doğrulama ≠ yetkilendirme.** Giriş yapmış olmak, URL'deki herhangi bir kaynağa erişme hakkı vermez.

---

## 1. Kritik riskler (P0)

### 1.1 Düğünler arası veri sızıntısı

**Risk:** Bir kullanıcı başka düğünün `wedding_id`, `task_id`, `guest_id` veya `expense_id` değeriyle veri okumaya/değiştirmeye çalışabilir.

**Eksik önlem:** Her sorguya `wedding_id` eklemek **yeterli değil**. İlişkili kayıtların da aynı düğüne ait olduğu veritabanı seviyesinde garanti edilmeli.

**Zorunlu uygulama:**

| # | Kural |
|---|---|
| 1 | İlişkili tablolarda **bileşik foreign key** kullan — `(task_id, wedding_id)` → `tasks(id, wedding_id)` |
| 2 | Her API işleminde kullanıcının üyeliğini **ve** kaynağa erişim yetkisini doğrula |
| 3 | IDOR/BOLA testlerini **tüm kaynak türlerinde** uygula |
| 4 | Düğünler arası ID değiştirerek erişim denemelerini otomatikleştir |

**Uygulama deseni:**
```sql
-- Her wedding-scoped tablo, composite unique key taşır
ALTER TABLE tasks ADD CONSTRAINT uq_tasks_wedding UNIQUE (id, wedding_id);

-- Alt tablolar composite FK ile bağlanır
ALTER TABLE task_messages
  ADD CONSTRAINT fk_messages_task
  FOREIGN KEY (task_id, wedding_id)
  REFERENCES tasks (id, wedding_id)
  ON DELETE CASCADE;
```
→ Böylece yanlış `wedding_id` ile mesaj yazmak **veritabanı tarafından reddedilir**, uygulama hatası olsa bile.

---

### 1.2 Yardımcı WhatsApp bağlantısı

**Risk:** Yardımcı uygulama indirmiyor; bağlantının kendisi erişim anahtarı oluyor.

**Zorunlu uygulama:**

| # | Kural |
|---|---|
| 1 | Her yardımcıya **ayrı**, yüksek entropili (min 128 bit), tahmin edilemez token |
| 2 | DB'de **ham token değil hash** sakla |
| 3 | Kabul, süre sonu, yenileme, iptal akışları tanımlı olsun |
| 4 | Token doğrulandıktan sonra **kısa ömürlü, iptal edilebilir oturum** oluştur |
| 5 | Yardımcı yalnızca **atanmış görevlere** ve o görevlerin mesajlarına erişsin |
| 6 | Atama kaldırıldığında erişim **anında** kesilsin |

**Token yaşam döngüsü:**
```
oluştur → hash'le sakla → link gönder
   ↓
kullanım → hash karşılaştır → kısa ömürlü session cookie
   ↓
iptal / süre sonu / düğün bitişi → session geçersiz + token revoke
```

**Düğün üyeliği ≠ görev ataması.** Yardımcının düğüne üye olması, tüm görevlere erişmesi anlamına **gelmez**. Üç ayrı kontrol:
1. Düğün üyeliği
2. Görev ataması
3. Görev mesajı erişimi

---

### 1.3 Admin hesabının ele geçirilmesi

**Risk:** Tek yönetici hesabı tüm platformu etkiler.

**Zorunlu uygulama:**

| # | Kural |
|---|---|
| 1 | Parola + **TOTP 2FA zorunlu** |
| 2 | 2FA tamamlanmadan **hiçbir admin API verisi dönmez** |
| 3 | Oturumlar sunucu tarafında tutulur, **tek tek iptal edilebilir** |
| 4 | Admin girişinde **hız sınırlaması** + şüpheli giriş takibi |
| 5 | Kurtarma kodları (hash'li, tek kullanım) + güvenli kurtarma prosedürü |
| 6 | Kritik işlemlerde **yeniden kimlik doğrulama** |
| 7 | Admin'in hassas veriye erişimi **ayrıca kaydedilir** |

**TOTP secret şifreli saklanır.** Uygulama anahtarı ayrı bir secret'ta tutulur (env, DB'de değil).

---

### 1.4 Fotoğraf yükleme ve erişim

**Risk:** Görev kanıt fotoğrafları özel içerik; yanlış kişiye görünmemeli.

**Zorunlu uygulama:**

| # | Kural |
|---|---|
| 1 | R2 bucket **kesinlikle public olmamalı** |
| 2 | Yükleme URL'si **kısa ömürlü** ve **tek nesneye özel** |
| 3 | Yükleme öncesi kullanıcı + görev ataması + **kota** kontrolü |
| 4 | Dosyanın **gerçek türü**, boyutu ve **görüntü olarak çözümlenebilirliği** doğrulanır |
| 5 | **EXIF temizlenir** (özellikle GPS konumu) |
| 6 | İndirme URL'si de kısa ömürlü |
| 7 | İptal edilen yardımcı, **daha önce yüklediği fotoğraflara da** erişemez |

**Kabul edilen türler:** JPEG, PNG, WebP. **SVG ve çalıştırılabilir dosya reddedilir.**

**Yükleme akışı (4 adım, hepsi doğrulanır):**
```
1. POST /photos/presign  → yetki + kota kontrolü → kısa ömürlü PUT URL
2. PUT (doğrudan R2'ye)  → istemci sıkıştırır, uzun kenar 1600px
3. POST /photos/confirm  → sunucu dosyayı R2'den okur, MIME+boyut+decode doğrular
4. DB kaydı yazılır      → yalnızca burada "fotoğraf var" sayılır
```
→ Yarım kalan yükleme DB'de **tamamlanmış fotoğraf olarak görünmez**.

---

### 1.5 Yedekleme ve geri yükleme

**Risk:** "Yedek alıyoruz" demek, verinin kurtarılabileceği anlamına gelmez.

**Zorunlu uygulama:**

| # | Kural |
|---|---|
| 1 | Otomatik, **şifreli**, **bağımsız konumda** DB yedeği |
| 2 | Yedeklere erişim **ayrı secret ve hesapla** sınırlı |
| 3 | **Periyodik geri yükleme testi** (sadece yedek almak yetmez) |
| 4 | Fotoğraf ve DB yedekleme politikaları **ayrı** tanımlı |
| 5 | Saklama süresi ve silme politikası belirli |

**serv00 sağlayıcı yedeği (7 gün) tek başına yeterli değildir.** Kendi yedeğimiz zorunlu.

---

## 2. Güvenlik katmanları (P1)

| Alan | Risk | Gerekli önlem |
|---|---|---|
| **Oturum yönetimi** | Çalınan/eski oturumun kullanımı | Refresh token rotasyonu, oturum iptali, süre sınırı |
| **Parola sıfırlama** | Hesap ele geçirme | Tek kullanımlık, süreli, **hash'li** token |
| **E-posta doğrulama** | Sahte hesap | Doğrulama akışı + e-posta değişiminde yeniden doğrulama |
| **API güvenliği** | Aşırı istek, kaynak tüketimi | Login, RSVP, mesaj, arama, yükleme için **ayrı** rate limit |
| **Web güvenliği** | XSS, CSRF, clickjacking | CSP, CSRF koruması, güvenlik header'ları |
| **CORS** | API'nin kötüye kullanımı | `*` yerine **açık origin listesi** |
| **Loglama** | Token/PII sızıntısı | Maskeleme, redaksiyon, erişim kısıtı |
| **Veritabanı** | Hatalı sorgu, yetki aşımı | Parametreli sorgu, kısıtlar, **en az ayrıcalıklı DB hesabı** |
| **Bağımlılıklar** | Kütüphane açığı | Kilit dosyası, güvenlik taraması, kontrollü güncelleme |
| **Admin işlemleri** | Yanlışlıkla veri silme | Gerekçe + audit + kritik işlemde tekrar doğrulama |

---

## 3. Web, mobil ve Cloudflare katmanı

### 3.1 Cloudflare

- Proxy **tek başına API yetkilendirmesi değildir**
- Özel API cevapları **CDN cache'e girmemeli** (`Cache-Control: no-store` — auth/admin/RSVP yanıtları)
- Yalnızca statik asset cache'lenir

### 3.2 Mobil cihaz

- Oturum token'ları **Android Keystore / iOS Keychain**'de saklanır
- Normal uygulama tercihlerinde düz metin **yasak**
- Çıkış yapıldığında yerel özel veriler temizlenir

### 3.3 R2

- Uzantıya **güvenilmez** — gerçek içerik doğrulanır
- Görüntü yeniden işlenir, **EXIF temizlenir**, boyut sınırı uygulanır
- İzinli türler: JPEG, PNG, WebP

### 3.4 Zorunlu header'lar

| Header | Değer / Kural |
|---|---|
| `Content-Security-Policy` | Misafir sayfası + admin SPA için tanımlı |
| `Strict-Transport-Security` | HTTPS zorunlu; alt alan adlarında dikkatli |
| `Referrer-Policy` | `no-referrer` — davetiye token'ı başka siteye gitmesin |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` (admin), `SAMEORIGIN` (diğer) |
| `Permissions-Policy` | Gereksiz izinler kapalı |

### 3.5 Diğer web kuralları

- **CSRF:** Cookie tabanlı oturumlarda zorunlu
- **CORS:** `*` yasak, açık origin listesi
- **URL logları:** Davetiye/yardımcı token'ları proxy, uygulama, hata ve analitik loglarında **maskelenir**
- **Arama motorları:** Özel davetiye sayfaları `noindex` — ama `noindex` **erişim güvenliği değildir**
- **WhatsApp önizlemesi:** Link preview botlarının GET isteği RSVP'yi **değiştirmemeli**. RSVP yalnızca açık **POST** ile gerçekleşir

---

## 4. Admin paneli riskleri

Admin SPA Cloudflare Pages'te olması güvenlik sorumluluğunu kaldırmaz.

| # | Kural |
|---|---|
| 1 | Admin API'leri normal kullanıcı API'lerinden **ayrı** yetki kontrolünden geçer |
| 2 | Admin oturumu, normal kullanıcı oturumundan **bağımsız** |
| 3 | TOTP secret **şifreli**; kurtarma kodları **hash'li** |
| 4 | Menü gizlemek yetmez — **her endpoint** izin kontrolü yapar |
| 5 | Askıya alma, veri silme, rol değiştirme → **audit log** |
| 6 | Audit log'lar normal admin işlemleriyle **değiştirilemez/silinemez** |
| 7 | Özel içeriğe erişim gerekiyorsa **gerekçe + süre + kayıt** |
| 8 | İlk admin **tek seferlik kontrollü** provisioning |
| 9 | Admin hesabı kaybı için **güvenli kurtarma prosedürü** önceden hazır |

**Cloudflare Access** opsiyonel ek katman olabilir — **tek güvenlik mekanizması olamaz**. API'nin kendi admin auth'u zorunlu.

---

## 5. Serv00 ve operasyon riskleri

| Risk | Etki | Önlem |
|---|---|---|
| Node uygulamasının uykuya geçmesi | İlk istekte gecikme | Soğuk başlangıç testi + kullanıcıya yüklenme durumu |
| Paylaşımlı kaynak limitleri | Yoğunlukta yavaşlama | Sayfalama, sorgu optimizasyonu, yük testi |
| Veritabanı erişim sorunu | Ana işlevler durur | Kontrollü hata, yedek, geri yükleme planı |
| Sürekli worker desteği yok | Zamanlanmış işler aksar | v1'de sürekli worker gerektirmeyen tasarım |
| WebSocket sürekliliği | Sohbet kopabilir | REST polling |
| Deploy hatası | Uygulama çalışmaz | Yedek, migration planı, geri dönüş prosedürü |
| R2 erişim sorunu | Fotoğraf görüntülenemez | Yeniden deneme + hata takibi |

> **UptimeRobot `/health` pingi, serv00'nin tüm uyku/kaynak politikalarını garanti biçimde aşacağımız anlamına gelmez.** Bu bir **mimari garanti değil**, azaltıcı önlemdir.

**serv00 tek kritik altyapı noktası olmamalı.** Backend taşınabilir yazılır (standart Node + PostgreSQL, serv00'ye özgü hiçbir şey).

---

## 6. KVKK ve kullanıcı gizliliği

Davetly isim, telefon, davetli listesi, katılım durumu, görev konuşmaları ve fotoğraflar gibi kişisel verileri işler.

### 6.1 Yayın öncesi netleşmesi gerekenler

- Hangi veri, hangi amaçla toplanıyor?
- Her veri ne kadar saklanıyor?
- Kullanıcı hesabını/düğününü silerse ne olur?
- Düğün sahibi davetli verilerini ne zaman silebiliyor?
- Fotoğraf ve sohbetler düğün bittikten sonra ne kadar tutuluyor?
- Kullanıcı verisini dışa aktarabiliyor mu?
- Yedeklerde silinmiş veri ne zaman temizleniyor?
- Veri hangi sağlayıcılarla paylaşılıyor?
- Yurt dışına aktarım var mı? (serv00 = AB/Polonya, Cloudflare = global)

### 6.2 Değişmez kurallar

- Aydınlatma metni **tek başına yeterli değil** — uygulamanın davranışı metinle **uyumlu** olmalı
- Yayın öncesi **uzman hukuki değerlendirme** alınır
- Admin panelinde çiftlerin bütçesi, görev mesajları ve fotoğrafları **varsayılan olarak görünmez**
- Destek için özel içeriğe erişim: **gerekçeli, süreli, denetlenebilir**

### 6.3 Önerilen saklama politikası (karar bekliyor)

| Veri | Öneri |
|---|---|
| Düğün verisi (aktif) | Düğün tarihi + 90 gün |
| Görev fotoğrafları | Düğün tarihi + 90 gün |
| Görev sohbeti | Düğün tarihi + 90 gün |
| Silinen hesap | 30 gün içinde kalıcı silinir (yedeklerde 90 gün) |
| Audit log | 2 yıl |

---

## 7. Geliştirme sırası (güvenlik öncelikli)

**Doğrudan ekran kodlamaya başlanmaz.** Önce güvenli temel kurulur.

### Aşama 1 — Güvenli altyapı
- Repo ve ortam yapılandırması
- PostgreSQL bağlantı testi
- **Migration sistemi**
- Merkezi hata yönetimi
- **Güvenli loglama** (maskeleme altyapısı)
- `/health` endpoint
- **Yedekleme ve geri yükleme denemesi**

### Aşama 2 — Kimlik ve yetkilendirme
- Kullanıcı kayıt/giriş (magic link)
- E-posta doğrulama, parola sıfırlama (admin)
- Oturum yönetimi
- Düğün üyelikleri
- Çift ve yardımcı izinleri
- **Tenant izolasyonu testleri**

### Aşama 3 — Bütçe ve taksit
- Harcama kayıtları
- **Decimal para hesaplamaları**
- Taksit planları
- Transaction ve tutarlılık testleri

### Aşama 4 — Davetli ve RSVP
- Davetli veri modeli
- Güvenli davetiye token'ları
- Public web davetiyesi
- RSVP ve tekrar istek kontrolleri
- WhatsApp paylaşımı

### Aşama 5 — Yardımcı ve görevler
- Yardımcı web erişim sistemi
- Erişim daveti ve iptali
- Görev atama
- Görev bazlı mesajlaşma
- **Yetki izolasyonu testleri**

### Aşama 6 — Görev fotoğrafları
- R2 private bucket
- Kota ve yükleme izinleri
- Presigned URL
- **Görüntü doğrulama ve metadata temizliği**
- Erişim ve silme testleri

### Aşama 7 — Admin ve mobil
- Admin SPA ve 2FA
- Admin audit kayıtları
- KMP mobil uygulama
- GitHub Actions
- TestFlight / Android test dağıtımı

### Aşama 8 — Yayın öncesi güvenlik denetimi
- Yetki testleri
- Web güvenlik testleri
- Yedekten geri dönüş
- Yük ve hata testleri
- KVKK ve mağaza yayın kontrolleri

---

## 8. Yayın öncesi zorunlu güvenlik testleri

**Aşağıdaki 14 test geçmeden gerçek kullanıcı verisiyle yayına çıkılmaz.**

- [ ] **1. Tenant izolasyonu** — Başka düğünün ID'si ile harcama, davetli, görev veya mesaj okunamıyor/değiştirilemiyor
- [ ] **2. Yardımcı yetkisi** — Yardımcı bütçeye, davetli listesine ve atanmadığı görevlere API üzerinden erişemiyor
- [ ] **3. Yardımcı iptali** — Erişimi iptal edilen yardımcı eski bağlantı/oturumla veri alamıyor
- [ ] **4. Davet token'ı** — İptal edilen, süresi dolan veya değiştirilmiş token çalışmıyor
- [ ] **5. RSVP güvenliği** — Tekrarlı ve eşzamanlı istekler yanlış kişi sayısı veya tutarsız kayıt oluşturmuyor
- [ ] **6. Admin 2FA** — 2FA tamamlanmadan hiçbir admin verisi/işlemi açılmıyor
- [ ] **7. Oturum güvenliği** — Çıkış, süre sonu ve iptal eski token'ları geçersiz kılıyor
- [ ] **8. Fotoğraf erişimi** — Başka düğün/görev fotoğrafları tahmin edilen URL ile açılamıyor
- [ ] **9. Fotoğraf kotası** — Eşzamanlı yüklemeler kota sınırını aşamıyor
- [ ] **10. Dosya güvenliği** — Sahte uzantılı, bozuk veya izin verilmeyen dosyalar reddediliyor
- [ ] **11. Taksit doğruluğu** — Taksit toplamı ana harcamayla kuruş hassasiyetinde eşit
- [ ] **12. Yedek geri yükleme** — Gerçek yedekten test ortamına veri geri yüklenebiliyor
- [ ] **13. Log gizliliği** — Loglarda parola, token, MFA secret veya davetli özel bilgisi yok
- [ ] **14. Deploy güvenliği** — Üretim secret'ları GitHub deposunda ve build çıktılarında yok

---

## 9. Öncelik sıralaması

| Öncelik | İş | Zamanlama |
|---|---|---|
| **P0** | Tenant izolasyonu ve backend yetkilendirme | Kodlamadan önce netleştir |
| **P0** | Yardımcı ve misafir token/oturum güvenliği | Tasarımı tamamla |
| **P0** | Admin 2FA ve admin API izolasyonu | Tasarımı tamamla |
| **P0** | Yedekleme ve geri yükleme | İlk altyapı aşamasında kur |
| **P0** | KVKK veri yaşam döngüsü | Yayın öncesi tamamla |
| **P1** | R2 fotoğraf güvenliği ve kota | Fotoğraf özelliğinden önce |
| **P1** | Oturum, parola kurtarma, web güvenlik header'ları | Auth geliştirilirken |
| **P1** | Taksit ve RSVP eşzamanlılık testleri | İlgili modüllerden önce |
| **P1** | Loglama, alarm, hata izleme | İlk backend sürümünde |
| **P2** | Gelişmiş analitik, push, gerçek zamanlı sohbet | MVP sonrası |

---

## 10. Veri modeli ve iş mantığı kuralları

### 10.1 Bütçe ve taksitler

| # | Kural |
|---|---|
| 1 | Taksit toplamı ana harcamaya **kuruş hassasiyetinde** eşit |
| 2 | İlk taksit ayı ile satın alma tarihi **farklı olabilir** |
| 3 | Ayın 29/30/31'inde başlayan taksitlerin sonraki aylara aktarımı **tanımlı** |
| 4 | Taksit ödendi işaretlendiğinde **ödeme tarihi saklanır** |
| 5 | Taksit sayısı/tutarı değişince geçmiş ödemeler **sessizce değiştirilmez** |
| 6 | Harcama silinince taksitler **tutarlı** ele alınır |
| 7 | Raporda "toplam satın alma" ile "gelecek ay yükümlülüğü" **karıştırılmaz** |

**Para tipi:** `NUMERIC(12,2)` veya kuruş bazlı tam sayı. **Asla float.** İki yöntem aynı hesaplama zincirinde karıştırılmaz.

### 10.2 Davetli ve RSVP

**Model ayrımı gerekli:**
```
guest_invitation   → davetiye/hane/grubu temsil eder
invited_attendee   → davet edilen kişiler + izin verilen kişi sayısı
rsvp_response      → gelen yanıt + zaman
```

**v1 için asgari:** `allowed_party_size` ve `confirmed_party_size` **ayrı alanlar**.

**Netleşmesi gerekenler:**
- Davetli kaç kişiyle gelebilir?
- Refakatçi sayısını kim değiştirebilir?
- Davetli, izin verilen sayıyı aşan yanıt verebilir mi?
- Çift yanıtı düzeltebilir mi?
- RSVP kapanışından sonra değişiklik olur mu?
- Davetli kaydı silinirse eski bağlantı ne olur?

### 10.3 Görev sohbeti

| # | Kural |
|---|---|
| 1 | Mesajlar **sayfalı** yüklenir |
| 2 | `cursor` veya `last_message_id` ile artımlı çekim |
| 3 | **Idempotency** — aynı mesaj tekrar gönderilince kopya oluşmaz |
| 4 | Yardımcı görevden çıkarılınca **geçmiş mesajları göremez** |
| 4b | **Yeniden atama:** görev başka yardımcıya verilirse, yeni yardımcı **önceki konuşmayı GÖRMEZ** — sadece atama sonrası mesajlar |
| 5 | Görev silinince mesajların durumu tanımlı |
| 6 | Mesaj uzunluğu sınırlı (**max 4000 karakter**), **HTML çalıştırılmaz** |
| 7 | Polling aralığı serv00 kaynağını tüketmeyecek şekilde sınırlı |
| 8 | **Görev başına tek sorumlu** (v1) — `UNIQUE` kısıt; çoklu atama v1.1 |

> **4b gerekçesi (builder check):** Yeniden atamada eski konuşmanın yeni kişiye açılması, önceki yardımcının özel konuşmasını ifşa eder. Mesaj erişimi `task_id` + `assigned_at` ile sınırlanır.

**v1:** Basit mesajlaşma + sayfalama + kontrollü yenileme. Okundu bilgisi, "yazıyor", WebSocket → **sonra**.

### 10.4 Veritabanı ilişkileri

| # | Kural |
|---|---|
| 1 | Görev ve mesajı **aynı `wedding_id`** taşımak zorunda (composite FK) |
| 2 | Silme davranışı (`CASCADE`/`RESTRICT`/soft delete) her ilişki için **bilinçli** seçilir |
| 3 | Aynı davetliye birden fazla aktif token izni **kararlaştırılır** |
| 4 | Görev atamalarında **tekrar eden kayıt engellenir** |
| 5 | Eşzamanlı RSVP ve kota işlemleri **transaction** ile korunur |
| 6 | Liste sorgularında `wedding_id` + tarih/durum **indeksleri** kullanılır |

---

## 11. Ürün tutarsızlıkları — düzeltildi

Denetimde bulunan ve bu belgeyle kapatılan çelişkiler:

| # | Çelişki | Çözüm |
|---|---|---|
| A | Yardımcı "hesap oluşturur/giriş yapar" ↔ "uygulama indirmez, link ile girer" | **Bağımsız web erişim modeli.** Yardımcı hesabı yok; normal çift hesabıyla aynı yetki verilmez |
| B | Görev fotoğrafı MVP'de ↔ "dosya ekleri MVP sonrası" | **v1'de var** (kontrollü alt aşama, Aşama 6) |
| C | Admin hosting belirsiz ↔ karar verildi | `admin.davetly.com` → **Cloudflare Pages**; `api.davetly.com` → **serv00** |
| D | Davetli/aile daveti modeli eksik | `allowed_party_size` + `confirmed_party_size` ayrımı zorunlu |
| E | Düğün üyeliği ↔ görev ataması karışık | **Üç ayrı kontrol:** üyelik, atama, mesaj erişimi |

---

## 12. Belge hiyerarşisi

Çelişki durumunda geçerlilik sırası:

1. **`docs/SECURITY.md`** (bu belge) — güvenlik kuralları
2. `docs/superpowers/specs/*-design.md` — ürün ve mimari kararlar
3. `docs/DAVETLY_CLAUDE_BRIEF-v2.md` — referans doküman

> Geliştirme aracına eski ve yeni kararlar birlikte verilirse **yanlış mimari kurulabilir.** Bu belge güncel kararları tek yerde tutar.
