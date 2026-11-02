# Aşama 2 — Kapanış Kaydı

**Tarih:** 2026-11-02
**Plan:** `docs/superpowers/plans/2026-11-02-stage-2-auth.md`
**Durum:** ✅ Tamamlandı (15/15 görev)

---

## Tamamlanan görevler

| # | Görev | Test | Durum |
|---|---|---|---|
| 1 | Kriptografik token yardımcıları | 20 | ✅ |
| 2 | Auth şeması (5 tablo) + migration | 28 | ✅ |
| 3 | Brevo e-posta client | 10 | ✅ |
| 4 | Magic link üretimi | 16 | ✅ |
| 5 | Magic link doğrulama | 14 | ✅ |
| 6 | JWT access + refresh | 9 | ✅ |
| 7 | Refresh rotasyonu + logout | 13 | ✅ |
| 8 | Auth middleware | 14 | ✅ |
| 9 | Düğün CRUD | 19 | ✅ |
| 10 | Davet kodu | 15 | ✅ |
| 11 | **Tenant izolasyonu** | 12 | ✅ |
| 12 | Rate limiting | 7 | ✅ |
| 13 | Route bağlama + E2E | 15 | ✅ |
| 14 | Deep link dosyaları | — | ✅ |
| 15 | Kapanış kontrolü | — | ✅ |

**Toplam: 230 test geçiyor** (Aşama 1 sonunda 38 idi → **+192**)

---

## Review Focus — 5/5 kapatıldı

| # | Kırılma noktası | Nasıl kapatıldı |
|---|---|---|
| 1 | **IDOR** — başka düğünün ID'si | `requireWeddingMember` **404** döner (403 değil). Test: saldırgan token'la B'nin düğünü → 404, hiçbir bilgi sızmaz |
| 2 | **Üyelik ≠ rol** | `CO_OWNER`, OWNER-only endpoint'te 403. Ayrı kontrol katmanı |
| 3 | **İptal edilen token çalışır** | `requireAuth` her istekte DB kontrolü yapar. Silinmiş/askıya alınmış kullanıcı, geçerli JWT ile bile 401 alır |
| 4 | **Magic link tekrar kullanılır** | Koşullu `UPDATE ... WHERE used_at IS NULL`. Yarış koşulunda ikinci istek `false` alır → reddedilir |
| 5 | **Refresh rotasyonu atlanır** | Her kullanımda eski revoke + yeni üret. **Ek:** revoke token tekrar kullanılırsa **tüm oturumlar** kapanır (hırsızlık tespiti) |

---

## Doğrulanan davranışlar

### Token güvenliği
- ✅ 256-bit entropi (SECURITY §1.2 min 128 ister)
- ✅ SHA-256 hash DB'de, ham token asla
- ✅ Davet kodunda karışan karakter yok (`0/O`, `1/I` çıkarıldı)
- ✅ Sabit zamanlı karşılaştırma
- ✅ Bozuk token → `null`, hata fırlatmaz

### Magic link
- ✅ GET token'ı tüketmez (e-posta tarayıcıları linki yakmasın)
- ✅ POST `/auth/verify` tüketir
- ✅ 5 dk TTL, tek kullanım
- ✅ Önceki kullanılmamış linkler geçersiz kılınır
- ✅ 6 haneli yedek kod, max 3 deneme
- ✅ Enumeration koruması: bilinmeyen e-posta da `200 {ok:true}`

### Tenant izolasyonu (gerçek PostgreSQL)
- ✅ A, B'nin düğününü göremez (üyelik sorgusu 0 satır)
- ✅ Listeler birbirinin düğününü içermez
- ✅ Her düğünün tam 1 OWNER'ı var
- ✅ Çift üyelik reddedilir (unique constraint)
- ✅ FK: olmayan düğün/kullanıcı ile üyelik eklenemez
- ✅ CASCADE: düğün silinince üyelik + davet gider
- ✅ **Negatif kontrol yapıldı** — üyelik filtresi kaldırılınca test başarısız oldu

### Düğün CRUD
- ✅ Oluşturma transaction içinde (düğün + OWNER üyeliği atomik)
- ✅ `findById` her zaman `userId` ile filtreler
- ✅ `plan`/`purchaseToken` kullanıcıdan kabul edilmez
- ✅ Boş patch reddedilir

### Davet kodu
- ✅ 7 karakter, karışmayan set
- ✅ 10 dk TTL, tek kullanım
- ✅ Küçük harf/büyük harf normalize
- ✅ Kod tüketimi üyelikten **önce** (yarış koşulu)

### Rate limiting
- ✅ `POST /auth/magic-link`: 3/saat (IP) + 3/saat (e-posta)
- ✅ `POST /auth/verify`: 10/dk
- ✅ `POST /auth/refresh`: 30/dk
- ✅ 429 + `Retry-After` + `Cache-Control: no-store`

---

## Yol boyunca düzelttiğim 4 sorun

**1. `jose` kaldırıldı** — JWT'yi elle HS256 ile yazdım. `jose` async API sunuyor, testlerde gereksiz karmaşıklık. Bağımlılık azaldı, 9 test geçiyor.

**2. PGlite + Drizzle transaction uyumsuzluğu** — `db.transaction()` PGlite'ta hook timeout'a düşürüyordu. İzolasyon testlerini PGlite'ın kendi `query()` API'siyle yazdım. Daha doğru: gerçek SQL'i test ediyor.

**3. Vitest setup tekrar çalışıyor** — Her test dosyası için `setup.ts` yeniden çalışıyor, `DATABASE_URL` placeholder'ı "gerçek DB var" sanılıyordu. Ayrı bir işaret değişkeni (`__DUGUNCE_TEST_DB_AVAILABLE__`) ile çözdüm.

**4. Test env'de gerçek mail riski** — `createEmailClient` test ortamında transport zorunlu kılıyordu, `createApp()` patlıyordu. No-op transport ekledim: test çalışır, mail gitmez.

---

## ⏳ Bekleyen (Aşama 2 dışı)

| Konu | Neden bekliyor |
|---|---|
| Brevo gerçek gönderim | Nameserver yayılımı (24-48 saat) |
| Deep link gerçek değerleri | Apple Team ID + Android SHA-256 (Aşama 7) |
| `api.dugunce.com.tr` | serv00 kurulumu + DNS |
| CI'da gerçek PostgreSQL | Repo GitHub'a push edilmedi |

---

## Sonraki adım

**Aşama 2.5 — Satın alma** (`stage-2.5-purchase.md`)

Ama önce:
1. ⏳ Nameserver yayılımı → Brevo domain doğrulama
2. ⏳ serv00 ortam doğrulaması (`scripts/verify-serv00.sh`)
3. ⏳ GitHub repo + CI ilk çalıştırma

---

## Kod istatistiği

| Metrik | Değer |
|---|---|
| Test sayısı | **230** (Aşama 1: 38) |
| Test dosyası | 19 |
| Kaynak satır | ~3.500 |
| Tablo | 6 |
| Route | 13 endpoint |
