# Yedekleme ve Geri Yükleme

> **Bağlayıcı kural:** `SECURITY.md` §1.5 — "Yedek alındığını söylemek, verinin kurtarılabileceği anlamına gelmez."

---

## İlkeler

| Kural | Sebep |
|---|---|
| Yedek **şifreli** | Düğün verisi kişisel veri (KVKK) |
| Yedek **ayrı konumda** | serv00 hesabı silinirse yedek de gitmesin |
| Yedek **doğrulanır** | Bozuk yedek, yedek değildir |
| Geri yükleme **denenir** | SECURITY test 12 — gerçekten çalışmalı |
| Sağlayıcı yedeğine **güvenilmez** | serv00 7 gün tutar, sonra siler |

---

## Günlük yedek

### Gerekli ortam değişkenleri

```bash
export DATABASE_URL='postgres://kullanici:sifre@pgsqlX.serv00.com:5432/dugunce_prod'
export BACKUP_GPG_PASSPHRASE='<güçlü-rastgele-parola>'
```

> `BACKUP_GPG_PASSPHRASE` **ayrı bir yerde** saklanmalı — yedek dosyasıyla aynı yerde olmamalı. Aksi halde şifreleme anlamsız.

### Çalıştırma

```bash
./scripts/backup-db.sh
```

Yaptığı:
1. `pg_dump --format=custom` → geçici dump
2. GPG AES256 ile şifrele
3. Şifresiz kopyayı sil
4. **Yedeği açıp doğrula** (`pg_restore --list`)
5. 30 günden eski yedekleri sil

Çıktı: `backups/dugunce-YYYYMMDD-HHMMSS.dump.gpg`

### Otomatikleştirme (serv00 crontab)

```cron
# Her gün 03:00 UTC
0 3 * * * cd ~/dugunce && BACKUP_GPG_PASSPHRASE='...' DATABASE_URL='...' ./scripts/backup-db.sh >> ~/backup.log 2>&1
```

### Offsite kopya

Yedek serv00'da kalırsa hesap silindiğinde gider. Günlük olarak dışarı kopyalanmalı:

```bash
# Yerel makineden çekme
rsync -avz --delete \
  LOGIN@sX.serv00.com:~/dugunce/backups/ \
  ~/dugunce-backups/
```

---

## Geri yükleme

### Test ortamına (güvenli)

```bash
export DATABASE_URL='postgres://...@pgsqlX.serv00.com:5432/dugunce_stage'
export BACKUP_GPG_PASSPHRASE='...'
./scripts/restore-db.sh backups/dugunce-20261102-030000.dump.gpg
```

### Üretime (dikkatli)

```bash
# Script "evet" yazmanızı ister
./scripts/restore-db.sh backups/dugunce-20261102-030000.dump.gpg
```

Script şunları yapar:
1. Şifreyi çöz
2. Dump bütünlüğünü doğrula
3. `pg_restore --clean --if-exists` (mevcut nesneleri siler)
4. `users` sayısını ve Türkçe karakterleri doğrula

> ⚠️ `--clean` mevcut veriyi siler. Üretimde çalıştırmadan önce **o an yeni bir yedek** alın.

---

## Geri yükleme testi (zorunlu)

`SECURITY.md` test 12: **"Gerçek yedekten test ortamına veriler geri yüklenebiliyor."**

Her ay en az bir kez:

1. Üretimden yedek al
2. Staging'e geri yükle
3. Doğrula: `users` sayısı, bir düğün kaydı, Türkçe karakter
4. Sonucu `docs/BACKUP-TEST-LOG.md`'ye yaz

---

## Saklama politikası

| Veri | Süre | Nerede |
|---|---|---|
| Günlük yedek | 30 gün | serv00 `~/dugunce/backups/` |
| Aylık yedek | 12 ay | offsite (yerel makine / harici disk) |
| Silinen düğün verisi | Yedeklerde 90 gün sonra temizlenir | — |

> KVKK: Kullanıcı silme talebi geldiğinde, yedeklerdeki kopya da saklama süresi sonunda temizlenir. Bu süre aydınlatma metninde yazılmalı.

---

## Felaket senaryoları

| Senaryo | Müdahale |
|---|---|
| Tablo yanlışlıkla silindi | Son yedeği staging'e yükle, eksik veriyi kopyala |
| Veritabanı bozuldu | Son yedeği üretime yükle |
| serv00 hesabı kapatıldı | Yedekten yeni sağlayıcıya taşı (backend taşınabilir yazıldı) |
| Yedek şifresi kayboldu | **Yedek kurtarılamaz** — parola ayrı yerde saklanmalı |

---

## Yapılmaması gerekenler

- ❌ Şifresiz yedek almak
- ❌ Yedeği serv00 dışına kopyalamamak
- ❌ Yedeği hiç test etmemek
- ❌ `BACKUP_GPG_PASSPHRASE`'i yedekle aynı yerde saklamak
- ❌ Geri yüklemeden önce yeni yedek almamak
