# DUGUNCE — Claude Code Proje Ana Dokümanı

> **Amaç:** Bu dosya, Düğünce uygulamasını geliştirmek için Claude Code'a verilecek ana ürün, teknik mimari, iş kuralları ve geliştirme rehberidir.  
> **Dil:** Ürün arayüzünün varsayılan dili Türkçe olacaktır. Kod, değişken ve API isimleri İngilizce kullanılabilir.  
> **Durum:** Ürün fikri ve ana kapsam tanımlandı; henüz uygulama kodu yazılmadı. Bazı ticari ve teknik kararlar doğrulama bekliyor.  
> **Önemli:** Bu dokümanda “öneri”, “varsayım” veya “karar bekliyor” olarak işaretlenen maddeleri kullanıcı onayı olmadan kesin ürün kararı gibi uygulama.

---

## 1. Proje özeti

**Düğünce**, evlenecek çiftlerin düğün hazırlıklarını tek bir yerden yönetmesini sağlayan, mobil öncelikli bir düğün planlama uygulamasıdır. Üç ana kullanıcı grubu vardır:

1. **Çift (Couple):** Düğünü oluşturan ve tüm yönetim yetkisine sahip kullanıcı veya kullanıcılar.
2. **Yardımcı (Helper):** Çiftin davet ettiği, yalnızca kendisine atanmış görevleri ve bu görevlere ait konuşmaları görebilen kişi.
3. **Misafir (Guest):** Uygulamayı indirmeden, kendisine gönderilen web davetiyesi bağlantısından daveti görüntüleyen ve RSVP yanıtı veren kişi.

Ürünün temel vaadi: **Düğün bütçesini, davetli listesini ve görev organizasyonunu sade, anlaşılır ve güvenli biçimde tek yerde toplamak.**

### 1.1 Üç temel modül

- **Bütçe ve harcama takibi:** Harcamalar, kategoriler, ödemeyi yapan taraf/kişi, ödeme yöntemi, tarih ve kredi kartı taksitleri.
- **Davetli ve RSVP yönetimi:** Davetli listesi, WhatsApp üzerinden kişisel davet gönderimi, uygulama indirmeden çalışan web davetiyesi, katılım yanıtları.
- **Görev ve yardımcı yönetimi:** Yardımcı davet etme, görev atama, görev başına ayrı sohbet ve rol bazlı erişim.

---

## 2. Hedef platformlar ve geliştirme koşulları

### 2.1 Platformlar

- Android uygulaması
- iOS uygulaması
- Misafirler için mobil uyumlu web davetiyesi
- Gerekirse çift/yardımcı için web yönetim arayüzü ileriki sürümlerde değerlendirilebilir; ilk sürümde ana yönetim deneyimi mobil uygulamadır.

### 2.2 Geliştirici ortamı ve kısıtlar

- Geliştirici tek başına çalışıyor.
- Maliyet mümkün olduğunca düşük tutulmalı.
- Geliştiricinin bilgisayarı **CachyOS (Arch Linux tabanlı)**.
- Geliştirici Kotlin biliyor.
- Bilgisayarda Android/iOS uygulamasını derlemek istemiyor; kaynak kodu yerelde düzenleyip GitHub'a gönderecek, derlemeleri GitHub Actions yapacak.
- iOS derlemesi için GitHub Actions macOS runner kullanılmalı. iOS imzalama ve App Store dağıtımı gerektiğinde Apple Developer hesabı/sertifikaları gerekir; bu maliyet ve gereklilikler önceden açıklanmalı.
- Android derlemeleri GitHub Actions Linux runner üzerinde yapılabilir.

### 2.3 Önerilen mobil teknoloji

**Kotlin Multiplatform (KMP) + Compose Multiplatform**

Gerekçe:
- Geliştiricinin Kotlin bilgisiyle uyumlu.
- İş mantığının önemli bölümü Android ve iOS arasında paylaşılabilir.
- Compose ile ortak arayüz geliştirilebilir.
- GitHub Actions üzerinden platform bazlı CI derlemesi yapılabilir.

Claude Code:
- KMP/Compose Multiplatform sürümlerini proje oluşturulurken güncel ve birbiriyle uyumlu seç.
- Sürüm numaralarını tahmin ederek sabitleme; resmi kararlı sürümleri ve uyumluluk tablolarını kontrol et.
- iOS derlemesi için macOS/Xcode gereksinimini hesaba kat.
- Projeyi gereksiz karmaşıklaştırma; tek geliştiricinin sürdürebileceği basit yapı kur.

---

## 3. Marka ve tasarım yönü

### 3.1 Görsel kimlik

Tercih edilen yön: **Modern Premium**

Ana renk yaklaşımı:
- Adaçayı yeşili (sage green)
- Kırık beyaz / off-white
- Bej ve sıcak nötr tonlar

Tasarım ilkeleri:
- Sade, zarif, güven veren ve romantik ama klişe olmayan görünüm.
- Gereksiz süsleme, yoğun gradient ve kalabalık ekranlardan kaçın.
- Mobil kullanımda büyük dokunma alanları ve net hiyerarşi.
- Bütçe ekranlarında rakamlar kolay taranmalı.
- Durumlar (ödendi, bekliyor, tamamlandı, yanıt verdi vb.) yalnızca renkle anlatılmamalı; metin/ikonla da belirtilmeli.
- Erişilebilir kontrast, dinamik yazı boyutları ve ekran okuyucu etiketleri düşünülmeli.
- Türkçe karakterler ve uzun Türkçe metinler tüm ekranlarda test edilmeli.

### 3.2 Tasarım sistemi

İlk aşamada:
- Renk tokenları
- Tipografi ölçeği
- Boşluk (spacing) ölçeği
- Köşe yuvarlaklıkları
- Buton, kart, metin alanı, durum etiketi bileşenleri
- Açık tema
- Karanlık tema gerekiyorsa sonraki aşamada

Tasarım değerlerini tek tek ekranlara gömmek yerine merkezi tema/tasarım tokenları kullan.

---

## 4. Kullanıcı rolleri ve yetki modeli

**Yetki denetimi mutlaka backend tarafında yapılmalıdır.** Mobil arayüzde bir alanı gizlemek güvenlik kontrolü değildir.

### 4.1 Çift (Couple)

- Düğün alanındaki tüm modüllere erişir.
- Bütçe/harcamaları oluşturur, düzenler, siler.
- Davetli ekler, düzenler, siler ve davet bağlantısı üretir/yeniler/iptal eder.
- RSVP yanıtlarını görür.
- Yardımcı davet eder ve yardımcı erişimini iptal eder.
- Görev oluşturur, düzenler, atar, yeniden atar, tamamlar veya siler.
- Göreve ait konuşmaları görebilir.
- Düğün ayarlarını yönetir.
- Çiftin iki üyesi de aynı düğün alanında yönetici olabilir. Bu üyelik modelinin ilk sürümde nasıl davet edileceği ayrıca netleştirilebilir.

### 4.2 Yardımcı (Helper)

- Yalnızca kendisine atanmış görevleri görür.
- Yalnızca erişim izni bulunan görevlerin sohbetini görür/yazar.
- Bütçe, harcama, taksit, davetli listesi ve RSVP detaylarını göremez.
- Başka yardımcıların özel görevlerini göremez.
- Kendisine atanmış görevin durumunu güncelleyebilir mi, görev açıklamasını değiştirebilir mi gibi ayrıntılar ürün kararıdır. Varsayılan öneri: görev durumunu güncelleyebilir; görev tanımı/ataması yalnızca çift tarafından değiştirilir.

### 4.3 Misafir (Guest)

- Uygulama hesabı açmak veya uygulama indirmek zorunda değildir.
- Kendisine özel/öngörülemez token içeren web davetiye bağlantısını açar.
- Davetiye bilgilerini görür.
- “Geliyorum” veya “Gelemeyeceğim” yanıtı verir.
- Misafir yalnızca kendi davetiye kaydına ait bilgileri görmeli ve değiştirebilmelidir.
- Davetli listesi veya diğer misafirlerin yanıtları asla açığa çıkmamalıdır.

### 4.4 Yetki matrisi

| İşlem | Çift | Yardımcı | Misafir |
|---|---:|---:|---:|
| Düğün ayarları | Evet | Hayır | Hayır |
| Bütçe ve harcamalar | Evet | Hayır | Hayır |
| Taksit planları | Evet | Hayır | Hayır |
| Davetli listesini görme | Evet | Hayır | Hayır |
| RSVP genel sonuçlarını görme | Evet | Hayır | Hayır |
| Kendi davetiyesini görme | Evet (yönetim) | Hayır | Evet |
| RSVP gönderme | Yönetebilir | Hayır | Kendi kaydı |
| Yardımcıları yönetme | Evet | Hayır | Hayır |
| Tüm görevleri görme | Evet | Hayır | Hayır |
| Atanmış görevleri görme | Evet | Evet | Hayır |
| Görev sohbeti | Evet | Yalnızca erişebildiği görev | Hayır |

