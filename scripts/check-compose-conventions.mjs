#!/usr/bin/env node
/**
 * Compose API yanlış kullanımlarını yakalar — derleme öncesi.
 *
 * Neden: aynı hata üç kez tekrarlandı (helper listesi, kart ekranı):
 * `TextAction("Sil") { ... }` — ikinci parametre `Modifier`, dolayısıyla
 * trailing lambda yanlış yuvaya bağlanıyor ve yalnızca CI'da, 2 dakika
 * sonra ortaya çıkıyor.
 *
 * Kural: `onClick` alan composable'lar adlandırılmış argümanla çağrılmalı.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath şart: pathname Türkçe karakterleri (%C3%BC) kodlu bırakır
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'mobile/composeApp/src')

/** `onClick` ikinci parametre olan ve trailing lambda tuzağı olan fonksiyonlar. */
const TRAP = ['TextAction']

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
  for (const name of TRAP) {
    // TextAction("...") {  veya  TextAction("...") { ... }
    const re = new RegExp(`${name}\\s*\\([^)]*\\)\\s*\\{`, 'g')
    const matches = src.match(re)
    if (matches) {
      for (const m of matches) {
        console.error(`❌ ${file}`)
        console.error(`   ${name}(...) { ... } — trailing lambda yanlış yuvaya bağlanır.`)
        console.error(`   Kullan: ${name}("...", onClick = { ... })`)
        failures++
      }
    }
  }
}

if (failures === 0) {
  console.log('✅ Compose çağrı kuralları temiz')
  process.exit(0)
}
console.error(`\n${failures} ihlal bulundu`)
process.exit(1)
