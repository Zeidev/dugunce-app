# Aşama 3 — Kapanış Kaydı

**Tarih:** 2026-11-02
**Plan:** `docs/superpowers/plans/2026-11-02-stage-3-budget.md`
**Durum:** ✅ Tamamlandı (9 plan görevi + 1 boşluk kapatma = 10)

---

## Tamamlanan görevler

| # | Görev | Test | Durum |
|---|---|---|---|
| 1 | Para tipi ve aritmetiği (kuruş) | 23 | ✅ |
| 2 | Taksit planı (ay hesabı, ay sonu) | 21 | ✅ |
| 3 | Bütçe şeması (5 tablo) + migration | 23 | ✅ |
| 4 | Harcama servisi | 21 | ✅ |
| 5 | Taksit güncelleme koruması | 14 | ✅ |
| 6 | Bütçe özeti (çift sayım önleme) | 9 | ✅ |
| 7 | Drizzle store | 10 | ✅ |
| 8 | HTTP route'ları | 8 | ✅ |
| **10** | **Taksit ödeme durumu (plandan sapma)** | **12** | ✅ |
| 9 | Kapanış kontrolü | — | ✅ |

**Aşama 3 toplamı: 141 test** (Aşama 2 sonu 230 → **371**)

---

## Kabul listesi — her madde kanıta bağlı

