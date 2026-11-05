#!/usr/bin/env node
/**
 * Kotlin import kontrolü — derleme öncesi.
 *
 * Neden: aynı sınıf hata üç kez CI'da 2 dakika kaybettirdi
 * (DugunceButton, ArrowBack/Icons, Money). Hepsi "kullanılıyor ama
 * import edilmemiş" idi.
 *
 * Kural: `Money.` / `Dates.` / `Links.` gibi yardımcı nesneler başka
 * paketten kullanılıyorsa import gerekir. Aynı pakettekiler muaf.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'mobile/composeApp/src/commonMain')

/**
 * Compose/Kotlin çekirdek sembolleri — import edilmeden kullanılamaz.
 *
 * Bu liste, "kullanılıyor ama import yok" sınıfı hatasını yakalar;
 * aynı hata 4 kez CI döngüsü kaybettirdi (DugunceButton, Icons,
 * Money, remember/mutableStateOf).
 */
const CORE_SYMBOLS = [
  { name: 'remember', pkg: 'androidx.compose.runtime' },
  { name: 'mutableStateOf', pkg: 'androidx.compose.runtime' },
  { name: 'rememberCoroutineScope', pkg: 'androidx.compose.runtime' },
  { name: 'LaunchedEffect', pkg: 'androidx.compose.runtime' },
  { name: 'getValue', pkg: 'androidx.compose.runtime', by: 'by ' },
  { name: 'setValue', pkg: 'androidx.compose.runtime' },
  { name: 'dp', pkg: 'androidx.compose.ui.unit' },
  { name: 'sp', pkg: 'androidx.compose.ui.unit' },
  { name: 'heightIn', pkg: 'androidx.compose.foundation.layout' },
  { name: 'width', pkg: 'androidx.compose.foundation.layout' },
  { name: 'height', pkg: 'androidx.compose.foundation.layout' },
  { name: 'padding', pkg: 'androidx.compose.foundation.layout' },
  { name: 'fillMaxWidth', pkg: 'androidx.compose.foundation.layout' },
  { name: 'fillMaxSize', pkg: 'androidx.compose.foundation.layout' },
  { name: 'Alignment', pkg: 'androidx.compose.ui' },
  { name: 'Modifier', pkg: 'androidx.compose.ui' },
  { name: 'Text', pkg: 'androidx.compose.material3' },
  { name: 'Icon', pkg: 'androidx.compose.material3' },
  { name: 'Surface', pkg: 'androidx.compose.material3' },
  { name: 'MaterialTheme', pkg: 'androidx.compose.material3' },
]

/**
 * Projenin kendi kök paketi — TEK KAYNAKTAN okunur.
 *
 * NEDEN SABİT YAZILMIYOR (canlıda YAŞANDI): paket adı
 * `com.dugunce.app` → `com.lumibyte.dugunce` olarak değiştiğinde bu
 * dosyada sabit yazılı yol güncellenmedi ve CI KIRMIZI verdi:
 *
 *   "Money kullanılıyor ama 'import com.dugunce.app.data.Money' yok"
 *
 * Oysa import VARDI — yalnız adı değişmişti. Sabit bir yol, yeniden
 * adlandırmayı SESSİZCE kırar: kontrol, doğru koddan şüphelenir ve
 * gerçek hatayı gizler.
 *
 * Artık kök paket `composeApp/build.gradle.kts` içindeki
 * `namespace = "..."` satırından okunur. Gradle'ın kendi doğruluk
 * kaynağı budur; ikisi asla ayrışamaz.
 */
function readRootPackage() {
  const gradle = join(process.cwd(), 'mobile/composeApp/build.gradle.kts')
  let src
  try {
    src = readFileSync(gradle, 'utf8')
  } catch {
    // Gradle dosyası yoksa kontrol sessizce yanlış tarafa düşmesin:
    // açıkça hata ver, "geçti" deme.
    console.error(`❌ ${gradle} okunamadı — kök paket belirlenemiyor`)
    process.exit(1)
  }
  const m = /namespace\s*=\s*"([^"]+)"/.exec(src)
  if (!m) {
    console.error('❌ build.gradle.kts içinde `namespace = "..."` bulunamadı')
    process.exit(1)
  }
  return m[1]
}

const ROOT_PACKAGE = readRootPackage()

/** { nesne, paket } — tam nitelikli import yolu. */
const HELPERS = [
  { name: 'Money', pkg: `${ROOT_PACKAGE}.data` },
  { name: 'Dates', pkg: `${ROOT_PACKAGE}.util` },
  { name: 'Links', pkg: `${ROOT_PACKAGE}.util` },
  { name: 'OfflineCache', pkg: `${ROOT_PACKAGE}.data` },
  { name: 'TokenStore', pkg: `${ROOT_PACKAGE}.data` },
  { name: 'Repository', pkg: `${ROOT_PACKAGE}.data` },
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.kt')) out.push(full)
  }
  return out
}

