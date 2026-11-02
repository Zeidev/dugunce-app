#!/usr/local/bin/bash
# Davetly — şifreli veritabanı yedeği
#
# Kullanım:
#   BACKUP_GPG_PASSPHRASE='...' ./scripts/backup-db.sh [--keep-days N]
#
# Gerekli ortam değişkenleri:
#   DATABASE_URL           — PostgreSQL bağlantı dizesi
#   BACKUP_GPG_PASSPHRASE  — yedeği şifreleyecek parola (AYRI saklanmalı!)
#
# Çıktı: backups/davetly-YYYYMMDD-HHMMSS.dump.gpg
#
# SECURITY §1.5: Yedek şifreli olmalı ve erişimi kısıtlı olmalı.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL tanımlı değil}"
: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE tanımlı değil — yedek şifrelenmeli}"

KEEP_DAYS="${KEEP_DAYS:-30}"
if [ "${1:-}" = "--keep-days" ] && [ -n "${2:-}" ]; then
  KEEP_DAYS="$2"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../backups}"
TIMESTAMP="$(date -u '+%Y%m%d-%H%M%S')"
BASENAME="davetly-${TIMESTAMP}.dump"
PLAIN_PATH="${BACKUP_DIR}/${BASENAME}"
ENC_PATH="${PLAIN_PATH}.gpg"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "=========================================="
echo " Davetly — veritabanı yedeği"
echo " Tarih: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "=========================================="

# --- 1. Dump ---
echo ""
echo "[1/4] pg_dump çalışıyor (custom format)"

if ! pg_dump --format=custom --no-owner --no-acl --file="$PLAIN_PATH" "$DATABASE_URL" 2>/tmp/pgdump.err; then
  echo "  ❌ pg_dump başarısız:"
  sed 's/^/     /' /tmp/pgdump.err | head -5
  rm -f "$PLAIN_PATH"
  exit 1
fi

DUMP_SIZE=$(wc -c < "$PLAIN_PATH" | tr -d ' ')
echo "  ✅ Dump oluştu: $(echo "scale=1; $DUMP_SIZE/1024" | bc) KB"

if [ "$DUMP_SIZE" -lt 1024 ]; then
  echo "  ❌ Dump çok küçük ($DUMP_SIZE bayt) — bozuk olabilir"
  rm -f "$PLAIN_PATH"
  exit 1
fi

# --- 2. Şifrele ---
echo ""
echo "[2/4] GPG ile şifreleniyor (AES256)"

if ! gpg --batch --yes --quiet \
    --symmetric --cipher-algo AES256 \
    --passphrase-fd 0 \
    --output "$ENC_PATH" "$PLAIN_PATH" <<< "$BACKUP_GPG_PASSPHRASE" 2>/tmp/gpg.err; then
  echo "  ❌ Şifreleme başarısız:"
  sed 's/^/     /' /tmp/gpg.err | head -5
  rm -f "$PLAIN_PATH" "$ENC_PATH"
  exit 1
fi

rm -f "$PLAIN_PATH"   # şifresiz kopya bırakma
chmod 600 "$ENC_PATH"
echo "  ✅ Şifreli yedek: $ENC_PATH"

# --- 3. Doğrula ---
echo ""
echo "[3/4] Yedek bütünlüğü doğrulanıyor"

if ! gpg --batch --quiet --passphrase-fd 0 --decrypt "$ENC_PATH" 2>/dev/null <<< "$BACKUP_GPG_PASSPHRASE" \
     | pg_restore --list >/dev/null 2>&1; then
  echo "  ❌ Yedek okunamıyor — bozuk veya parola yanlış"
  exit 1
fi
echo "  ✅ Yedek okunabilir ve pg_restore listesi alınabiliyor"

# --- 4. Eski yedekleri temizle ---
echo ""
echo "[4/4] ${KEEP_DAYS} günden eski yedekler siliniyor"

DELETED=$(find "$BACKUP_DIR" -name 'davetly-*.dump.gpg' -type f -mtime "+${KEEP_DAYS}" -print -delete | wc -l | tr -d ' ')
echo "  ✅ ${DELETED} dosya silindi"

REMAINING=$(find "$BACKUP_DIR" -name 'davetly-*.dump.gpg' -type f | wc -l | tr -d ' ')
echo "  ℹ️  Kalan yedek sayısı: ${REMAINING}"

echo ""
echo "=========================================="
echo " 🎉 Yedek başarılı: ${ENC_PATH}"
echo " ⚠️  Bu dosyayı AYRI bir konuma kopyalayın (offsite)."
echo "=========================================="
