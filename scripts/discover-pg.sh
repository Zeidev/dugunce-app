#!/bin/bash
# serv00 PostgreSQL erişim doğrulaması — TEK SORU: uygulama bağlanabiliyor mu?
#
# Kullanım (serv00'da):
#   bash -s < scripts/discover-pg.sh
#
# Neden: Yerelden bağlanamıyoruz (`pg_hba.conf` IP reddediyor). Uygulama
# serv00'da çalışacağı için, ASIL soru serv00'un kendisinin bağlanıp
# bağlanamadığı. Eğer serv00 da bağlanamıyorsa mimari çalışmaz.

DB_HOST="pgsql16.serv00.com"
DB_USER="p4992_duguncu"
DB_NAME="p4992_duguncu"

echo "=========================================="
echo " Düğünce — serv00 PostgreSQL erişim testi"
echo "=========================================="
echo

echo "=== 1. Sunucu ==="
hostname
echo

echo "=== 2. TCP: $DB_HOST:5432 ==="
if command -v nc >/dev/null 2>&1; then
  if timeout 5 nc -z "$DB_HOST" 5432 2>/dev/null; then echo "  ✅ açık (nc)"
  else echo "  ❌ kapalı (nc)"; fi
elif timeout 5 bash -c "echo > /dev/tcp/$DB_HOST/5432" 2>/dev/null; then
  echo "  ✅ açık (/dev/tcp)"
else
  echo "  ❌ kapalı (/dev/tcp)"
fi
echo

echo "=== 3. psql bağlantısı (ASIL TEST) ==="
if command -v psql >/dev/null 2>&1; then
  echo "  Şifre sorulacak (serv00 panelindeki PostgreSQL şifresi):"
  psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" 2>&1 | head -5
else
  echo "  psql yok"
fi
echo

echo "=== 4. Node.js postgres sürücüsü ==="
echo "  (uygulamanın gerçekten kullanacağı yol)"
cat > /tmp/pgcheck.mjs <<'EOF'
import postgres from 'postgres'
const sql = postgres({
  host: 'pgsql16.serv00.com', port: 5432,
  database: 'p4992_duguncu', username: 'p4992_duguncu',
  password: process.env.PGPASS, connect_timeout: 10, max: 1, onnotice: () => {},
})
try {
  const r = await sql`SELECT version() AS v, current_database() AS db`
  console.log('  ✅ BAĞLANDI:', r[0].db)
  console.log('  ', r[0].v.slice(0, 45))
} catch (e) {
  console.log('  ❌', e.message.slice(0, 120))
} finally { await sql.end({ timeout: 3 }).catch(() => {}) }
EOF
echo "  Çalıştırmak için: PGPASS='sifre' node /tmp/pgcheck.mjs"
echo "  (postgres paketi uygulama dizininde olmalı)"
echo

echo "=== 5. Ortam ==="
env | grep -iE "^(PG|DATABASE)" || echo "  PG*/DATABASE* tanımlı değil"
