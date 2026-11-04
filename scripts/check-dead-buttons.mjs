#!/usr/bin/env node
/**
 * "Ölü buton" kontrolü — `onClick = { }` gibi boş lambda'ları yakalar.
 *
 * NEDEN: Kullanıcı "WhatsApp'tan gönder butonu çalışmıyor" dedi. Kodda
 * buton vardı, tıklanabiliyordu, ama `onClick = { }` BOŞ lambda'ydı —
 * hiçbir şey yapmıyordu. Derleme geçiyor, testler geçiyor, kullanıcı
 * ise "bastım, bir şey olmadı" görüyor. Sessiz hata.
 *
 * Kural: kullanıcıya gösterilen bir buton boş lambda almamalı.
 * Gerçekten devre dışı olması gerekiyorsa `enabled = false` kullanılır
 * (o zaman kullanıcı tıklayamaz ve nedenini görür).
 *
 * İSTİSNA: `enabled = false` içeren çağrılar kabul edilir — amaç
 * kullanıcıya "tıklanabilir ama işlevsiz" buton göstermemek.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'mobile/composeApp/src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.kt')) out.push(full)
  }
  return out
}

// Boş lambda: `{ }`, `{}` veya yalnız yorum içeren gövde.
const EMPTY_LAMBDA = /^\{\s*\}$/
const COMMENT_ONLY = /^\{\s*(\/\/[^\n]*\s*)+\}$/

let failures = 0

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Yorum satırlarını ATLA — belgelerdeki `onClick = { }` örnekleri
    // (ör. "ÖNCEDEN: DateField(onClick = { })") gerçek kod değil.
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue

    // `onClick = { }` veya `onClick = {}` — tek satırda
    const m = line.match(/onClick\s*=\s*(\{[^}]*\})/)
    if (!m) continue

    const body = m[1].trim()
    if (!EMPTY_LAMBDA.test(body) && !COMMENT_ONLY.test(body)) continue

    // Aynı çağrı bloğunda `enabled = false` var mı? (yaklaşık: 8 satır geri/ileri)
    const windowStart = Math.max(0, i - 8)
    const windowEnd = Math.min(lines.length, i + 8)
    const nearby = lines.slice(windowStart, windowEnd).join('\n')
    if (/enabled\s*=\s*false/.test(nearby)) continue

    console.error(`❌ ${file}:${i + 1}`)
    console.error(`   onClick = ${body} — buton tıklanabilir ama HİÇBİR ŞEY yapmıyor.`)
    console.error(`   Ya gerçek işlev verin ya da \`enabled = false\` ile devre dışı bırakın.`)
    failures++
  }
}

if (failures === 0) {
  console.log('✅ Ölü buton yok')
  process.exit(0)
}
console.error(`\n${failures} ölü buton bulundu`)
process.exit(1)