---

## 5. Ürün kapsamı ve işlevsel gereksinimler

## 5.1 Kimlik doğrulama ve düğün oluşturma

İlk sürümde gerekli akış:
1. Kullanıcı kayıt olur veya giriş yapar.
2. Yeni düğün alanı oluşturur.
3. Çiftin adlarını, düğün tarihini ve temel bilgileri girer.
4. Uygulama bu düğün için benzersiz bir `wedding_id` üretir.
5. Düğün sahibi kullanıcıya yönetici üyeliği atanır.
6. Kullanıcı ana panele yönlendirilir.

Karar bekleyenler:
- E-posta/şifre mi, telefon OTP mi, yoksa ikisi mi?
- Şifre sıfırlama ve e-posta doğrulama sağlayıcısı.
- Bir hesabın birden fazla düğün alanına katılabilmesi.
- Çiftin ikinci üyesinin davet akışı.

MVP için maliyet ve karmaşıklığı düşük tutan, güvenli bir kimlik doğrulama yöntemi seç. Parolaları asla düz metin saklama; güncel, güvenli parola hash algoritması kullan.

## 5.2 Çift ana paneli

Ana panelde özet kartları:
- Toplam bütçe (kullanıcı bütçe hedefi belirlediyse)
- Toplam harcama
- Kalan bütçe
- Yaklaşan/ödenmemiş ödemeler
- Toplam davetli
- Katılım yanıtı verenler
- Katılacak / katılamayacak / yanıt beklenen sayıları
- Açık görevler ve yaklaşan görevler

Veri yokken boş ekran yerine açıklayıcı empty state ve ilgili ilk eylem butonu göster.

## 5.3 Bütçe ve harcama takibi