let failures = 0

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')

  // Dosyanın kendi paketi
  const pkgMatch = src.match(/^package\s+([\w.]+)/m)
  const ownPkg = pkgMatch ? pkgMatch[1] : ''

  for (const { name, pkg } of HELPERS) {
    // Aynı paketteyse import gerekmez
    if (ownPkg === pkg) continue
    // Kendi tanım dosyasıysa atla
    if (file.endsWith(`/${name}.kt`)) continue

    // Tam nitelikli olmayan kullanım: `Money.` (önceki karakter . veya harf değil)
    const used = new RegExp(`(?<![.\\w])${name}\\.`).test(src)
    if (!used) continue

    const imported = src.includes(`import ${pkg}.${name}`)
    if (!imported) {
      console.error(`❌ ${file.replace(process.cwd() + '/', '')}`)
      console.error(`   ${name} kullanılıyor ama "import ${pkg}.${name}" yok`)
      failures++
    }
  }
}

// Çekirdek sembol kontrolü
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  for (const { name, pkg, by } of CORE_SYMBOLS) {
    // Kullanım deseni: `remember(` / `remember {` / `dp` / `by remember`
    const used = by
      ? new RegExp(`\\bby\\s+${name}\\b`).test(src)
      : new RegExp(`(?<![.\\w])${name}\\s*[({\\.]`).test(src) ||
        new RegExp(`(?<![.\\w])${name}\\b`).test(src)
    if (!used) continue
    // Tam nitelikli kullanım (androidx.compose.runtime.remember) import istemez
    if (src.includes(`${pkg}.${name}`)) continue
    const imported = new RegExp(`import ${pkg.replace(/\./g, '\\.')}\\.${name}\\b`).test(src)
    if (!imported) {
      console.error(`❌ ${file.replace(process.cwd() + '/', '')}`)
      console.error(`   ${name} kullanılıyor ama "import ${pkg}.${name}" yok`)
      failures++
    }
  }
}

/*
  KURAL — PROJE İÇİ IMPORT YOLU GERÇEKTEN VAR MI?

  NEDEN (canlıda YAŞANDI, CI kırmızı): paket adı
  `com.dugunce.app` → `com.lumibyte.dugunce` olarak değiştiğinde bir
  dosyada `import com.dugunce.app.util.AppContextHolder` kaldı. Yukarıdaki
  sembol kontrolleri bunu YAKALAMADI çünkü `AppContextHolder` onların
  listesinde değil — script yalnız 6 sabit sembolü tanıyor.

  Sonuç: `mobile-ci` "Unresolved reference 'dugunce'" ile düştü. Bu kural
  o kör noktayı kapatıyor: proje kök paketine ait HER import, gerçekten
  var olan bir kaynak pakete işaret etmeli.

  Yalnız KÖK PAKET taranıyor (`com.lumibyte.dugunce.*`): `androidx.*`,
  `kotlinx.*` gibi dış paketler için dosya sistemi kontrolü anlamsız.
*/
const SOURCE_SETS = ['commonMain', 'androidMain', 'iosMain', 'commonTest']
const knownPackages = new Set()
for (const set of SOURCE_SETS) {
  let files = []
  try {
    files = walk(join(process.cwd(), 'mobile/composeApp/src', set, 'kotlin'))
  } catch {
    continue
  }
  for (const file of files) {
    const m = readFileSync(file, 'utf8').match(/^package\s+([\w.]+)/m)
    if (m) knownPackages.add(m[1])
  }
}

for (const set of SOURCE_SETS) {
  let files = []
  try {
    files = walk(join(process.cwd(), 'mobile/composeApp/src', set, 'kotlin'))
  } catch {
    continue
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const rel = file.replace(process.cwd() + '/', '')
    const re = /^import\s+(com\.lumibyte\.dugunce[\w.]*)$/gm
    let m
    while ((m = re.exec(src)) !== null) {
      const full = m[1]
      if (knownPackages.has(full)) continue
      const parent = full.slice(0, full.lastIndexOf('.'))
      if (knownPackages.has(parent)) continue
      console.error(`❌ ${rel}`)
      console.error(`   "import ${full}" — böyle bir paket YOK (paket adı değişmiş olabilir)`)
      failures++
    }

    /*
      ESKİ KÖK PAKET KALINTISI — asıl kör nokta buydu.

      Yukarıdaki kontrol yalnız `com.lumibyte.dugunce.*` yollarını
      geziyor; eski `com.dugunce.app.*` import'u hiç EŞLEŞMİYOR ve
      sessizce geçiyordu (ölçüldü: bozuk import ile script YEŞİL kaldı).
      Oysa CI tam bu yüzden kırmızı verdi.

      Kök paketi `build.gradle.kts`'ten okuyup onun DIŞINDAKİ proje içi
      paketleri de reddediyoruz.
    */
    const stale = /^import\s+(com\.dugunce\.[\w.]*)$/gm
    let sm
    while ((sm = stale.exec(src)) !== null) {
      console.error(`❌ ${rel}`)
      console.error(
        `   "import ${sm[1]}" — ESKİ paket adı. Kök paket "${ROOT_PACKAGE}" (build.gradle.kts).`,
      )
      failures++
    }
  }
}

if (failures === 0) {
  console.log('✅ Kotlin import kontrolü temiz')
  process.exit(0)
}
console.error(`\n${failures} eksik import`)
process.exit(1)
