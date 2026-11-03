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

/** { nesne, paket } — tam nitelikli import yolu. */
const HELPERS = [
  { name: 'Money', pkg: 'com.dugunce.app.data' },
  { name: 'Dates', pkg: 'com.dugunce.app.util' },
  { name: 'Links', pkg: 'com.dugunce.app.util' },
  { name: 'OfflineCache', pkg: 'com.dugunce.app.data' },
  { name: 'TokenStore', pkg: 'com.dugunce.app.data' },
  { name: 'Repository', pkg: 'com.dugunce.app.data' },
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

if (failures === 0) {
  console.log('✅ Kotlin import kontrolü temiz')
  process.exit(0)
}
console.error(`\n${failures} eksik import`)
process.exit(1)
