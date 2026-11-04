#!/usr/bin/env node
/**
 * Test sonuçlarını özetler — testlerin GERÇEKTEN koştuğunu kanıtlar.
 *
 * NEDEN: `./gradlew allTests` başarılı olduğunda Gradle tek tek test adı
 * basmıyor. "Testler geçti" demek, hiç test koşmamış olsa bile doğru
 * görünür. Bu script JUnit XML raporlarını okur ve sayıları yazar;
 * hiç test bulunamazsa HATA verir (sessiz atlama yakalanır).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RESULTS_DIRS = [
  join(ROOT, 'mobile/composeApp/build/test-results'),
]

/** Dizin ağacında `*.xml` dosyalarını topla. */
function collectXml(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) collectXml(p, out)
    else if (e.endsWith('.xml')) out.push(p)
  }
  return out
}

const files = RESULTS_DIRS.flatMap((d) => collectXml(d))
if (files.length === 0) {
  console.error('❌ Hiç test sonucu bulunamadı — testler koşmamış olabilir.')
  process.exit(1)
}

let total = 0
let failures = 0
let skipped = 0
const bySuite = []

for (const f of files) {
  const xml = readFileSync(f, 'utf8')
  // <testsuite ... tests="12" failures="0" errors="0" skipped="0" name="...">
  const suites = xml.match(/<testsuite\b[^>]*>/g) ?? []
  for (const tag of suites) {
    const num = (attr) => {
      const m = tag.match(new RegExp(`${attr}="(\\d+)"`))
      return m ? Number(m[1]) : 0
    }
    const t = num('tests')
    const fail = num('failures') + num('errors')
    const skip = num('skipped')
    const nameM = tag.match(/name="([^"]*)"/)
    if (t === 0) continue
    total += t
    failures += fail
    skipped += skip
    bySuite.push({ name: nameM ? nameM[1] : '(adsız)', tests: t, fail, skip })
  }
}

if (total === 0) {
  console.error('❌ Test sonucu dosyaları var ama içlerinde test yok.')
  process.exit(1)
}

console.log('Test özeti')
console.log('─'.repeat(60))
for (const s of bySuite.sort((a, b) => b.tests - a.tests)) {
  const bad = s.fail > 0 ? `  ✗ ${s.fail} başarısız` : ''
  const sk = s.skip > 0 ? `  (${s.skip} atlandı)` : ''
  console.log(`  ${String(s.tests).padStart(4)}  ${s.name}${bad}${sk}`)
}
console.log('─'.repeat(60))
console.log(`  Toplam ${total} test · ${failures} başarısız · ${skipped} atlandı`)

if (failures > 0) {
  console.error(`\n❌ ${failures} test başarısız`)
  process.exit(1)
}
console.log('\n✅ Tüm testler geçti')
