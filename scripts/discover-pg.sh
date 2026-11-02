#!/bin/bash
# serv00'da PostgreSQL bağlantısını keşfet.
#
# Neden gerekli: `psql -h localhost` "Connection refused" veriyor çünkü
# serv00'da PostgreSQL AYRI bir sunucuda (pgsqlX.serv00.com), uygulama
# sunucusunda değil. Uygulamanın oraya bağlanıp bağlanamadığı
# doğrulanmadan deploy edilmemeli.
#
# Kullanım (serv00'da):
#   bash -s < scripts/discover-pg.sh
echo "=== Bu sunucunun hostname'i ==="
hostname
echo
echo "=== PostgreSQL portu dinleniyor mu (herhangi bir host) ==="
sockstat -4 -l 2>/dev/null | grep 5432 || echo "  yerel 5432 dinlenmiyor"
echo
echo "=== pgsqlX host'larına erişim ==="
for i in 1 2 3 4 5 6 7 8; do
  h="pgsql$i.serv00.com"
  if timeout 3 nc -z "$h" 5432 2>/dev/null; then
    echo "  ✅ $h:5432 AÇIK"
  fi
done
echo
echo "=== Ortam değişkenleri ==="
env | grep -i "^PG\|DATABASE" || echo "  PG* tanımlı değil"
echo
echo "=== serv00 PostgreSQL yardımı ==="
ls -la ~/.pgpass 2>/dev/null || echo "  ~/.pgpass yok"