Her harcama için önerilen alanlar:
- Tutar
- Para birimi (ilk hedef Türkiye ise varsayılan TRY; ileride çoklu para birimi değerlendirilebilir)
- Kategori
- Açıklama/not
- Ödemeyi yapan taraf: gelin tarafı / damat tarafı / ortak / belirli kişi
- Ödemeyi yapan kişi (opsiyonel)
- Ödeme tarihi
- Ödeme yöntemi: nakit, banka kartı, kredi kartı, havale/EFT, diğer
- Ödeme durumu: ödendi / bekliyor / kısmi (kısmi ödeme MVP'de ertelenebilir)
- Taksitli mi?
- Taksit sayısı
- İlk taksit tarihi veya ayı
- Oluşturulma ve güncellenme zamanları

Kategori örnekleri (başlangıç listesi, kullanıcı özelleştirmesi değerlendirilebilir):
- Mekân
- Yemek / catering
- Fotoğraf / video
- Gelinlik / damatlık
- Kuaför / makyaj
- Çiçek / dekorasyon
- Müzik / eğlence
- Davetiye
- Ulaşım
- Konaklama
- Hediyelik
- Diğer

### Taksit iş mantığı

Kredi kartıyla yapılan taksitli harcamalarda toplam harcama ve aylık nakit çıkışı birbirinden ayrılmalı.

Örnek:
- Toplam alışveriş: 12.000 TL
- Taksit: 4
- Aylık taksit: 3.000 TL
- İlk taksit: Ocak

Uygulama 4 aylık ödeme kaydı/plan satırı oluşturur. Aylık rapor ilgili aya düşen 3.000 TL'yi gösterir. Toplam satın alma tutarı bütçe raporunda iki kez sayılmamalıdır.

Önemli tasarım kararı:
- `expense` satın almanın kendisini temsil eder.
- `installment` veya `expense_installments` her ay ödenecek parçayı temsil eder.
- Raporlarda “toplam taahhüt/harcama” ile “bu ay ödenecek tutar” ayrıştırılır.
- Taksit yuvarlama farkları son taksite eklenerek toplam tutar tam eşitlenir.
- Kullanıcı taksit sayısını/tutarını değiştirirse geçmiş ödemeleri sessizce bozma; açıkça onay al ve değişiklik geçmişini düşün.
- Tarih ve ay hesaplamalarında timezone ve ay sonu durumlarını test et.

İlk sürümde fiş/fatura fotoğrafı yükleme zorunlu değildir. Dosya yükleme eklenirse dosyayı veritabanında binary olarak saklama; güvenli nesne depolama ve erişim kontrolü gerekir.

## 5.4 Davetli yönetimi

Davetli kaydı için önerilen alanlar:
- Ad
- Soyad
- Telefon (opsiyonel; WhatsApp daveti için kullanılır)
- E-posta (opsiyonel)
- Davetli grubu/etiketi (gelin tarafı, damat tarafı, aile, arkadaş vb.)
- Davetli sayısı / beraberindeki kişi sayısı (ürün kararı; ilk sürümde tek kişi veya davetli başına refakatçi sayısı)
- Davet durumu: hazırlanmadı / gönderildi / yanıtlandı
- RSVP durumu: bekliyor / geliyor / gelemiyor
- Özel not
- Davetiye token durumu: aktif / iptal
- Oluşturulma ve güncellenme zamanları

Davetli listesinde arama, filtreleme ve temel sayım olmalı:
- Tüm davetliler
- Yanıt bekleyenler
- Geliyor
- Gelemiyor
- Gelin tarafı / damat tarafı / etiket bazlı filtre

Telefon numarası kişisel veridir. Gereksiz veri toplama; erişimi kısıtla ve silme/retention politikası belirle.

## 5.5 WhatsApp davet gönderimi

İstenen akış:
1. Çift davetli kaydını açar.
2. Uygulama davetliye özel web davetiyesi URL'sini üretir.
3. Hazır bir Türkçe mesaj ve URL oluşturulur.
4. Kullanıcı WhatsApp paylaşım bağlantısını/telefon uygulamasını açar.
5. Mesajı **kendi WhatsApp hesabından kendisi gönderir**.

**WhatsApp mesajları otomatik gönderilmeyecek.** İlk sürümde WhatsApp Business API veya otomatik toplu mesaj entegrasyonu yapılmayacak. Kullanıcı mesajı gözden geçirip gönderme eylemini kendisi yapar.

Mesaj örneği:
“Merhaba [Ad], düğünümüze seni de aramızda görmek isteriz. Davetiyemiz ve katılım yanıtın için: [bağlantı]”

- URL encode işlemini doğru yap.
- Telefon numarası varsa WhatsApp'a yönlendirme kolaylaştırılabilir; numara yoksa sistem paylaşım menüsü veya kopyalama sunabilir.
- Gönderildi işaretini, WhatsApp mesajının gerçekten teslim edildiği anlamında kullanma. Bu yalnızca kullanıcının “gönderdim” diye işaretlediği uygulama içi durum olabilir.

## 5.6 Misafir web davetiyesi

Misafir uygulama yüklemeden açabilmeli. Sayfa mobil öncelikli ve hızlı olmalı.

İçerik:
- Çiftin adları
- Düğün tarihi ve saati
- Mekân adı ve adresi
- Harita bağlantısı / yol tarifi
- Program/akış (varsa)
- Kısa not veya açıklama
- Hediye notu (opsiyonel; kullanıcı tarafından yazılır)
- “Geliyorum” ve “Gelemeyeceğim” butonları

RSVP:
- Misafirin token'ı ile ilgili davetli kaydı bulunur.
- Misafir yanıtı verir.
- Başarılı yanıt sonrası teşekkür/başarılı durum gösterilir.
- Misafir yanıtını değiştirebilir mi? **Karar bekliyor.** Öneri: çift RSVP kapanış tarihi belirleyebilsin; kapanışa kadar misafir yanıtını değiştirebilsin.
- Aynı anda iki yanıt gelmesi, tekrar istek ve sayfa yenileme durumları idempotent yönetilmeli.
- Token tahmin edilemez olmalı (kriptografik güvenli rastgelelik; UUID tek başına kullanılacaksa yeterli entropi ve gizlilik değerlendirilmeli). Token'ı ardışık ID veya telefon gibi tahmin edilebilir bilgi yapma.
- Token iptal/yenileme desteklenmeli.
- Token URL'de bulunduğundan sunucu loglarına ve analitik sistemlerine gereksiz şekilde yazılmamasına dikkat et.
- Sayfa başka misafirlerin verisini veya tüm listeyi asla döndürmemeli.

Harita için MVP'de Google Maps/Apple Maps yönlendirme URL'si veya genel harita linki yeterli olabilir; ücretli API kullanımı zorunlu kılma.

## 5.7 Yardımcı ve görev yönetimi

Çift:
- Yardımcıyı e-posta/telefon veya davet bağlantısı üzerinden davet eder.
- Yardımcı hesabı oluşturur/giriş yapar.
- Yardımcı ilgili düğün alanına üye olur.
- Çift görev oluşturur ve bir veya daha fazla yardımcıya atar (çoklu atama ürün kararı; ilk sürümde tek sorumlu daha basit).
- Görev için başlık, açıklama, son tarih, öncelik ve durum belirler.

Görev alanları:
- Başlık
- Açıklama
- Sorumlu yardımcı/yardımcılar
- Son tarih
- Öncelik: düşük / normal / yüksek
- Durum: yapılacak / devam ediyor / tamamlandı
- Oluşturan kullanıcı
- Oluşturulma/güncellenme zamanı

Yardımcı ekranı:
- Bana atanan görevler
- Yaklaşan görevler
- Tamamlanan görevler
- Görev detayı
- İlgili görevin sohbeti

### Görev başına sohbet

- Her görevin kendine ait konuşma alanı vardır.
- Çift ve o göreve erişimi olan yardımcı(lar) mesajlaşabilir.
- Bir yardımcı başka görevin konuşmasını göremez.
- Mesajlar görev kimliği ve düğün kimliği ile ilişkilendirilir.
- Mesaj düzenleme/silme, dosya ekleme, okundu bilgisi gibi özellikler ilk sürümde zorunlu değildir.
- Bildirimler ilk sürümde uygulama içi olabilir; push bildirim altyapısı sonraki faza bırakılabilir.
- Serv00 üzerinde sürekli çalışan websocket/worker süreçlerinin kullanılabilirliği test edilmeden gerçek zamanlı sohbet mimarisine bağımlı olma. MVP'de REST API ile mesaj gönderme ve periyodik yenileme/polling kullanmak daha güvenli başlangıçtır. WebSocket gerekiyorsa Serv00 üzerinde ayrıca doğrula.

---

## 6. MVP ve sonraki sürümler

### 6.1 MVP — ilk yayın için zorunlu

1. Kayıt/giriş ve oturum yönetimi
2. Düğün alanı oluşturma ve temel düğün bilgileri
3. Çift ana paneli
4. Harcama ekleme/düzenleme/silme ve kategori
5. Ödeme tarafı/kişisi ve ödeme yöntemi
6. Kredi kartı taksit planı ve aylık görünüm
7. Davetli ekleme/düzenleme/silme
8. Misafir web davetiyesi
9. Token ile güvenli RSVP
10. WhatsApp üzerinden kullanıcının kendisinin gönderdiği davet mesajı
11. Yardımcı davet etme
12. Görev oluşturma ve atama
13. Yardımcı rolünün kısıtlı ekranı
14. Görev bazlı sohbet (ilk sürümde polling olabilir)
15. Backend tarafında rol ve düğün kapsamı yetki kontrolleri
16. Temel hata yönetimi, loglama ve yedekleme

### 6.2 MVP sonrası

- CSV/Excel dışa aktarma
- Gelişmiş bütçe raporları ve grafikler
- Push bildirimleri
- RSVP hatırlatmaları
- Masa/oturma planı
- Tedarikçi/işletme pazaryeri
- Yapay zekâ destekli öneriler
- Gelişmiş görev takvimi
- Fotoğraf/dosya ekleri
- Çoklu dil
- Gelişmiş çift/yardımcı davet akışları
- iOS/Android platforma özgü iyileştirmeler

Bu özellikleri ilk sürüme ekleyerek kapsamı şişirme.

---

## 7. İş modeli ve fiyatlandırma — kesinleşmedi

Önceki fikir: tek seferlik “Düğün Paketi” ödemesi (örnek olarak 149 TL konuşuldu). Bu fiyat **kesinleşmiş veya doğrulanmış fiyat değildir**; piyasa, ödeme komisyonu, vergi, destek maliyeti ve kullanıcı testleriyle doğrulanmalı.

Konuşulan ücretsiz/premium sınırları:
- Ücretsiz: 10 davetli, 1 yardımcı, 1 görev gibi daha kısıtlı plan.
- Premium: sınırsız davetli/görev ve en fazla 5 yardımcı; CSV/Excel dışa aktarma.
- Daha sonra ücretsiz davetli sayısını 30'a ve görev sayısını 3'e yükseltme fikri de ortaya atıldı; kullanıcı bunu kesin olarak onaylamadı.

**Claude Code talimatı:** İlk sürümde ödeme duvarı ve abonelik altyapısı kurma. Önce ürünün temel kullanımını tamamla. Limitleri konfigürasyon üzerinden yönetilebilecek şekilde tasarla; sayıları kodun birçok yerine sabitleme. Fiyat ve limit kararlarını kullanıcı onayına bırak.

---

## 8. Teknik mimari

### 8.1 Genel yapı

Önerilen bileşenler:

- **Mobil istemci:** Kotlin Multiplatform + Compose Multiplatform
- **Backend:** Node.js + Express (TypeScript tercih edilir)
- **Veritabanı:** PostgreSQL (Serv00 hesabında sürüm/erişim doğrulanmalı)
- **Hosting:** Serv00 shared hosting
- **DNS / proxy / CDN / SSL:** Cloudflare
- **Kaynak kodu:** GitHub
- **CI/CD:** GitHub Actions
- **Misafir davetiye web sayfası:** Backend ile aynı alan adında sunulan hafif, responsive web sayfası (teknoloji seçimi sade tutulmalı)

### 8.2 Serv00 önemli kısıtları

Serv00 bir **VPS değildir; paylaşımlı hosting** ortamıdır. Tasarımı buna göre yap.

Bilinen/önceden incelenmiş platform davranışları; hesap ve güncel dokümanla tekrar doğrula:
- Node.js uygulamaları Passenger benzeri hosting mekanizmasıyla çalıştırılır.
- Uygulama giriş dosyası ve dizin yapısı Serv00 panel/dokümanında tarif edilen biçime uymalıdır.
- Uygulama belirli bir süre trafik almazsa uykuya geçebilir ve sonraki istekte yeniden başlatılabilir (önceki incelemede 24 saatlik hareketsizlikten söz edildi; güncel davranışı doğrula).
- Bu nedenle ilk istekte soğuk başlangıç gecikmesi olabilir.
- Uygulama kendi başına kalıcı bir port açıp dinlemeye zorlanmamalı; Serv00'ın beklediği Passenger/uygulama başlatma düzeni kullanılmalı.
- Sürekli çalışan worker, queue consumer veya `cloudflared` daemon varmış gibi mimari kurma.
- WebSocket desteği olduğu belirtilse de gerçek kullanım, bağlantı sürekliliği ve limitleri hesapta test edilmelidir.
- PostgreSQL kullanılabilirliği, sürümü, bağlantı socket/host bilgisi, kullanıcı yetkileri ve yedekleme yöntemi hesap panelinden doğrulanmalıdır.
- Serv00 ücretsiz plan limitleri ve hizmet koşulları değişebilir; uygulama kapasitesi varsayımla garanti edilmemelidir.

**Cloudflare Tunnel:** Serv00 üzerinde kalıcı `cloudflared` sürecinin desteklendiği doğrulanmadı. Bu yüzden Tunnel mimarinin zorunlu parçası değildir. Başlangıçta:
- Alan adının DNS'ini Cloudflare yönetebilir.
- Cloudflare proxy/CDN ve uygun SSL/TLS ayarları kullanılabilir.
- Serv00 üzerinde uygulamanın doğrudan erişilebilir HTTPS alan adı olmalı.
- Cloudflare Workers yalnızca gerçek bir ihtiyaç ortaya çıkarsa eklenmeli; MVP için zorunlu değil.

### 8.3 PostgreSQL mi MySQL mi?

Tercih edilen karar: **PostgreSQL**.

Gerekçe:
- İlişkisel veri modeli ve kısıtlar için güçlü.
- Raporlama/sorgulama ihtiyaçlarına elverişli.
- Node.js ile `pg` sürücüsü kullanılabilir.
- Düğünce'nin veri modeline uygun.

Ancak Serv00 panelinde PostgreSQL servisinin ve sürümünün gerçekten kullanılabildiğini doğrulamadan veritabanı bağlantı kodunu tamamlanmış kabul etme. Önce küçük bir bağlantı testi yap. Eğer PostgreSQL hesabında desteklenmiyorsa MySQL'e geçiş kararı kullanıcıyla konuşulmalı; sessizce veritabanı değiştirme.

### 8.4 Backend uygulama ilkeleri

- TypeScript kullanılması önerilir.
- REST API ile başla.
- API sürümlemesi: `/api/v1/...`
- İstek doğrulama kütüphanesi kullan (Zod veya eşdeğeri).
- Merkezi hata yönetimi.
- Yapılandırılmış loglama; parola, token, davet URL'si veya kişisel verileri loglama.
- Veritabanı sorgularında parametreli sorgular/ORM kullan; SQL injection'a açık string birleştirme yapma.
- Transaction gerektiren çoklu yazımlarda transaction kullan.
- Tarihleri UTC sakla; kullanıcıya gösterirken düğünün/uygulamanın saat dilimini uygula.
- Para tutarlarını kayan noktalı `float` olarak saklama. PostgreSQL `NUMERIC/DECIMAL` veya kuruş bazlı integer yaklaşımından birini tutarlı seç. Öneri: `NUMERIC(12,2)` ve para birimi kodu.
- Her düğün verisinde `wedding_id` kapsamı bulunmalı.
- Soft delete gerekiyorsa bilinçli tasarla; silme ve veri saklama politikası dokümante edilmeli.

### 8.5 Önerilen depo yapısı

Tek geliştirici için başlangıçta **monorepo** daha az operasyonel yük oluşturabilir. Daha önce ayrı mobil/backend/web depoları da düşünülmüştü; henüz kesinleşmedi. Claude Code kullanıcı onayı olmadan repo stratejisini değiştirmesin. Yeni repo açılacaksa önerilen yapı:

```text
dugunce/
  mobile/
    composeApp/
    shared/
  backend/
    src/
      config/
      middleware/
      modules/
        auth/
        weddings/
        expenses/
        guests/
        invitations/
        tasks/
        messages/
      db/
      app.ts
      server.ts
    tests/
  guest-web/
    src/
  docs/
    PRODUCT_SPEC.md
    API.md
    DATABASE.md
    SECURITY.md
  .github/
    workflows/
  README.md
```

KMP proje şablonunun gerçek dizinleri sürüme göre değişebilir. Yukarıdaki yapı hedef organizasyondur, birebir zorunlu değildir.

---

## 9. Veritabanı taslağı

Bu şema başlangıç önerisidir; migration'larla uygulanmalı ve ihtiyaç oldukça revize edilmelidir. Tüm düğün kapsamındaki tablolarda `wedding_id` bulunması ve sorguların bu kapsamı zorunlu tutması temel kuraldır.

### 9.1 Tablolar

#### `users`
- `id` (UUID, PK)
- `email` (nullable olabilir; benzersiz olmalı)
- `phone` (nullable olabilir; benzersiz olmalı)
- `password_hash` (parola giriş yöntemi varsa)
- `display_name`
- `created_at`
- `updated_at`
- `status`

Kimlik doğrulama yöntemi kararlaştırılmadan gereksiz alanları zorunlu kılma.

#### `weddings`
- `id` (UUID, PK)
- `name` veya çift adları
- `bride_name`
- `groom_name`
- `wedding_date`
- `event_time`
- `venue_name`
- `venue_address`
- `map_url`
- `timezone` (IANA timezone; ör. Europe/Istanbul)
- `program` (ilk sürümde JSON veya ayrı tablo kararı)
- `gift_note`
- `rsvp_deadline` (nullable)
- `created_at`
- `updated_at`

#### `wedding_members`
- `id`
- `wedding_id`
- `user_id`
- `role` (`owner` / `couple` / `helper`)
- `status` (`invited` / `active` / `revoked`)
- `invited_by`
- `created_at`
- Unique constraint: uygun `(wedding_id, user_id)` kombinasyonu.

Çift üyeliği ile yardımcı üyeliğini ayrı ayrı ve açıkça modelle.

#### `expenses`
- `id`
- `wedding_id`
- `title`
- `description`
- `category_id` veya kategori metni
- `total_amount NUMERIC`
- `currency`
- `paid_by_side` (`bride_side` / `groom_side` / `shared` / `person`)
- `paid_by_name` (nullable)
- `payment_method`
- `payment_status`
- `purchase_date`
- `is_installment`
- `installment_count`
- `created_by`
- `created_at`
- `updated_at`
- `deleted_at` (soft delete seçilirse)

#### `expense_installments`
- `id`
- `wedding_id`
- `expense_id`
- `installment_number`
- `amount NUMERIC`
- `due_date`
- `status` (`pending` / `paid`)
- `paid_at` (nullable)
- Unique constraint: `(expense_id, installment_number)`

#### `expense_categories`
- `id`
- `wedding_id` (sistem kategorisi olacaksa nullable veya ayrı global tablo)
- `name`
- `sort_order`
- `is_active`

#### `guests`
- `id`
- `wedding_id`
- `first_name`
- `last_name`
- `phone` (nullable)
- `email` (nullable)
- `group_label` (nullable)
- `plus_one_count` veya davet edilen kişi sayısı (ürün kararı)
- `notes` (nullable)
- `invitation_status`
- `rsvp_status`
- `rsvp_at`
- `created_at`
- `updated_at`

#### `invitation_tokens`
- `id`
- `wedding_id`
- `guest_id`
- `token_hash` (tercih: ham token yerine hash sakla)
- `expires_at` (nullable)
- `revoked_at` (nullable)
- `created_at`
- `last_used_at` (nullable)

Token üretiminde güvenli rastgelelik kullan. URL'deki token ile DB'deki hash'i karşılaştır. Token yenileme ve iptal destekle.

#### `tasks`
- `id`
- `wedding_id`
- `title`
- `description`
- `status`
- `priority`
- `due_at`
- `created_by`
- `created_at`
- `updated_at`

#### `task_assignees`
- `id`
- `wedding_id`
- `task_id`
- `user_id`
- `assigned_by`
- `created_at`
- Unique constraint: `(task_id, user_id)`

İlk sürümde tek sorumlu seçilse bile tablo çoklu atamaya geçişi kolaylaştırabilir; ancak gereksiz karmaşıklık yaratma.

#### `task_messages`
- `id`
- `wedding_id`
- `task_id`
- `sender_user_id`
- `body`
- `created_at`
- `edited_at` (nullable)
- `deleted_at` (nullable)

Her mesajı okurken hem `wedding_id` hem `task_id` hem de kullanıcının göreve erişim yetkisi kontrol edilmeli.

#### `audit_logs` (önerilir)
- `id`
- `wedding_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata` (hassas veri içermemeli)
- `created_at`

En azından kritik üyelik/rol değişiklikleri, token iptali ve önemli finansal düzenlemeler izlenebilir olmalı.

### 9.2 Veritabanı kuralları

- FK ilişkileri ve unique constraint kullan.
- Uygun indeksler: `wedding_id`, `guest_id`, `task_id`, `user_id`, tarih ve durum alanları.
- Her sorguda kullanıcı erişim kapsamını doğrula.
- İstemciden gelen `wedding_id` değerine tek başına güvenme; kullanıcının o düğüne üyeliğini backend doğrulasın.
- ID tahmin edilemez olsa da IDOR/BOLA açıklarına karşı her kaynağın sahiplik/yetki kontrolünü yap.
- Migration kullan; üretim veritabanını elle ve iz bırakmadan değiştirme.
- Seed/test verileri gerçek kişisel veri içermesin.

---

## 10. API taslağı

Bu liste başlangıç taslağıdır; endpoint sözleşmeleri `docs/API.md` içinde netleştirilmeli.

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh` (token stratejisine göre)
- `POST /api/v1/auth/forgot-password` (sağlayıcı kararı sonrası)
- `GET /api/v1/me`

### Weddings
- `POST /api/v1/weddings`
- `GET /api/v1/weddings`
- `GET /api/v1/weddings/:weddingId`
- `PATCH /api/v1/weddings/:weddingId`

### Expenses
- `GET /api/v1/weddings/:weddingId/expenses`
- `POST /api/v1/weddings/:weddingId/expenses`
- `GET /api/v1/weddings/:weddingId/expenses/:expenseId`
- `PATCH /api/v1/weddings/:weddingId/expenses/:expenseId`
- `DELETE /api/v1/weddings/:weddingId/expenses/:expenseId`
- `GET /api/v1/weddings/:weddingId/expense-summary`
- `GET /api/v1/weddings/:weddingId/installments`

### Guests / Invitations
- `GET /api/v1/weddings/:weddingId/guests`
- `POST /api/v1/weddings/:weddingId/guests`
- `PATCH /api/v1/weddings/:weddingId/guests/:guestId`
- `DELETE /api/v1/weddings/:weddingId/guests/:guestId`
- `POST /api/v1/weddings/:weddingId/guests/:guestId/invitation-token`
- `POST /api/v1/weddings/:weddingId/guests/:guestId/revoke-invitation-token`
- `GET /api/v1/invitations/:token` (public, yalnızca ilgili davetiye verisi)
- `POST /api/v1/invitations/:token/rsvp` (public, rate limited)

### Helpers / Memberships
- `GET /api/v1/weddings/:weddingId/members`
- `POST /api/v1/weddings/:weddingId/helper-invitations`
- `POST /api/v1/helper-invitations/:token/accept`
- `DELETE /api/v1/weddings/:weddingId/members/:memberId` (erişimi iptal)

### Tasks / Messages
- `GET /api/v1/weddings/:weddingId/tasks`
- `POST /api/v1/weddings/:weddingId/tasks`
- `GET /api/v1/weddings/:weddingId/tasks/:taskId`
- `PATCH /api/v1/weddings/:weddingId/tasks/:taskId`
- `DELETE /api/v1/weddings/:weddingId/tasks/:taskId`
- `GET /api/v1/weddings/:weddingId/tasks/:taskId/messages`
- `POST /api/v1/weddings/:weddingId/tasks/:taskId/messages`

API:
- Sayfalama, filtreleme ve sıralama standardı belirle.
- Hatalarda tutarlı JSON formatı döndür.
- Public RSVP endpoint'ine rate limit uygula.
- Yetki hatalarında hassas kaynak varlığını ifşa etmemek için uygun 404/403 stratejisini seç.
- API dokümantasyonu güncel tutulmalı.

---

## 11. Güvenlik, gizlilik ve veri koruma

Bu bölüm kritik önemdedir.

1. **Server-side authorization:** Her endpoint'te rol, üyelik ve kaynak kapsamı kontrolü.
2. **Wedding isolation:** Bir düğünün verisi başka düğüne asla sızmamalı.
3. **Helper isolation:** Yardımcı bütçe/davetli/başka görev verisine erişememeli.
4. **Guest token security:** Yüksek entropili token, tercihen DB'de hash, iptal/yenileme, rate limit.
5. **Password security:** Güvenli parola hash; düz metin parola yok.
6. **Transport security:** HTTPS zorunlu.
7. **Secrets:** DB şifresi, JWT secret, API anahtarları kaynak koduna yazılmaz. GitHub Secrets veya sunucu ortam değişkenleri kullanılır.
8. **Input validation:** Tüm kullanıcı girdileri backend'de doğrulanır.
9. **SQL injection:** Parametreli sorgu/ORM.
10. **XSS/HTML injection:** Misafir sayfasında kullanıcı metinlerini güvenli render et; ham HTML çalıştırma.
11. **CSRF:** Cookie tabanlı auth varsa CSRF koruması; bearer token kullanılıyorsa token saklama stratejisini güvenli seç.
12. **Rate limiting:** Login, RSVP, token ve davet kabul endpoint'leri.
13. **Logging:** Parola, token, telefon ve hassas davet verilerini loglama.
14. **Data minimization:** Gerekli olmayan kişisel verileri toplama.
15. **Deletion/export:** Kullanıcı/düğün verilerinin silinmesi ve dışa aktarılması için ileride uygulanabilir politika tasarla.
16. **Backups:** Hosting sağlayıcısının yedeğine tek başına güvenme. Düzenli, şifreli, erişimi kısıtlı ve mümkünse farklı yerde saklanan DB yedeği planla.
17. **Dependency security:** Bağımlılıkları güncel tut, bilinen açıkları kontrol et.
18. **No secrets in Git:** `.env` dosyaları `.gitignore` içinde olmalı; `.env.example` yalnızca örnek anahtar adlarını içermeli.

Türkiye'de kişisel veri işleneceği için KVKK yükümlülükleri, aydınlatma metni, veri işleme amacı, saklama süresi, kullanıcı hakları ve gerekiyorsa açık rıza/aktarımı konuları yayın öncesi uzman görüşüyle değerlendirilmelidir. Bu doküman hukuki danışmanlık değildir.

---

## 12. GitHub Actions ve dağıtım

### 12.1 Geliştirme akışı

1. Kod CachyOS üzerinde düzenlenir.
2. Yerelde Git ile commit yapılır.
3. GitHub'a push edilir.
4. GitHub Actions test ve derlemeleri çalıştırır.
5. Başarılı Android build artifact üretir.
6. iOS build macOS runner üzerinde çalışır.
7. Backend için test/lint/build yapılır.
8. Dağıtım yalnızca güvenli ve doğrulanmış deploy akışı kurulduktan sonra otomatikleştirilir.

Kullanıcı yerelde mobil derleme istemediğinden yerel Android Studio/Xcode derlemesini zorunlu iş akışı haline getirme. Kod editörü ve Git kullanımı yeterli olmalı.

### 12.2 CI iş akışları

Önerilen ayrı workflow'lar:
- `backend-ci.yml`: install, lint, typecheck, tests, build
- `android-ci.yml`: Android debug/release APK veya AAB
- `ios-ci.yml`: macOS runner, Xcode/KMP iOS build
- `deploy-backend.yml`: main branch veya release sonrası Serv00 deploy (önce manuel onayla başlatılabilir)

### 12.3 Serv00 deploy

- SSH/SFTP/rsync ve uzaktan komut çalıştırma yeteneklerini gerçek hesapta test et.
- Serv00 panelinde/SSH oturumunda desteklenmeyen komut varsayma.
- Deploy anahtarını GitHub Secrets içinde sakla.
- Parola veya özel anahtarları workflow dosyasına yazma.
- Deploy sonrası Serv00'ın beklediği uygulama restart komutunu ve dizin yapısını resmi dokümana/hesap davranışına göre doğrula.
- İlk etapta manuel deploy daha güvenli olabilir.
- Migration öncesi yedek al; migration başarısızlığında geri dönüş planı olsun.
- Üretim veritabanına test verisi basma.

### 12.4 Mobil dağıtım

- Android: GitHub Actions artifact; test için APK, mağaza dağıtımı için AAB.
- iOS: GitHub Actions macOS runner; imzalama için Apple sertifikaları/provisioning ve App Store Connect ayarları gerekir.
- Signing secret'larını güvenli secret olarak sakla.
- İlk aşamada TestFlight ve Google Play internal testing kullanılması önerilir.
- Mağaza hesapları ve ücretleri yayın planında ayrıca ele alınmalı.

---

## 13. Test stratejisi

### Backend unit/integration testleri
- Kullanıcı yalnızca üyesi olduğu düğünü görebilir.
- Yardımcı bütçe endpoint'ine erişemez.
- Yardımcı davetli listesi endpoint'ine erişemez.
- Yardımcı yalnızca atandığı görevi ve ilgili mesajları görür.
- Bir düğünün üyesi başka düğünün ID'sini kullanarak veri okuyamaz/değiştiremez.
- İptal edilen davetiye token'ı çalışmaz.
- Başka misafirin token'ı ile başka kayıt okunamaz.
- RSVP tekrar gönderildiğinde veri bozulmaz.
- Taksit toplamları harcama toplamına kuruş hassasiyetinde eşit olur.
- Silinen/iptal edilen üyeliklerin erişimi anında kesilir.

### Mobil testler
- Giriş/kayıt akışı
- Boş durumlar
- Ağ kesintisi ve tekrar deneme
- Yükleniyor/hata/başarı durumları
- Türkçe metin taşmaları
- Küçük ekran ve büyük yazı boyutu
- Android/iOS platform farkları

### Guest web testleri
- Android/iOS tarayıcılarında responsive görünüm
- Yavaş bağlantı
- Geçersiz/iptal token
- RSVP başarı ve hata akışları
- XSS denemeleri
- Tekrarlı istekler

---

## 14. Performans ve operasyon

- İlk sürümde mikroservis kullanma; modüler monolit backend yeterli.
- Gereksiz queue, Redis veya ayrı servis ekleme.
- Serv00 uyku/soğuk başlangıç davranışını kullanıcı deneyiminde hesaba kat.
- Liste endpoint'lerinde pagination kullan.
- Büyük davetli listelerini tek seferde yükleme.
- DB sorgularında N+1 problemlerine dikkat et.
- Misafir sayfasını hafif ve hızlı tut.
- Uygulama hata mesajları kullanıcıya anlaşılır, loglar geliştiriciye yararlı olmalı.
- Sağlık kontrolü endpoint'i eklenebilir: `GET /health`.
- Uygulama başlarken DB bağlantısı kurulamazsa kontrollü hata ver; secret veya bağlantı dizesini loglama.
- Sunucu kaynak limitlerini ölçmeden yoğun trafik kapasitesi iddiasında bulunma.

---

## 15. Analitik ve ürün doğrulama

İlk hedef uygulamayı büyütmekten önce gerçek çiftlerle doğrulamaktır.

Önerilen doğrulama:
- 15–20 çiftle görüşme veya prototip testi.
- En çok zorlandıkları düğün organizasyonu adımlarını öğren.
- Harcama/taksit, RSVP ve görev akışlarını ayrı ayrı test et.
- Kullanıcıların gerçekten ödeme yapmaya istekli olup olmadığını ölç.
- Kişisel veri ve izinlere dikkat ederek yalnızca gerekli anonim kullanım metriklerini topla.

Ölçülebilecek temel metrikler:
- Düğün oluşturmayı tamamlayan kullanıcı oranı
- İlk harcamayı ekleme oranı
- İlk davetliyi ekleme ve davetiye bağlantısı üretme oranı
- RSVP dönüşüm oranı
- En az bir yardımcı davet etme oranı
- Haftalık aktif çift
- Kullanıcıların uygulamayı bırakma noktaları

İlk sürümde kapsamlı üçüncü taraf analitik zorunlu değildir. Gizlilik ve maliyet gözetilerek karar ver.

---

## 16. Claude Code çalışma kuralları

Claude Code bu dokümanı ana bağlam olarak kullanmalıdır.

### 16.1 Genel davranış

- Önce mevcut repo/dosya yapısını incele; dosyaları görmeden varmış gibi varsayma.
- Kullanıcı onayı olmadan teknoloji yığınını değiştirme.
- Ürün kapsamını genişletme; önce MVP.
- Gereksiz bağımlılık ekleme.
- Çalışan kodu büyük çaplı yeniden yazmadan önce etkisini açıkla.
- Kritik kararlar belirsizse varsayım yapıp sessizce ilerlemek yerine soru sor.
- Kullanıcıya küçük ve doğrulanabilir adımlar halinde ilerleme raporu ver.
- Her değişiklikte test/lint/typecheck çalıştırılabiliyorsa çalıştır.
- Testleri çalıştıramıyorsan bunu açıkça belirt; çalıştırılmış gibi gösterme.
- Gerçek Serv00 erişimi, DB bağlantısı veya GitHub Secrets varmış gibi davranma.
- Gerçek parola, token, SSH private key veya API secret isteme.
- Kullanıcının gizli bilgilerini `.env`, commit veya log içine koyma.
- Kod ve README'de kurulum/dağıtım adımlarını güncel tut.

### 16.2 Mimari kurallar

- Backend modüler monolit olsun.
- REST API ile başla.
- Tüm düğün verileri `wedding_id` ile kapsamlandırılsın.
- Yetkilendirme backend middleware/service katmanında uygulansın.
- Yardımcı rolünün veri erişimi en az ayrıcalık prensibiyle sınırlandırılsın.
- Guest token'ı public erişim için tek başına yeterli ve dar kapsamlı olsun; sadece ilgili davetiye ve RSVP işlevine izin versin.
- Para hesaplamaları decimal/kuruş hassasiyetinde olsun.
- Taksit planı toplamı ana harcamayla eşit olsun.
- Veritabanı migration'ları kullanılsın.
- API hata ve response formatı tutarlı olsun.
- Gizli bilgiler environment variables üzerinden gelsin.

### 16.3 Kod kalitesi

- Anlamlı isimlendirme.
- Küçük ve tek sorumluluklu fonksiyonlar.
- UI, domain/business logic ve data erişimini ayır.
- Ağ çağrılarını doğrudan composable içine gömme; repository/use-case yaklaşımını ölçülü kullan.
- Her ekranın loading, empty, error ve success durumları olsun.
- Hataları sessizce yutma.
- Kullanıcıya teknik stack trace gösterme.
- Tarih, saat, para birimi ve locale işlemlerini merkezi yönet.

### 16.4 İlk çalışmada yapılacaklar

Claude Code ilk oturumda hemen tüm uygulamayı üretmeye başlamamalı. Şu sırayı izlemeli:

1. Bu dokümanı okuduğunu ve anladığını kısa maddelerle özetle.
2. Repo mevcut mu, boş mu, hangi dosyalar var incele.
3. Kesinleşmemiş kararları listele.
4. Önerilen teknoloji sürümlerini ve Serv00 uyumluluğunu doğrulamak için gerekli kontrol listesini çıkar.
5. İlk milestone için küçük bir plan sun.
6. Kullanıcı onayıyla iskelet projeyi oluştur.
7. Önce backend + DB bağlantı testi ve temel health endpoint'i.
8. Sonra auth ve wedding membership.
9. Sonra harcama/taksit.
10. Sonra guest web + RSVP.
11. Sonra helper/task/chat.
12. Sonra mobil ekranları API'ye bağla ve CI/CD'yi tamamla.

---

## 17. Karar bekleyen konular — açık liste

Bunlar konuşmada kesinleşmemiştir. Claude Code bunları kesin kabul etmemelidir. Yönetici paneli erişimi ve giriş yöntemi ise 21. bölümde kesinleştirilmiştir.

1. Serv00 PostgreSQL sürümü, host/socket ve hesapta kullanılabilirliği.
2. Serv00 Node.js uygulamasının tam çalışma dizini, Passenger ayarı ve restart yöntemi.
3. Serv00 hesabının gerçek kaynak limitleri ve deploy için SSH/SFTP yetkileri.
4. Alan adı mevcut mu; Cloudflare DNS ve proxy nasıl yapılandırılacak?
5. Cloudflare Tunnel gerekip gerekmediği (şimdilik mimarinin zorunlu parçası değil).
6. Tek repo mu, ayrı mobil/backend/web repoları mı? Tek geliştirici için monorepo önerilir, fakat karar kesin değil.
7. Çift/yardımcı kullanıcıları için nihai auth yöntemi ve oturum yenileme politikası (admin girişi için e-posta/şifre + 2FA kararı verilmiştir).
8. Çiftin ikinci üyesini davet etme akışı.
9. Bir kullanıcının birden fazla düğüne üye olabilmesi.
10. Misafirin RSVP yanıtını değiştirebilmesi ve RSVP son tarihi.
11. Davet başına refakatçi/kişi sayısı yönetimi.
12. Bir göreve birden fazla yardımcı atanabilmesi.
13. Yardımcının görev durumunu hangi seviyede değiştirebileceği.
14. Sohbetin polling mi WebSocket mi olacağı (Serv00 testine bağlı).
15. Push bildirimleri ve e-posta/SMS sağlayıcısı.
16. Harcama kategorilerinin kullanıcı tarafından özelleştirilmesi.
17. Kısmi ödeme desteği.
18. Çoklu para birimi.
19. CSV/Excel dışa aktarma.
20. Ücretsiz/premium limitleri ve tek seferlik ödeme fiyatı.
21. Ödeme sağlayıcısı ve mağaza içi satın alma gereksinimleri.
22. KVKK metinleri, saklama ve silme politikası.
23. Uygulama adı, logo, alan adı ve mağaza yayın hesapları.
24. Admin panelinin statik frontend barındırma tercihi (Serv00 statik hosting veya Cloudflare Pages; hesap ve dağıtım doğrulamasından sonra seç).
25. İlk admin hesabının güvenli bootstrap/provisioning işleminin operasyonel yöntemi.

---

## 18. Kaynak ve platform doğrulama notları

Önceki araştırmada kullanılan kaynaklar; uygulamaya başlamadan önce güncel sürümleri tekrar kontrol et:

- Serv00 ana dokümantasyon: https://docs.serv00.com/
- Serv00 Node.js dokümantasyonu: https://docs.serv00.com/
- Serv00 ürün/hizmet bilgileri: https://www.serv00.com/
- Kotlin Multiplatform: https://kotlinlang.org/multiplatform/
- Compose Multiplatform: https://www.jetbrains.com/compose-multiplatform/
- GitHub Actions: https://docs.github.com/actions
- Cloudflare DNS/proxy: https://developers.cloudflare.com/dns/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

Serv00 panelinde PostgreSQL ve Node.js uygulama ayarları doğrudan kontrol edilmeden, internet üzerindeki genel plan bilgilerini hesabın kesin özellikleri olarak kabul etme.

---

## 19. Ürün için kısa kabul kriterleri

MVP “hazır” sayılmadan önce:

- Çift kayıt olup düğün alanı oluşturabiliyor.
- Çift harcama ekleyip düzenleyebiliyor.
- Taksitler doğru aylara dağılıyor ve toplamlar matematiksel olarak tutuyor.
- Çift davetli ekleyebiliyor.
- Her davetli için güvenli davetiye bağlantısı üretilebiliyor.
- WhatsApp mesajı kullanıcının kendi uygulamasında hazırlanıyor; otomatik gönderim yapılmıyor.
- Misafir uygulama indirmeden davetiyeyi açıp RSVP verebiliyor.
- Çift RSVP sonuçlarını görebiliyor.
- Çift yardımcı davet edip görev atayabiliyor.
- Yardımcı yalnızca kendisine atanmış görevleri ve ilgili sohbetleri görebiliyor.
- Yardımcı bütçe ve davetli verilerine API üzerinden de erişemiyor.
- Başka bir düğünün ID'si kullanılarak veri okunamıyor.
- Token iptali ve rol iptali erişimi kesiyor.
- Kritik akışlar test edilmiş.
- GitHub Actions en azından backend test/build ve Android build çalıştırıyor.
- Üretim secret'ları repoda bulunmuyor.
- Veritabanı yedekleme ve geri yükleme yöntemi denenmiş.
- Misafir sayfası mobil tarayıcılarda çalışıyor.

---

## 20. Claude Code'a verilecek başlangıç talimatı

Aşağıdaki talimatı Claude Code oturumunun ilk mesajı olarak kullan:

> Bu depoda Düğünce adlı düğün planlama uygulamasını geliştireceğiz. Önce `DUGUNCE_CLAUDE_BRIEF.md` dosyasını baştan sona oku ve ürün kapsamı, roller, teknik mimari, Serv00 kısıtları, güvenlik gereksinimleri ve karar bekleyen konuları anladığını özetle.  
>
> Ben tek başıma geliştiriyorum, CachyOS kullanıyorum, Kotlin biliyorum ve yerel mobil derleme yapmak istemiyorum. Kaynak kodunu yerelde düzenleyip GitHub'a göndereceğim; derlemeler GitHub Actions üzerinde çalışacak. Mobil istemci için Kotlin Multiplatform + Compose Multiplatform, backend için Node.js + Express + TypeScript ve veritabanı için Serv00 hesabında doğrulanması şartıyla PostgreSQL tercih ediyoruz.  
>
> Uygulamanın üç rolü var: çift, yardımcı ve misafir. Yardımcı yalnızca atanmış görevlerini ve o görevlerin sohbetlerini görebilir; bütçe ve davetli listesine erişemez. Misafir uygulama indirmeden token'lı web davetiyesi üzerinden RSVP verir. WhatsApp davetleri otomatik gönderilmeyecek; kullanıcı kendi WhatsApp uygulamasından kendisi gönderecek.  
>
> İlk hedef MVP'dir. Kapsamı genişletme, ödeme sistemi/abonelik, pazaryeri, AI, oturma planı veya gelişmiş bildirimleri erkenden ekleme. Güvenlik ve backend yetkilendirmesi UI'dan önce düşünülmeli. Her düğün verisi `wedding_id` ile kapsamlandırılmalı.  
>
> İlk iş olarak mevcut repo yapısını incele, belirsiz kararları ve teknik riskleri listele, Serv00 PostgreSQL/Node.js/deploy doğrulama kontrol listesini çıkar ve küçük bir ilk milestone planı öner. Onay almadan büyük çaplı kod üretimine veya mimari değişikliğe başlama. Hiçbir zaman parola, token veya private key isteme; gerçek secret'ları koda yazma.

---

**Bu dokümanın temel ilkesi:** Düğünce'yi önce güvenli, çalışan ve gerçekten kullanılabilir bir düğün planlama MVP'si olarak çıkar. Tek geliştiricinin sürdüremeyeceği karmaşıklık ekleme; doğrulanmamış hosting özelliklerine veya ücretsiz olduğu varsayılan servislere bağımlı mimari kurma.


---

## 21. Yönetici paneli (Admin) — kararlaştırılmış mimari

### 21.1 Ürün kararı ve kapsam

Düğünce için çiftlerin mobil uygulamasından ve misafir/yardımcı web sayfalarından ayrı, web tabanlı bir yönetici paneli geliştirilecektir.

Kararlar:
- Admin paneli ayrı bir frontend uygulaması olacaktır; önerilen adres `admin.dugunce.com.tr`.
- Backend olarak mevcut Node.js + Express + TypeScript API kullanılacaktır; ayrı bir admin backend/mikroservis kurulmayacaktır.
- İlk aşamada panelin tek yöneticisi ürün sahibidir.
- Yetki altyapısı ileride destek personeli ve diğer personel rollerinin eklenmesine hazır tasarlanacaktır.
- Admin girişi e-posta + parola ve zorunlu iki aşamalı doğrulama (2FA) kullanacaktır.
- Admin hesabı için herkese açık kayıt veya normal kullanıcı hesabından otomatik admin'e yükselme olmayacaktır.
- Admin paneli ilk MVP'de temel operasyonları sunacak; gelişmiş gelir/ödeme, kampanya ve destek otomasyonları sonraki aşamalara bırakılacaktır.

### 21.2 Frontend ve dağıtım

- Admin frontend: React + TypeScript. Gereksiz SSR/karmaşıklık ekleme; ilk sürüm için statik SPA yeterlidir.
- UI masaüstü öncelikli, mobil uyumlu ve Düğünce'nin sage green / off-white / beige tasarım diliyle tutarlı olmalıdır.
- Admin frontend'i API'den ayrı derlenip dağıtılabilmelidir.
- Önerilen alan adı: `admin.dugunce.com.tr`; API: `api.dugunce.com.tr`.
- Statik frontend'in Serv00 üzerinde mi yoksa Cloudflare Pages üzerinde mi barındırılacağı henüz kesin değildir. GitHub Actions ile otomatik dağıtım öncesinde mevcut hesap/alan adı/erişim imkânları doğrulanmalı; doğrulanmamış bir özelliği varsayma.
- Admin API uçları mevcut backend içinde `/api/v1/admin/...` altında gruplanmalıdır.
- Admin frontend'e gizli API anahtarı veya R2 secret koyma. Tüm ayrıcalıklı işlemler backend üzerinden yapılmalıdır.

### 21.3 Admin kimlik doğrulama ve 2FA

Admin erişimi normal kullanıcı auth akışından mantıksal olarak ayrılmalıdır. Aynı `users` tablosu kullanılacaksa bile admin yetkisi ayrı, açık ve denetlenebilir bir üyelik/rol kaydıyla verilmelidir; e-posta adresine veya istemciden gelen role güvenilmemelidir.

Önerilen akış:
1. Admin e-posta ve parolasını girer.
2. Backend parola hash'ini doğrular.
3. Hesapta etkin TOTP 2FA varsa kısa ömürlü, henüz admin API erişimi vermeyen bir `2FA pending` aşaması oluşturulur.
4. TOTP kodu doğrulanınca admin oturumu açılır.
5. İlk kurulumda TOTP kaydı QR kodu ile eşleştirilir; etkinleştirme için doğrulama kodu istenir.
6. Tek kullanımlık kurtarma kodları üretilir; yalnızca hash'leri saklanır ve her kod bir kez kullanılabilir.

Güvenlik gereksinimleri:
- Admin hesapları için güçlü parola hash algoritması (Argon2id veya uygun güncel eşdeğeri), login rate limit ve başarısız giriş takibi.
- TOTP tabanlı 2FA (RFC 6238 uyumlu) tercih edilir. 2FA devre dışı bırakma veya sıfırlama yüksek güvence gerektiren, denetim kaydına giren işlem olmalıdır.
- Admin oturumları kısa/uygun süreli, iptal edilebilir ve güvenli cookie yaklaşımıyla korunmalıdır (`HttpOnly`, `Secure`, uygun `SameSite`; cookie tabanlı akışta CSRF koruması).
- 2FA tamamlanmadan admin endpoint'lerine erişim verilmemelidir.
- Kurtarma kodları düz metin olarak veritabanında tutulmamalıdır.
- Admin için herkese açık parola sıfırlama/hesap oluşturma uçları gelişigüzel açılmamalı; e-posta doğrulama ve güvenli hesap kurtarma akışı tasarlanmalıdır.
- İlk süper yönetici hesabı yalnızca güvenli, tek seferlik CLI/operasyonel provisioning komutuyla oluşturulmalıdır. Seed dosyasına gerçek parola veya secret yazılmamalıdır.

### 21.4 Yetki modeli ve ileride personel ekleme

İlk sürümde tek bir `SUPER_ADMIN` rolü yeterlidir; ancak backend rol/izin kontrolü genişletilebilir olmalıdır. İleride önerilen roller:
- `SUPER_ADMIN`: tüm platform yönetimi ve personel/rol yönetimi.
- `SUPPORT`: destek talepleri ve sınırlı hesap/düğün durum bilgileri; hassas içeriklere varsayılan erişim yok.
- `OPERATIONS`: sistem sağlığı, depolama ve operasyonel raporlar.
- `BILLING`: ödeme/abonelik ve fatura işlemleri; diğer özel alanlara erişim yok.

Roller backend'de izinlere (permissions) eşlenmelidir. Sadece frontend menüsünü gizlemek güvenlik değildir. Her admin API isteği backend'de admin oturumunu, rolü ve ilgili izni kontrol etmelidir. Personel ekleme, rol değiştirme ve erişim iptali yalnızca yetkili yönetici tarafından yapılmalıdır.

### 21.5 Admin paneli modülleri ve aşamalı kapsam

**İlk admin MVP'si:**
- Genel bakış: toplam kullanıcı, aktif düğün, ücretsiz/premium sayıları, yeni kayıtlar ve temel kullanım metrikleri.
- Kullanıcı yönetimi: arama, filtreleme, hesap durumu ve üyelik özeti.
- Düğün yönetimi: düğün kimliği, tarih, sahip/üyeler, görev/davetli sayıları ve durum bilgisi.
- Sistem sağlığı: API health, veritabanı bağlantı durumu, son hata/uyarı özeti, uygulama sürümü ve son başarılı yedekleme zamanı (yedekleme altyapısı kurulduktan sonra).
- Admin işlem kayıtları: yönetici kim, ne zaman, hangi işlemi yaptı.

**İkinci aşama:**
- R2 fotoğraf depolama kullanımının toplam ve düğün bazında izlenmesi.
- Ücretsiz/premium depolama kotası ve yükleme hataları.
- Abonelik/ödeme sağlayıcısı entegre edildikten sonra ödeme ve iade yönetimi.
- Destek talepleri ve kullanıcı geri bildirimleri.

**Daha sonraki aşama:**
- Promosyon kodları, kampanyalar, duyurular ve gelişmiş analitik.
- Personel daveti ve ayrıntılı rol/izin yönetimi.

Admin paneli kullanıcıların özel bütçe, görev sohbeti veya fotoğraflarını rutin olarak açıp inceleyen bir gözetim aracı olmamalıdır. Varsayılan görünüm operasyon için gerekli minimum metaveriyi göstermelidir. İçerik erişimi gerçekten destek/ güvenlik için gerekiyorsa gerekçe, kapsam ve erişen admin kayda alınmalı; erişim en az ayrıcalık ilkesine göre sınırlandırılmalıdır.

### 21.6 Admin veritabanı taslağı

Mevcut kullanıcı ve audit tablolarıyla uyumlu olacak şekilde aşağıdaki yapıyı değerlendir:

#### `admin_accounts` veya `admin_memberships`
- `id`
- `user_id` (mevcut `users` tablosuna FK; ayrı admin kimliği gerekiyorsa gerekçelendir)
- `status` (`invited`, `active`, `suspended`)
- `created_at`
- `created_by_admin_id` (nullable, ilk bootstrap için)
- `last_login_at`

#### `admin_roles`
- `id`
- `code` (ör. `SUPER_ADMIN`, `SUPPORT`)
- `name`
- `created_at`

#### `admin_permissions` ve `admin_role_permissions`
- İzin kodlarını (ör. `users.read`, `users.suspend`, `weddings.read`, `billing.manage`, `admins.manage`) rol bazında tanımlar.
- İzin kontrolü backend middleware/service katmanında uygulanır.

#### `admin_user_roles`
- `admin_account_id`
- `role_id`
- `assigned_by_admin_id`
- `created_at`

#### `admin_mfa_factors`
- `id`
- `admin_account_id`
- `factor_type` (ilk sürümde `totp`)
- `secret_encrypted` (TOTP secret düz metin saklanmamalı; uygulama anahtarı/veri şifreleme yaklaşımı belirlenmeli)
- `confirmed_at`
- `created_at`

#### `admin_recovery_codes`
- `id`
- `admin_account_id`
- `code_hash`
- `used_at` (nullable)
- `created_at`

#### `admin_sessions` (veya güvenli session store)
- `id`
- `admin_account_id`
- `session_token_hash`
- `created_at`
- `expires_at`
- `revoked_at`
- `last_seen_at`
- `ip_hash` ve `user_agent_summary` gibi asgari güvenlik metaverileri (gereksiz kişisel veri toplama)

#### `admin_audit_logs`
- `id`
- `admin_account_id`
- `action`
- `target_type`
- `target_id`
- `reason` (özellikle hassas/istisnai erişimlerde)
- `metadata` (parola, token, MFA secret veya özel içerik içermemeli)
- `ip_hash` (gerekiyorsa)
- `created_at`

Bu şema başlangıç taslağıdır. Uygulama mevcut `users`, `audit_logs` ve session mimarisini inceledikten sonra gereksiz tekrar oluşturmadan migration tasarlamalıdır. TOTP secret'ları ve session token'ları asla düz metin saklanmamalıdır.

### 21.7 Önerilen admin API uçları

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/verify-2fa`
- `POST /api/v1/admin/auth/logout`
- `POST /api/v1/admin/auth/mfa/enroll`
- `POST /api/v1/admin/auth/mfa/confirm`
- `POST /api/v1/admin/auth/mfa/recovery`
- `GET /api/v1/admin/me`
- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/:id`
- `POST /api/v1/admin/users/:id/suspend` (izin + gerekçe + audit)
- `GET /api/v1/admin/weddings`
- `GET /api/v1/admin/weddings/:id`
- `GET /api/v1/admin/system/health`
- `GET /api/v1/admin/audit-logs`

Sonraki aşama uçları: `/storage`, `/subscriptions`, `/payments`, `/support`, `/announcements`, `/admins` ve `/roles`. Uçları ihtiyaç oluşmadan topluca geliştirme. Her endpoint için permission kontrolü, doğrulama, rate limit ve audit gereksinimini tanımla.

### 21.8 Admin kabul kriterleri ve testler

- Normal bir kullanıcı admin paneline veya admin API'lerine erişemez.
- Admin hesabı herkese açık kayıtla oluşturulamaz.
- Parola doğrulaması sonrası 2FA tamamlanmadan yönetim verisi döndürülmez.
- Geçersiz/tekrar kullanılan kurtarma kodu reddedilir.
- Admin oturumu logout, süre aşımı veya yönetici tarafından iptal ile geçersiz olur.
- Yetkisiz rol/izin kombinasyonları backend'de reddedilir; frontend'i atlayarak doğrudan API çağrısı yapmak erişim sağlamaz.
- Kullanıcı askıya alma, rol değiştirme ve hassas veri erişimi gibi kritik işlemler audit log üretir.
- Audit log içinde parola, token, TOTP secret, kurtarma kodu veya hassas kullanıcı içeriği bulunmaz.
- Admin paneli çiftin bütçe/sohbet/fotoğraf içeriğini varsayılan olarak göstermez.
- Dashboard metrikleri gerçek veritabanı sorgularından gelir; demo/sahte sayılar üretim ekranında gösterilmez.
- Sistem health endpoint'i secret, bağlantı dizesi veya iç altyapı ayrıntısı sızdırmaz.
- Admin frontend'de saklanan hiçbir değer backend yetkisinin yerine geçmez.

### 21.9 Claude Code için admin geliştirme talimatı

Admin panelini planlarken önce mevcut repo, auth, `users`, session ve audit yapısını incele. Bu bölümdeki kararları uygula; admin yetkisini yalnızca frontend'de kontrol etme. İlk aşamada tek SUPER_ADMIN hesabı ve e-posta/parola + TOTP 2FA akışını kur. İlk admin'i güvenli tek seferlik provisioning komutuyla oluştur. Personel rolleri için genişletilebilir RBAC tasarla ancak ilk sürümde gereksiz rol ekranları geliştirme. Admin frontend'i React + TypeScript statik uygulama olarak ayrı tut; hosting hedefini doğrulamadan Cloudflare Pages veya Serv00 özelliğini varsayma. Önce tehdit modeli, veri modeli, migration, auth akışı ve test planı sun; onay almadan mevcut kullanıcı auth sistemini veya veri modelini kökten değiştirme.


### 20.1 Başlangıç talimatına admin paneli eki

> Ayrıca 21. bölümdeki Düğünce Admin Paneli kararlarını uygula. Admin paneli ayrı React + TypeScript web uygulaması ve `admin.dugunce.com.tr` adresi için tasarlanacaktır; mevcut Node.js API üzerinde `/api/v1/admin` uçlarını kullanacaktır. İlk yönetici ürün sahibidir; personel rolleri için genişletilebilir RBAC altyapısı hazırlanmalıdır. Admin girişi e-posta/şifre + zorunlu TOTP 2FA kullanmalıdır. İlk admin güvenli tek seferlik provisioning ile oluşturulmalı, herkese açık admin kaydı olmamalıdır. 2FA tamamlanmadan admin API erişimi verme. Tüm kritik admin işlemlerini denetim kaydına al. Admin paneli kullanıcıların özel bütçe, görev sohbeti veya fotoğraf içeriklerini varsayılan olarak göstermemelidir. Önce mevcut auth/session/audit mimarisini incele ve öneri sun; onay almadan büyük refaktör yapma.
