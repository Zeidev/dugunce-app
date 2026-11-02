#!/bin/bash
# Migration'ları serv00 üzerinden çalıştır.
#
# Neden serv00'dan: pg_hba.conf dış IP'leri reddediyor (doğrulandı:
# "no pg_hba.conf entry for host ..."). PostgreSQL'e yalnızca serv00'un
# kendi sunucusundan bağlanılabiliyor.
#
# Kullanım (yerelden):
#   SERV00_USER=razelkull SERV00_HOST=s16.serv00.com bash scripts/remote-migrate.sh
#
# Ön koşul: SSH anahtarı kurulu (ssh-copy-id) ve uygulama serv00'a deploy edilmiş.

set -euo pipefail

: "${SERV00_USER:?SERV00_USER tanımlı değil}"
: "${SERV00_HOST:?SERV00_HOST tanımlı değil}"
SERV00_DOMAIN="${SERV00_DOMAIN:-api.dugunce.com.tr}"
REMOTE_PATH="domains/${SERV00_DOMAIN}/public_nodejs"
SSH_TARGET="${SERV00_USER}@${SERV00_HOST}"

echo "=== Hedef: $SSH_TARGET:$REMOTE_PATH ==="
echo

echo "=== 1. SSH erişimi ==="
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_TARGET" 'echo ok' >/dev/null 2>&1; then
  echo "❌ SSH bağlantısı kurulamadı"
  echo "   Anahtar kurulu mu? ssh-copy-id $SSH_TARGET"
  exit 1
fi
echo "✅ SSH çalışıyor"
echo

echo "=== 2. Uzak dizin ==="
ssh "$SSH_TARGET" "cd ~/$REMOTE_PATH 2>/dev/null && echo '✅ dizin var: '\$(pwd) || { echo '❌ dizin yok: ~/$REMOTE_PATH'; exit 1; }"
echo

echo "=== 3. .env var mı (DATABASE_URL) ==="
ssh "$SSH_TARGET" "cd ~/$REMOTE_PATH && grep -q '^DATABASE_URL=' .env 2>/dev/null && echo '✅ DATABASE_URL tanımlı' || { echo '❌ .env yok veya DATABASE_URL tanımsız'; exit 1; }"
echo

echo "=== 4. Bağımlılıklar kurulu mu ==="
ssh "$SSH_TARGET" "cd ~/$REMOTE_PATH && [ -d node_modules ] && echo '✅ node_modules var' || { echo '❌ node_modules yok — npm ci çalıştırın'; exit 1; }"
echo

echo "=== 5. Migration çalıştır ==="
ssh "$SSH_TARGET" "cd ~/$REMOTE_PATH && npx tsx scripts/migrate.ts 2>&1" | sed 's/^/   /'
echo

echo "=== 6. Şema doğrula ==="
ssh "$SSH_TARGET" "cd ~/$REMOTE_PATH && node scripts/verify-migrations.mjs 2>&1" | tail -20 | sed 's/^/   /'
echo

echo "🎉 Migration tamamlandı"
