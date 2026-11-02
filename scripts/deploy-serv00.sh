#!/usr/local/bin/bash
# Düğünce backend — serv00 deploy betiği
#
# Kullanım:
#   ./scripts/deploy-serv00.sh
#
# Gerekli ortam değişkenleri:
#   SERV00_HOST   — sX.serv00.com
#   SERV00_USER   — serv00 kullanıcı adı
#   SERV00_DOMAIN — api.dugunce.com.tr (serv00 panelinde tanımlı alan adı)
#   SERV00_PATH   — uzak dizin (varsayılan: ~/domains/$SERV00_DOMAIN/public_nodejs)
#
# SSH anahtarı önceden kurulmuş olmalı (~/.ssh/config veya ssh-agent).
#
# NOT: node_modules GÖNDERİLMEZ. Sunucuda `npm ci --omit=dev` çalışır.
#      Sebep: platforma özgü binary'ler (FreeBSD) yerelde üretilemez.

set -euo pipefail

: "${SERV00_HOST:?SERV00_HOST tanımlı değil}"
: "${SERV00_USER:?SERV00_USER tanımlı değil}"
: "${SERV00_DOMAIN:?SERV00_DOMAIN tanımlı değil}"

SERV00_PATH="${SERV00_PATH:-domains/${SERV00_DOMAIN}/public_nodejs}"
SSH_TARGET="${SERV00_USER}@${SERV00_HOST}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend"

echo "=========================================="
echo " Düğünce backend deploy"
echo " Hedef: ${SSH_TARGET}:${SERV00_PATH}"
echo " Tarih: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "=========================================="

# --- 1. Ön kontroller ---
echo ""
echo "[1/5] Ön kontroller"

if [ ! -d "$LOCAL_DIR/dist" ]; then
  echo "  ❌ dist/ yok — önce 'npm run build' çalıştırın"
  exit 1
fi
echo "  ✅ dist/ mevcut"

if [ ! -f "$LOCAL_DIR/package-lock.json" ]; then
  echo "  ❌ package-lock.json yok — 'npm install' çalıştırın"
  exit 1
fi
echo "  ✅ package-lock.json mevcut"

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_TARGET" 'echo ok' >/dev/null 2>&1; then
  echo "  ❌ SSH bağlantısı kurulamadı: $SSH_TARGET"
  echo "     Anahtar kurulu mu? ssh -i <key> $SSH_TARGET 'echo ok'"
  exit 1
fi
echo "  ✅ SSH bağlantısı çalışıyor"

# --- 2. Yedek al (deploy öncesi) ---
echo ""
echo "[2/5] Uzak dizin yedekleniyor"
ssh "$SSH_TARGET" "
  cd ~ && \
  if [ -d '${SERV00_PATH}' ]; then
    tar -czf ~/deploy-backup-\$(date +%Y%m%d-%H%M%S).tar.gz -C ~ '${SERV00_PATH}' 2>/dev/null || true
    echo '  ✅ Yedek alındı'
  else
    echo '  ℹ️  İlk deploy — yedeklenecek dizin yok'
  fi
"

# --- 3. Dosyaları gönder ---
echo ""
echo "[3/5] Dosyalar gönderiliyor (node_modules hariç)"

rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude '.git' \
  --exclude 'tests' \
  --exclude 'coverage' \
  "$LOCAL_DIR/dist/" "${SSH_TARGET}:${SERV00_PATH}/dist/"

rsync -az \
  "${LOCAL_DIR}/package.json" \
  "${LOCAL_DIR}/package-lock.json" \
  "${SSH_TARGET}:${SERV00_PATH}/"

# Migration dosyaları
rsync -az --delete \
  "$LOCAL_DIR/src/db/migrations/" "${SSH_TARGET}:${SERV00_PATH}/dist/db/migrations/"

echo "  ✅ Dosyalar gönderildi"

# --- 4. Bağımlılıkları kur ve restart ---
echo ""
echo "[4/5] Uzak sunucuda bağımlılıklar kuruluyor"

ssh "$SSH_TARGET" "
  set -e
  cd ~/'${SERV00_PATH}'
  export PATH=\$HOME/.npm-global/bin:\$HOME/bin:\$PATH
  NPM=\$(command -v npm22 || command -v npm)
  NODE=\$(command -v node22 || command -v node)
  echo \"  Node: \$(\$NODE --version)\"
  \$NPM ci --omit=dev --no-audit --no-fund
  echo '  ✅ Bağımlılıklar kuruldu'
"

# --- 4b. Migration'ları uygula ---
echo ""
echo "[4b/5] Migration'lar uygulanıyor"
ssh "$SSH_TARGET" "
  set -e
  cd ~/'${SERV00_PATH}'
  node dist/db/migrate-cli.js --force 2>&1 | tail -5
  echo '  ✅ Migration tamam'
"

# --- 5. Uygulamayı yeniden başlat ---
echo ""
echo "[5/5] Uygulama yeniden başlatılıyor"

ssh "$SSH_TARGET" "devil www restart '${SERV00_DOMAIN}' 2>&1 || echo '  ⚠️  restart komutu başarısız — panelden kontrol edin'"

# --- Sağlık kontrolü ---
echo ""
echo "Sağlık kontrolü bekleniyor..."
HEALTH_URL="https://${SERV00_DOMAIN}/health"
for i in $(seq 1 10); do
  if curl -sf --max-time 5 "$HEALTH_URL" | grep -q '"status":"ok"'; then
    echo "  ✅ $HEALTH_URL sağlıklı"
    echo ""
    echo "=========================================="
    echo " 🎉 Deploy başarılı"
    echo "=========================================="
    exit 0
  fi
  sleep 3
done

echo "  ❌ Sağlık kontrolü başarısız: $HEALTH_URL"
echo "     Soğuk başlangıç olabilir (serv00 24 saat uyku) — 30 sn sonra tekrar deneyin."
exit 1
