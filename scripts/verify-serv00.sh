#!/usr/local/bin/bash
# serv00 ortam doğrulaması — Düğünce Aşama 1a
#
# Kullanım:
#   ssh LOGIN@sX.serv00.com 'bash -s' < scripts/verify-serv00.sh
#
# veya serv00 üzerinde doğrudan:
#   bash ~/verify-serv00.sh
#
# PostgreSQL kontrolleri için şu değişkenler gerekir (yoksa o kontrol atlanır):
#   PGHOST, PGUSER, PGDATABASE, PGPASSWORD
#
# Çıkış kodu 0 = tüm kontroller geçti, 1 = en az bir kontrol başarısız.

set -u

fail=0
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; fail=1; }
skip() { echo "  ⏭️  $1 (atlandı)"; }

echo "=========================================="
echo " Düğünce — serv00 ortam doğrulaması"
echo " Tarih: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "=========================================="
echo ""

# ---------------------------------------------------------------
echo "[1/7] Node.js sürümü"
# ---------------------------------------------------------------
if command -v node22 >/dev/null 2>&1; then
  ok "node22 bulundu: $(node22 --version 2>/dev/null)"
elif command -v node >/dev/null 2>&1; then
  NODE_VER=$(node --version 2>/dev/null)
  ok "node bulundu: $NODE_VER (node22 alias'ı yok, varsayılan kullanılacak)"
else
  bad "Node.js bulunamadı"
fi

# ---------------------------------------------------------------
echo ""
echo "[2/7] npm install (native derleme gerektirmeyen paket)"
# ---------------------------------------------------------------
VTEST=/tmp/dugunce-vtest-$$
mkdir -p "$VTEST" && cd "$VTEST" || { bad "Geçici dizin oluşturulamadı"; exit 1; }

cat > package.json <<'PKGEOF'
{
  "name": "dugunce-verify",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "express": "^4.19.2"
  }
}
PKGEOF

NPM_BIN=$(command -v npm22 || command -v npm)
if $NPM_BIN install --no-audit --no-fund >/tmp/dugunce-npm.log 2>&1; then
  ok "npm install çalışıyor (pure-JS paket)"
else
  bad "npm install patladı — /tmp/dugunce-npm.log dosyasına bak"
  tail -5 /tmp/dugunce-npm.log | sed 's/^/       /'
fi

# ---------------------------------------------------------------
echo ""
echo "[3/7] Drizzle ORM + postgres sürücü (pure JS)"
# ---------------------------------------------------------------
if $NPM_BIN install drizzle-orm postgres --no-audit --no-fund >/tmp/dugunce-npm2.log 2>&1; then
  NODE_BIN=$(command -v node22 || command -v node)
  if $NODE_BIN -e "require('drizzle-orm'); require('postgres');" 2>/dev/null; then
    ok "drizzle-orm + postgres yüklendi ve require edilebiliyor"
  else
    bad "paketler kuruldu ama require edilemiyor"
  fi
else
  bad "drizzle-orm/postgres kurulamadı"
  tail -5 /tmp/dugunce-npm2.log | sed 's/^/       /'
fi

# ---------------------------------------------------------------
echo ""
echo "[4/7] @node-rs/argon2 (prebuilt binary)"
# ---------------------------------------------------------------
if $NPM_BIN install @node-rs/argon2 --no-audit --no-fund >/tmp/dugunce-npm3.log 2>&1; then
  NODE_BIN=$(command -v node22 || command -v node)
  HASH_OUT=$($NODE_BIN -e "
    const a = require('@node-rs/argon2');
    a.hash('dugunce-test').then(h => { console.log(h.slice(0, 30)); });
  " 2>/dev/null)
  if [ -n "$HASH_OUT" ]; then
    ok "argon2 hash üretiyor: ${HASH_OUT}..."
  else
    bad "argon2 yüklendi ama hash üretemedi (FreeBSD binary uyumsuzluğu?)"
  fi
else
  bad "@node-rs/argon2 kurulamadı — WASM alternatifi gerekebilir"
  tail -5 /tmp/dugunce-npm3.log | sed 's/^/       /'
fi

# ---------------------------------------------------------------
echo ""
echo "[5/7] PostgreSQL bağlantısı"
# ---------------------------------------------------------------
if ! command -v psql >/dev/null 2>&1; then
  skip "psql bulunamadı"
elif [ -z "${PGHOST:-}" ] || [ -z "${PGUSER:-}" ] || [ -z "${PGDATABASE:-}" ]; then
  skip "PGHOST / PGUSER / PGDATABASE tanımlı değil"
else
  PGVER=$(psql -tAc "SELECT version();" 2>/dev/null)
  if [ -n "$PGVER" ]; then
    ok "bağlantı kuruldu: $(echo "$PGVER" | cut -c1-50)"
  else
    bad "PostgreSQL bağlantısı kurulamadı (PGHOST=$PGHOST)"
  fi
fi

# ---------------------------------------------------------------
echo ""
echo "[6/7] pg_dump / pg_restore"
# ---------------------------------------------------------------
if command -v pg_dump >/dev/null 2>&1; then
  ok "pg_dump: $(pg_dump --version 2>/dev/null | head -1)"
else
  bad "pg_dump bulunamadı — yedekleme stratejisi değişmeli"
fi

if command -v pg_restore >/dev/null 2>&1; then
  ok "pg_restore: $(pg_restore --version 2>/dev/null | head -1)"
else
  bad "pg_restore bulunamadı"
fi

# ---------------------------------------------------------------
echo ""
echo "[7/7] Veritabanı UTF-8 kodlaması"
# ---------------------------------------------------------------
if command -v psql >/dev/null 2>&1 && [ -n "${PGHOST:-}" ] && [ -n "${PGDATABASE:-}" ]; then
  ENCODING=$(psql -tAc "SHOW server_encoding;" 2>/dev/null)
  if echo "$ENCODING" | grep -qi "utf8"; then
    ok "sunucu kodlaması: $ENCODING"
  elif [ -n "$ENCODING" ]; then
    bad "sunucu kodlaması UTF-8 değil: $ENCODING — Türkçe karakterler bozulur"
  else
    bad "kodlama sorgusu başarısız"
  fi

  # Türkçe karakter round-trip
  TR_TEST=$(psql -tAc "SELECT 'şğıöçüİŞĞÜÖÇ';" 2>/dev/null | tr -d ' ')
  if [ "$TR_TEST" = "şğıöçüİŞĞÜÖÇ" ]; then
    ok "Türkçe karakter round-trip doğru"
  elif [ -n "$TR_TEST" ]; then
    bad "Türkçe karakter bozuldu: '$TR_TEST'"
  fi
else
  skip "PostgreSQL bağlantısı yok"
fi

# ---------------------------------------------------------------
cd /tmp && rm -rf "$VTEST"
echo ""
echo "=========================================="
if [ $fail -eq 0 ]; then
  echo " 🎉 TÜM KONTROLLER GEÇTİ"
  echo " Aşama 1b'ye (proje iskeleti) geçilebilir."
else
  echo " ⚠️  BAZI KONTROLLER BAŞARISIZ"
  echo " DUR — alternatif karar gerekir. Kullanıcıya bildir."
fi
echo "=========================================="
exit $fail
