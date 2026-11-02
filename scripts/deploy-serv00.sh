#!/usr/bin/env bash
# Düğünce backend — serv00 deploy betiği
#
# Kullanım:
#   ./scripts/deploy-serv00.sh
#
# Gerekli ortam değişkenleri:
#   SERV00_HOST   — s16.serv00.com
#   SERV00_USER   — razelkull
#   SERV00_DOMAIN — api.dugunce.com.tr
#   SERV00_PATH   — uzak dizin (varsayılan: domains/$SERV00_DOMAIN/public_nodejs)
#
# SSH anahtarı önceden kurulmuş olmalı (~/.ssh/config veya ssh-agent).
#
# --- SUNUCU YERLEŞİMİ (2026-11-02'de canlıda doğrulandı) ---
#
#   ~/domains/api.dugunce.com.tr/public_nodejs/
#   ├── app.js              ← Passenger giriş noktası (COMMONJS)
#   ├── package.json        ← yalnızca kimlik; bağımlılık TAŞIMAZ
#   └── backend/            ← asıl uygulama
#       ├── .env            ← gerçek sırlar burada
#       ├── dist/           ← derlenmiş çıktı (app.js bunu okur)
#       └── node_modules/   ← bağımlılıklar burada
#
# ÖNEMLİ: `app.js` uygulamayı `backend/dist/server.js` içinden yükler.
# Bu yüzden dosyalar `public_nodejs/dist/` değil, `public_nodejs/backend/dist/`
# altına gitmeli. `npm ci` de kökte değil `backend/` içinde çalışmalı —
# kökteki package.json'ın `dependencies` alanı yok.

set -euo pipefail

: "${SERV00_HOST:?SERV00_HOST tanımlı değil}"
: "${SERV00_USER:?SERV00_USER tanımlı değil}"
: "${SERV00_DOMAIN:?SERV00_DOMAIN tanımlı değil}"

SERV00_PATH="${SERV00_PATH:-domains/${SERV00_DOMAIN}/public_nodejs}"
SSH_TARGET="${SERV00_USER}@${SERV00_HOST}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend"
REMOTE_APP="${SERV00_PATH}/backend"

# SSH seçenekleri — CI'da anahtar yolu değişebilir
SSH_OPTS=(-o ConnectTimeout=15 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [ -n "${SERV00_SSH_KEY:-}" ]; then
  SSH_OPTS+=(-i "$SERV00_SSH_KEY")
fi
SSH=(ssh "${SSH_OPTS[@]}" "$SSH_TARGET")
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

echo "=========================================="
echo " Düğünce backend deploy"
echo " Hedef: ${SSH_TARGET}:${REMOTE_APP}"
echo " Tarih: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "=========================================="

# --- 1. Ön kontroller ---
echo ""
echo "[1/6] Ön kontroller"

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

if ! "${SSH[@]}" 'echo ok' >/dev/null 2>&1; then
  echo "  ❌ SSH bağlantısı kurulamadı: $SSH_TARGET"
  exit 1
fi
echo "  ✅ SSH bağlantısı çalışıyor"

# .env olmadan uygulama açılmaz — deploy'dan ÖNCE kontrol et
if ! "${SSH[@]}" "test -f ~/${REMOTE_APP}/.env"; then
  echo "  ❌ Uzakta .env yok: ~/${REMOTE_APP}/.env"
  echo "     İlk kurulumda elle oluşturulmalı (DATABASE_URL, JWT_SECRET, NODE_ENV)."
  exit 1
fi
echo "  ✅ Uzak .env mevcut"

# --- 2. Yedek al (deploy öncesi) ---
echo ""
echo "[2/6] Uzak dist yedekleniyor"
"${SSH[@]}" "
  cd ~/${REMOTE_APP} && \
  if [ -d dist ]; then
    tar -czf /tmp/dist-backup-\$(date +%Y%m%d-%H%M%S).tgz dist && \
    ls -t /tmp/dist-backup-*.tgz | tail -n +6 | xargs -r rm -f
    echo '  ✅ dist yedeklendi (son 5 yedek tutulur)'
  else
    echo '  ℹ️  İlk deploy — yedeklenecek dist yok'
  fi
"

# --- 3. Dosyaları gönder ---
echo ""
echo "[3/6] Dosyalar gönderiliyor (node_modules ve .env hariç)"

rsync -az --delete -e "$RSYNC_SSH" \
  --exclude '*.map' \
  --exclude 'tests' \
  --exclude 'coverage' \
  "$LOCAL_DIR/dist/" "${SSH_TARGET}:${REMOTE_APP}/dist/"

rsync -az -e "$RSYNC_SSH" \
  "${LOCAL_DIR}/package.json" \
  "${LOCAL_DIR}/package-lock.json" \
  "${SSH_TARGET}:${REMOTE_APP}/"

echo "  ✅ Dosyalar gönderildi"

# --- 4. Bağımlılıkları kur ---
echo ""
echo "[4/6] Uzak sunucuda bağımlılıklar kuruluyor"

"${SSH[@]}" "
  set -e
  cd ~/${REMOTE_APP}
  export PATH=\$HOME/.npm-global/bin:\$HOME/bin:\$PATH
  NPM=\$(command -v npm22 || command -v npm)
  NODE=\$(command -v node22 || command -v node)
  echo \"  Node: \$(\$NODE --version)\"
  \$NPM ci --omit=dev --no-audit --no-fund 2>&1 | tail -3
  echo '  ✅ Bağımlılıklar kuruldu'
"

# --- 5. Migration'ları uygula ---
echo ""
echo "[5/6] Migration'lar uygulanıyor"

# --force: migrate-cli üretim hedefini görünce durur. CI/deploy zaten
# üretim hedefiyle çalışıyor; onay bayrağı burada açıkça verilir.
"${SSH[@]}" "
  set -e
  cd ~/${REMOTE_APP}
  node dist/db/migrate-cli.js --force 2>&1 | tail -4
"

# --- 6. Uygulamayı yeniden başlat ---
echo ""
echo "[6/6] Uygulama yeniden başlatılıyor"

"${SSH[@]}" "devil www restart '${SERV00_DOMAIN}' 2>&1 || echo '  ⚠️  devil yok — panelden restart edin'"

# --- Sağlık kontrolü ---
echo ""
echo "Sağlık kontrolü bekleniyor..."
HEALTH_URL="https://${SERV00_DOMAIN}/health/deep"
for i in $(seq 1 20); do
  if curl -sf --max-time 8 "$HEALTH_URL" | grep -q '"db":"ok"'; then
    echo "  ✅ $HEALTH_URL sağlıklı (DB dahil)"
    echo ""
    echo "=========================================="
    echo " 🎉 Deploy başarılı"
    echo "=========================================="
    exit 0
  fi
  sleep 3
done

echo "  ❌ Sağlık kontrolü başarısız: $HEALTH_URL"
echo "     Soğuk başlangıç olabilir (serv00 uyku modu)."
echo "     Geri almak için: ssh $SSH_TARGET 'cd ~/${REMOTE_APP} && tar xzf /tmp/dist-backup-<en-yeni>.tgz'"
exit 1
