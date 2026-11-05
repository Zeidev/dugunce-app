#!/usr/bin/env node
/**
 * Push Gradle yapılandırma kontrolü.
 *
 * NEDEN GEREKLİ: `google-services.json` GİZLİ bir dosya — `.gitignore`'da
 * (proje kimliği taşır). Depoyu klonlayan herkesde ve CI'da YOKTUR.
 *
 * Eklenti KOŞULSUZ uygulanırsa `processDebugGoogleServices` görevi
 * dosyayı bulamayıp derlemeyi kırar — yani push eklemek, push
 * kullanmayan herkesin derlemesini bozar. Bu kontrol o regresyonu
 * yakalar.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (p) => readFileSync(join(root, p), 'utf8')

const problems = []
const fail = (msg) => problems.push(msg)

let gradle
let manifest
try {
  gradle = read('mobile/composeApp/build.gradle.kts')
  manifest = read('mobile/composeApp/src/androidMain/AndroidManifest.xml')
} catch (e) {
  console.error(`❌ Dosya okunamadı: ${e.message}`)
  process.exit(1)
}

// 1) Eklenti KOŞULLU olmalı — dosya yokken derleme kırılmamalı.
if (!/if\s*\(\s*file\("google-services\.json"\)\.exists\(\)\s*\)/.test(gradle)) {
  fail(
    'google-services eklentisi KOŞULLU değil — dosya yokken derleme kırılır. ' +
      'Beklenen: if (file("google-services.json").exists()) { apply(...) }',
  )
}

// 2) firebase-messaging bağımlılığı var mı
if (!/firebase[.-]messaging/i.test(gradle)) {
  fail('firebase-messaging bağımlılığı yok — FCM token alınamaz')
}

// 3) POST_NOTIFICATIONS izni (Android 13+)
if (!/android\.permission\.POST_NOTIFICATIONS/.test(manifest)) {
  fail(
    'AndroidManifest.xml içinde POST_NOTIFICATIONS izni yok — ' +
      'Android 13+ cihazlarda bildirim gösterilemez',
  )
}

// 4) FirebaseMessagingService manifest'te kayıtlı mı
if (!/com\.google\.firebase\.MESSAGING_EVENT/.test(manifest)) {
  fail(
    'Manifest\'te MESSAGING_EVENT intent-filter yok — ' +
      'bildirimler uygulama ön plandayken gösterilmez',
  )
}

if (problems.length === 0) {
  console.log('✅ Push Gradle yapılandırması doğru')
  process.exit(0)
}

console.error(`❌ ${problems.length} sorun bulundu:\n`)
for (const p of problems) console.error(`  • ${p}`)
process.exit(1)
