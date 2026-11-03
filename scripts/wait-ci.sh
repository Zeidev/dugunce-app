#!/usr/bin/env bash
# Push sonrası CI'yı BEKLE ve sonucu döndür.
#
# Neden bu script: daha önce `sleep 210` gibi kör beklemeler kullanıyordum.
# Ölçüm: mobil CI ortalama ~80 sn (başarılı 62-116 sn, hatalı 51-56 sn).
# Kör bekleme her seferinde ~130 sn boşa harcıyordu; ayrıca yavaş bir
# koşuda yetmeyebiliyordu.
#
# Kullanım:
#   ./scripts/wait-ci.sh mobile-ci.yml
#   ./scripts/wait-ci.sh backend-ci.yml
#   ./scripts/wait-ci.sh mobile-ci.yml <sha>
#
# Çıkış kodu: 0 başarı, 1 başarısızlık, 2 zaman aşımı.

set -uo pipefail

WORKFLOW="${1:?kullanım: wait-ci.sh <workflow-dosyası> [sha]}"
SHA="${2:-$(git rev-parse --short HEAD)}"
MAX_WAIT="${MAX_WAIT:-600}"   # 10 dk üst sınır

# SHA'ya göre filtrele — `--limit 1` yanlış koşuyu döndürebilir
find_run() {
  gh run list --workflow="$WORKFLOW" --limit 10 \
    --json databaseId,headSha,status \
    --jq ".[] | select(.headSha | startswith(\"$SHA\")) | .databaseId" \
    | head -1
}

echo "⏳ $WORKFLOW @ $SHA"

# Koşu oluşana kadar kısa aralıklarla bekle (genelde <5 sn)
RID=""
for _ in $(seq 1 20); do
  RID=$(find_run)
  [ -n "$RID" ] && break
  sleep 3
done

if [ -z "$RID" ]; then
  echo "❌ $SHA için koşu bulunamadı (workflow tetiklenmemiş olabilir)"
  exit 2
fi

START=$(date +%s)

# Koşu bitene kadar bekle — sabit süre değil
if ! gh run watch "$RID" --exit-status >/dev/null 2>&1; then
  ELAPSED=$(( $(date +%s) - START ))
  echo "❌ $WORKFLOW başarısız (${ELAPSED}sn)"
  echo "   gh run view $RID --log-failed"
  exit 1
fi

ELAPSED=$(( $(date +%s) - START ))
echo "✅ $WORKFLOW başarılı (${ELAPSED}sn)"