| Kabul maddesi | Kanıt |
|---|---|
| Para `bigint` kuruş, float yok | `schema.ts` tüm para kolonları `bigint`. `money.ts` yalnızca `BigInt` aritmetiği; `parseFloat`/`Math.round` yok. Test: `money.test.ts` 23 test |
| Taksit toplamı = harcama toplamı | `buildInstallmentPlan` testi + `createExpense` "taksit toplamı = harcama tutarı" (Review Focus #1) + fuzz testi |
| Yuvarlama farkı **son** taksite | `installment-plan.test.ts` → "yuvarlama farkı son taksite" (Review Focus #1) |
| Ay sonu taşması yok (31 Oca → Şub) | `addMonthsSafe` → 31 Ocak + 1 ay = **28** (artık yılda 29). 9 ayrı test (Review Focus #3) |
| İlk taksit ayı satın alma tarihinden farklı olabilir | `buildInstallmentPlan` → "ilk taksit ayı satın alma tarihinden farklı olabilir" (Review Focus #2) |
| Ödenmiş taksit sessizce değiştirilemez | `update-protection.test.ts` 14 test: taksit sayısı / tutar / ilk ay reddedilir, başlık serbest (Review Focus #5) |
| Taksit ödendi → `paid_at` saklanır | `payment.test.ts` 6 + `store-payment.test.ts` 6 (gerçek Drizzle + PGlite). **Bu madde plan boşluğuydu — Task 10 ile kapatıldı** |
| Soft delete, listede görünmez | `store.test.ts` → "soft delete sonrası harcama görünmez ama kayıt durur" |
| Özet: toplam ≠ bu ay (çift sayım yok) | `summary.test.ts` 9 test: 12.000 TL / 4 taksit → toplam 12.000, bu ay 3.000 (Review Focus #4) |
| Composite FK yanlış `wedding_id`'yi reddeder | `store.test.ts` → "COMPOSITE FK: yanlış wedding_id ile taksit yazılamaz" |
| Tüm testler geçiyor | `29 dosya, 371 passed, 9 skipped (380)` |
| Typecheck temiz | `tsc --noEmit` → 0 hata; `npm run build` → 0 hata |

---

## Review Focus — 5/5 kapatıldı

| # | Kırılma noktası | Nasıl kapatıldı |
|---|---|---|
| 1 | **Taksit toplamı harcamayı tutmaz** (kuruş kaybı) | Kalan kuruş **son** taksite eklenir. Fuzz testi: 1–36 taksit × rastgele tutarlar → toplam her zaman korunur |
| 2 | **İlk taksit ayı yanlış hesaplanır** | `firstInstallmentMonth` taksit > 1 ise **zorunlu**; taksit = 1 ise satın alma tarihinden türetilir. Ayrı test |
| 3 | **Ay sonu taşması** (31 Oca → 3 Mar) | `addMonthsSafe` günü hedef ayın son gününe kırpar. 9 test (artık yıl dahil) |
| 4 | **Çift sayım** — toplam ile bu ay karışır | `BudgetSummary` üç AYRI alan: `totalSpentKurus`, `dueThisMonthKurus`, `remainingCommitmentKurus`. Test: 4 taksitli 12.000 TL → toplam 12.000 (3.000 değil) |
| 5 | **Ödenmiş taksit sessizce değişir** | Taksit sayısı / tutar / ilk ay değişikliği **reddedilir** (409). Başlık/açıklama serbest. Kullanıcı önce ödemeyi geri almalı — bilinçli sürtünme |

---

## Plandan sapma — kapatılan boşluk

**Sorun:** Task 5 "ödenmiş taksiti koru" diyordu, ama Aşama 3'te **hiçbir görev bir taksiti ödenmiş işaretlemiyordu**. `status='PAID'` ve `paid_at` üretimde erişilemezdi; dolayısıyla:

- Kabul maddesi "taksit ödendi → `paid_at` saklanır" **karşılanamıyordu**
- Task 5'in koruma kodu **ölü koddu** — hiçbir taksit PAID olamayacağı için koruma hiç tetiklenmezdi
- Tasarım spesifikasyonunda da yazma yolu yoktu (yalnızca `GET /installments` listeleniyordu)

**Çözüm — Task 10** (`setInstallmentPaid` + `PATCH /weddings/:weddingId/installments/:installmentId`):

- **İdempotent:** zaten hedef durumdaysa yazma yapılmaz, `paid_at` korunur. Ağ tekrar denemesi ilk ödeme tarihini ezmemeli
- **Geri alma:** `paid: false` → `paid_at = NULL`, Task 5 koruması yeniden devreye girer
- **İki savunma hattı:** `findInstallment` üyelik join'i + `UPDATE`'te ayrıca SQL `EXISTS` kontrolü

**Neden sessizce atlanmadı:** SECURITY.md ve tasarım spesifikasyonu bu davranışı tanımlıyor (`paid_at` kolonu, `PENDING|PAID` durumu). Plan bunu uygulanamaz bırakıyordu. Karar dokümana yazıldı, sonra kodlandı.

---

## Yol boyunca bulunan gerçek test sorunu

**`store.test.ts` ham SQL çalıştırıyor, Drizzle store'unu test etmiyordu.**

Bu testler migration'ları ve şema kısıtlarını (composite FK, CASCADE) doğruluyor — değerli — ama `drizzleExpenseDeps()` içindeki üyelik join'ini **kanıtlamıyordu**.

Bunu **negatif kontrol** ortaya çıkardı: `findInstallment`'tan üyelik join'ini kaldırdım, testler **yine de geçti**. Yani join silinse kimse fark etmezdi.

**Düzeltme:** `store-payment.test.ts` eklendi — gerçek Drizzle store'u PGlite üzerinde çalıştırır. Store'a `dbOverride` parametresi eklendi (test enjeksiyonu). Negatif kontrol tekrarlandı, bu sefer **doğru hedefle**:

- `findInstallment` join'i kaldırıldı → IDOR testi **kırıldı** ✅
- `markInstallmentPaid` `EXISTS` kontrolü kaldırıldı → savunma derinliği testi **kırıldı** ✅

**Ayrıca yakalanan hata:** İlk negatif kontrol denemem yanlış yeri bozdu — aradığım kod parçası dosyada **4 kez** geçiyordu, `replace` ilk eşleşmeyi (başka bir fonksiyon) değiştirdi ve test yine geçti. Bu sessiz bir yanlış pozitifti; segment hedefleyerek düzelttim. Negatif kontrolün kendisi de yanılabilir — bu yüzden "test kırıldı mı" kadar "**doğru yeri mi bozdum**" da kontrol edilmeli.

---

## Doğrulanan davranışlar

### Para aritmetiği
- ✅ `1_200_050n` → `"12.000,50 TL"` (Türkçe format)
- ✅ `"12.000,50"` ve `"12000.50"` aynı kuruşu verir
- ✅ Negatif / boş / geçersiz tutar reddedilir
- ✅ `Number` yerine `string` → float hatası taşınmaz
- ✅ `MAX_INSTALLMENTS = 36`

### Taksit planı
- ✅ 4 taksit × 12.000 TL → 4 × 3.000 TL
- ✅ Kalan kuruş son taksite
- ✅ Aylar sıralı, yıl geçişi doğru
- ✅ 31 Oca + 1 ay = Şubat (28/29), 31 Mar + 1 ay = Nisan (30)
- ✅ 36 taksit desteklenir, 0 reddedilir

### Bütçe özeti
- ✅ `totalSpentKurus` taksitleri **tekrar saymaz**
- ✅ `dueThisMonthKurus` yalnızca seçilen ay
- ✅ `remainingCommitmentKurus` sonraki aylar
- ✅ Taraf (BRIDE/GROOM/SHARED) ve kategori kırılımı
- ✅ Aylık taksit takvimi
- ✅ Tüm sorgular `weddingId + userId` ile (IDOR koruması)

### Ödeme durumu (Task 10)
- ✅ PAID → `paid_at = now()`
- ✅ PENDING → `paid_at = NULL`
- ✅ İdempotent: tekrar PAID → `paid_at` **değişmez**
- ✅ Yabancı taksit → `null` (404), DB'de değişiklik yok
- ✅ Silinmiş harcamanın taksiti işaretlenemez
- ✅ **Negatif kontrol yapıldı** — her iki savunma hattı ayrı ayrı kanıtlandı

---

## ⏳ Bekleyen (Aşama 3 dışı)

| Konu | Neden bekliyor |
|---|---|
| Brevo gerçek gönderim | Nameserver yayılımı (24-48 saat) |
| `api.dugunce.com.tr` | serv00 kurulumu + DNS |
| CI'da gerçek PostgreSQL | Repo GitHub'a push edilmedi |
| `expense_categories` varsayılan seed | Aşama 4-6'da UI ile birlikte |

---

## Sonraki adım

**Aşama 4 — Davetli ve RSVP** (`stage-4-guests.md`)

Davetli modeli, davetiye token'ları, public RSVP sayfası, idempotency.

**Aşama 2.5 — Satın alma** ertelendi: limitler (30 davetli / 1 yardımcı / 1 görev) Aşama 4-5'te anlam kazanacak. Şimdi satın alma eklemek, kapısı olmayan bir kilit olurdu.

---

## Kod istatistiği

| Metrik | Değer |
|---|---|
| Test sayısı | **371** (Aşama 2: 230) → **+141** |
| Test dosyası | 29 |
| Aşama 3 kaynak satırı | 1.476 |
| Tablo | **11** (Aşama 2: 6) → +5 |
| Route | 7 yeni endpoint |
