#!/usr/bin/env bash
# Sabit debug keystore üretir — App Links doğrulaması için.
#
# Neden: Android Studio'nun varsayılan debug keystore'u her makinede
# farklı, CI'da her koşuda yeniden üretiliyor. assetlinks.json'daki
# SHA-256 parmak izi bu yüzden asla eşleşmiyor ve https linkleri
# tarayıcıda kalıyor.
#
# Bu script TEK SEFER çalıştırılır, keystore repoya commit edilir
# (şifre `android`, standart debug şifresi — gizli değil).
#
# Gereksinim: JDK (keytool).
set -euo pipefail

OUT="mobile/debug.keystore"
if [ -f "$OUT" ]; then
  echo "✅ $OUT zaten var — yeniden üretilmedi"
  exit 0
fi

if ! command -v keytool >/dev/null; then
  echo "❌ keytool yok — JDK kurulu değil"
  echo "   CachyOS: sudo pacman -S jdk-openjdk"
  exit 1
fi

keytool -genkeypair \
  -keystore "$OUT" \
  -storepass android -keypass android \
  -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"

echo
echo "✅ Oluşturuldu: $OUT"
echo
echo "SHA-256 parmak izi (assetlinks.json'a yazılacak):"
keytool -list -v -keystore "$OUT" -storepass android -alias androiddebugkey \
  | grep "SHA256:" | sed 's/.*SHA256: //'
