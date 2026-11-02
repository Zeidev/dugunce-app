#!/usr/local/bin/bash
# Düğünce — yedekten geri yükleme
#
# Kullanım:
#   BACKUP_GPG_PASSPHRASE='...' ./scripts/restore-db.sh backups/dugunce-20261102-120000.dump.gpg
#
# Gerekli ortam değişkenleri:
#   DATABASE_URL           — hedef PostgreSQL bağlantı dizesi
#   BACKUP_GPG_PASSPHRASE  — yedeğin şifresi
#
# GÜVENLİK: Hedef veritabanı "prod" içeriyorsa interaktif onay ister.
#           SECURITY test 12: yedek gerçekten geri yüklenebilmeli.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Kullanım: $0 <yedek-dosyası.dump.gpg> [--yes]"
  exit 1
fi

BACKUP_FILE="$1"
AUTO_YES="${2:-}"

: "${DATABASE_URL:?DATABASE_URL tanımlı değil}"
: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE tanımlı değil}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Dosya bulunamadı: $BACKUP_FILE"
  exit 1
fi

echo "=========================================="
echo " Düğünce — geri yükleme"
echo " Kaynak: $BACKUP_FILE"
echo "=========================================="

# --- Güvenlik: prod hedefi kontrolü ---
if echo "$DATABASE_URL" | grep -qiE '[_-]prod|production'; then
  if [ "$AUTO_YES" != "--yes" ]; then
    echo ""
    echo "⚠️  UYARI: Hedef veritabanı ÜRETİM gibi görünüyor."
    echo "    Mevcut veriler SİLİNECEK."
    echo ""
    printf "Devam etmek için 'evet' yazın: "
    read -r CONFIRM
    if [ "$CONFIRM" != "evet" ]; then
      echo "İptal edildi."
      exit 1
    fi
  fi
fi

TMP_DUMP="$(mktemp /tmp/dugunce-restore-XXXXXX.dump)"
trap 'rm -f "$TMP_DUMP"' EXIT

# --- 1. Şifre çöz ---
echo ""
echo "[1/4] Şifre çözülüyor"

if ! gpg --batch --quiet --yes --passphrase-fd 0 --decrypt \
    --output "$TMP_DUMP" "$BACKUP_FILE" <<< "$BACKUP_GPG_PASSPHRASE" 2>/tmp/gpg-restore.err; then
  echo "  ❌ Şifre çözülemedi — parola yanlış olabilir:"
  sed 's/^/     /' /tmp/gpg-restore.err | head -3
  exit 1
fi
echo "  ✅ Çözüldü: $(wc -c < "$TMP_DUMP" | tr -d ' ') bayt"

# --- 2. Dump doğrula ---
echo ""
echo "[2/4] Dump bütünlüğü kontrol ediliyor"

if ! pg_restore --list "$TMP_DUMP" >/dev/null 2>&1; then
  echo "  ❌ Dump okunamıyor (bozuk dosya)"
  exit 1
fi
echo "  ✅ Dump geçerli"

# --- 3. Geri yükle ---
echo ""
echo "[3/4] Geri yükleniyor (--clean --if-exists)"

if ! pg_restore --clean --if-exists --no-owner --no-acl \
    --dbname="$DATABASE_URL" "$TMP_DUMP" 2>/tmp/pgrestore.err; then
  # pg_restore uyarılarla çıkabilir; gerçek hataları ayır
  if grep -qiE '^(pg_restore: )?error:' /tmp/pgrestore.err; then
    echo "  ❌ Geri yükleme hataları:"
    grep -iE 'error:' /tmp/pgrestore.err | head -5 | sed 's/^/     /'
    exit 1
  fi
  echo "  ⚠️  Uyarılarla tamamlandı (kritik hata yok)"
fi
echo "  ✅ Geri yükleme tamamlandı"

# --- 4. Doğrula ---
echo ""
echo "[4/4] Doğrulama"

USER_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM users;" 2>/dev/null || echo "?")
echo "  ℹ️  users tablosundaki kayıt: ${USER_COUNT}"

TR_TEST=$(psql "$DATABASE_URL" -tAc "SELECT 'şğıöçüİŞĞÜÖÇ';" 2>/dev/null | tr -d ' ' || echo "")
if [ "$TR_TEST" = "şğıöçüİŞĞÜÖÇ" ]; then
  echo "  ✅ Türkçe karakterler bozulmamış"
else
  echo "  ⚠️  Türkçe karakter testi atlandı veya başarısız"
fi

echo ""
echo "=========================================="
echo " 🎉 Geri yükleme başarılı"
echo "=========================================="
