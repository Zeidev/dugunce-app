#!/usr/bin/env node
/**
 * Frontend sağlık kontrolü — `frontend/public/` altındaki statik sayfalar.
 *
 * NEDEN: Bu depoda frontend için CI YOKTU. Cloudflare Pages her push'ta
 * otomatik yayınladığı için hatalı bir değişiklik doğrudan canlıya
 * gidiyordu. Bu turda kritik bir güvenlik hatası (token'ın URL yoluna
 * sızması) ancak elle kod incelemesiyle yakalandı.
 *
 * Kontroller:
 *   1. HTML/JS sözdizimi — bozuk sayfa yayına gitmesin
 *   2. XSS — kullanıcı verisi innerHTML ile basılmasın
 *   3. Token sızıntısı — token yalnız #fragment'te, URL yolunda değil
 *   4. Sayfa yüklemesinde yazma isteği — önizleme botu yan etki yaratmasın
 *   5. Kontrast — WCAG AA (4.5:1 gövde, 3:1 büyük metin)
 *   6. Kaynak bütünlüğü — referans verilen font/dosyalar gerçekten var mı
 *   7. _redirects / _headers tutarlılığı
 *
 * Çıkış kodu 1 = en az bir ihlal (CI kırmızı).
 */

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'frontend/public')

const problems = []
const notes = []

function fail(file, line, message) {
  problems.push({ file, line, message })
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** Satır numarasını verir (1 tabanlı). */
function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

// ---------------------------------------------------------------------------
// 1. HTML/JS sözdizimi
// ---------------------------------------------------------------------------

const htmlFiles = walk(PUBLIC).filter((f) => f.endsWith('.html'))

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)

  // Script bloklarını çıkar ve sözdizimini doğrula
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/g
  let m
  let scriptIndex = 0
  while ((m = scriptRe.exec(src)) !== null) {
    scriptIndex++
    const body = m[1]
    if (!body.trim()) continue
    try {
      // `new Function` yalnız sözdizimini kontrol eder, ÇALIŞTIRMAZ.
      // AMA modül sözdizimini (`import`/`export`) desteklemez —
      // `<script type="module">` blokları `node --check` ile modül
      // olarak ayrıştırılır (çalıştırılmaz).
      if (/^\s*(import|export)\b/m.test(body)) {
        const tmp = join(tmpdir(), `chk-${process.pid}-${scriptIndex}.mjs`)
        writeFileSync(tmp, body, 'utf8')
        try {
          execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
        } finally {
          rmSync(tmp, { force: true })
        }
      } else {
        new Function(body)
      }
    } catch (e) {
      const startLine = lineOf(src, m.index)
      fail(rel, startLine, `script #${scriptIndex} sözdizimi hatası: ${e.message}`)
    }
  }

  // Kapanmamış etiketler (kaba ama etkili kontrol)
  for (const tag of ['div', 'script', 'style', 'body', 'html']) {
    const open = (src.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
    const close = (src.match(new RegExp(`</${tag}>`, 'g')) || []).length
    if (tag === 'div' && open !== close) {
      fail(rel, 0, `<${tag}> dengesiz: ${open} açık, ${close} kapalı`)
    }
  }
}

// ---------------------------------------------------------------------------
// 2. XSS — innerHTML ile kullanıcı verisi
// ---------------------------------------------------------------------------

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)

  for (const pattern of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    const re = new RegExp(`\\.${pattern}\\s*=`, 'g')
    let m
    while ((m = re.exec(src)) !== null) {
      fail(rel, lineOf(src, m.index), `${pattern} kullanılıyor — kullanıcı verisi textContent ile basılmalı (XSS)`)
    }
  }
  // eval ve new Function üretim kodunda olmamalı
  if (/\beval\s*\(/.test(src)) {
    const i = src.search(/\beval\s*\(/)
    fail(rel, lineOf(src, i), 'eval() kullanılıyor — güvenlik riski')
  }
}

// ---------------------------------------------------------------------------
// 3. Token sızıntısı — URL yolundan token okuma
// ---------------------------------------------------------------------------

/**
 * `_redirects` içinde `/<yol>/:token  /<yol>/#:token` kuralı varsa yol
 * biçimi GÜVENLİDİR: Cloudflare token'ı fragment'e taşıyıp 302 döner,
 * böylece token hiçbir zaman sunucuya gitmez. Kural yoksa yol biçimi
 * token'ı istek satırına koyar — bu ihlaldir.
 */
const redirectsSrc = existsSync(join(PUBLIC, '_redirects'))
  ? readFileSync(join(PUBLIC, '_redirects'), 'utf8')
  : ''

/** `/d/:token  /d/#:token` gibi bir kural var mı? */
function hasTokenRedirect(segment) {
  const re = new RegExp(`^\\s*\\/${segment}\\/:token\\s+\\/${segment}\\/#:token`, 'm')
  return re.test(redirectsSrc)
}

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)

  // Yol tabanlı token okuma: `location.pathname.match(...)` geçen her
  // satır incelenir. Token'ın YOL üzerinden okunması, token'ı HTTP istek
  // satırına koyar (sunucu/CDN logları, Referer).
  //
  // İSTİSNA: `_redirects` içinde `/<segment>/:token → /<segment>/#:token`
  // kuralı varsa yol biçimi GÜVENLİDİR — Cloudflare token'ı fragment'e
  // taşıyıp 302 döner, token sunucuya hiç gitmez.
  //
  // YAKLAŞIM: kaynak koddaki kaçışları (ters-slash) normalize edip düz
  // metin arıyoruz. Regex ile kaçış çözmek kırılgan — bu depoda iki kez
  // yanlış sonuç verdi.
  const srcLines = src.split('\n')
  for (let i = 0; i < srcLines.length; i++) {
    if (!srcLines[i].includes('location.pathname.match')) continue

    // Ters-slash'ları at: "\\/h\\/" → "/h/"
    const nearby = srcLines.slice(i, i + 3).join(' ').split('\\').join('').replace(/\/{2,}/g, '/')

    // "/<segment>/" desenlerini topla (en az 2, en fazla 10 küçük harf)
    const candidates = []
    let idx = 0
    while ((idx = nearby.indexOf('/', idx)) !== -1) {
      const rest = nearby.slice(idx + 1)
      const wordMatch = rest.match(/^([a-z]{1,10})\//)
      if (wordMatch) candidates.push(wordMatch[1])
      idx++
    }
    if (candidates.length === 0) continue

    const safe = candidates.some((c) => hasTokenRedirect(c))
    const segment = candidates[0]

    if (safe) {
      notes.push(`${rel}: /${segment}/:token yolu — _redirects fragment'e çeviriyor ✓`)
      continue
    }
    fail(
      rel,
      i + 1,
      `token /${segment}/<token> YOLUNDAN okunuyor ve _redirects'te fragment kuralı YOK — ` +
        `token HTTP istek satırına girer (log/Referer). ` +
        `Ya okumayı kaldır ya da "_redirects"e "/${segment}/:token  /${segment}/#:token  302" ekle`,
    )
  }

}

// ---------------------------------------------------------------------------
// 4. Sayfa yüklemesinde yazma isteği
// ---------------------------------------------------------------------------

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)

  // load() fonksiyonu içinde method: 'POST'|'PATCH'|'DELETE' olmamalı
  const loadRe = /(?:async\s+)?function\s+load\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
  const lm = src.match(loadRe)
  if (lm) {
    const body = lm[1]
    const writeRe = /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/g
    let wm
    while ((wm = writeRe.exec(body)) !== null) {
      fail(
        rel,
        lineOf(src, lm.index + wm.index),
        `sayfa yüklenirken ${wm[1]} isteği — önizleme botu yan etki yaratır (yalnız GET)`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Kontrast (WCAG AA)
// ---------------------------------------------------------------------------

/** CSS renk değişkenlerini topla. */
function readCssVars(src) {
  const vars = {}
  const re = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g
  let m
  while ((m = re.exec(src)) !== null) vars[m[1]] = m[2]
  return vars
}

function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const L1 = luminance(hexToRgb(a))
  const L2 = luminance(hexToRgb(b))
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
}

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  const vars = readCssVars(src)
  if (Object.keys(vars).length === 0) continue

  /**
   * Beyan edilen kontrast çiftleri — sayfa kendi yorumunda bunları
   * listeliyorsa (ör. "TODO 6.40"), o değerlerin tutması gerekir.
   * Ayrıca bilinen metin/arka plan çiftlerini doğrularız.
   */
  const pairs = []
  if (vars['ink'] && vars['cream']) pairs.push(['ink', 'cream', 4.5])
  if (vars['muted'] && vars['cream']) pairs.push(['muted', 'cream', 4.5])
  if (vars['muted'] && vars['surface']) pairs.push(['muted', 'surface', 4.5])
  if (vars['gold-text'] && vars['cream']) pairs.push(['gold-text', 'cream', 4.5])
  if (vars['gold-text'] && vars['surface']) pairs.push(['gold-text', 'surface', 4.5])
  if (vars['sage'] && vars['surface']) pairs.push(['sage', 'surface', 4.5])

  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(vars[fg], vars[bg])
    if (ratio < min) {
      fail(
        rel,
        0,
        `kontrast --${fg} (${vars[fg]}) / --${bg} (${vars[bg]}) = ${ratio.toFixed(2)}:1 — AA için ${min}:1 gerekli`,
      )
    } else {
      notes.push(`${rel}: --${fg}/--${bg} = ${ratio.toFixed(2)}:1 ✓`)
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Kaynak bütünlüğü — referans verilen dosyalar var mı
// ---------------------------------------------------------------------------

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)

  // url('/assets/...') ve src="/assets/..." referansları
  const assetRe = /(?:url\(\s*['"]?|\ssrc=["'])(\/[^"')\s]+\.(?:woff2?|png|jpe?g|webp|svg|css|js))/g
  let m
  const seen = new Set()
  while ((m = assetRe.exec(src)) !== null) {
    const asset = m[1]
    if (seen.has(asset)) continue
    seen.add(asset)
    const onDisk = join(PUBLIC, asset.replace(/^\//, ''))
    if (!existsSync(onDisk)) {
      fail(rel, lineOf(src, m.index), `eksik kaynak: ${asset} (frontend/public${asset} yok)`)
    }
  }
}

// ---------------------------------------------------------------------------
// 7. _redirects / _headers tutarlılığı
// ---------------------------------------------------------------------------

const redirectsPath = join(PUBLIC, '_redirects')
if (existsSync(redirectsPath)) {
  const src = readFileSync(redirectsPath, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return
    const parts = t.split(/\s+/)
    if (parts.length < 2) {
      fail('frontend/public/_redirects', i + 1, `geçersiz kural: ${t}`)
      return
    }
    // Hedef yol varsa (fragment'siz) gerçekten var mı?
    //
    // İSTİSNA: `/spa/*` hedefleri CI'da ÜRETİLİR (`admin/` Vite derlemesi,
    // `frontend/public/spa/` .gitignore'da). Taze bir checkout'ta dizin
    // henüz yoktur; bu yüzden "hedef yok" demek YANLIŞ KIRMIZI olur ve
    // CI'ı build adımından ÖNCE düşürür. Üretilen yollar ayrıca
    // `scripts/check-admin.mjs` tarafından denetlenir.
    const dest = parts[1]
    const isBuildArtifact = dest === '/spa/' || dest.startsWith('/spa/')
    if (!isBuildArtifact && dest.startsWith('/') && !dest.includes('#') && !dest.includes(':')) {
      const destPath = join(PUBLIC, dest.replace(/^\//, ''))
      const asDir = join(destPath, 'index.html')
      const asFile = destPath.endsWith('.html') ? destPath : `${destPath}.html`
      if (!existsSync(destPath) && !existsSync(asDir) && !existsSync(asFile)) {
        fail('frontend/public/_redirects', i + 1, `hedef yok: ${dest}`)
      }
    }
  })
}

// _headers: her blok bir yol deseni + en az bir başlık içermeli
const headersPath = join(PUBLIC, '_headers')
if (existsSync(headersPath)) {
  const src = readFileSync(headersPath, 'utf8')
  const blocks = src.split(/\n(?=\S)/)
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    if (lines.length === 0) continue
    if (!lines[0].startsWith('/')) {
      fail('frontend/public/_headers', 0, `blok yol deseniyle başlamalı: "${lines[0].slice(0, 40)}"`)
    }
    if (lines.length < 2) {
      fail('frontend/public/_headers', 0, `blokta başlık yok: "${lines[0]}"`)
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Davetiye — kişi sayısı özelliği iki yerde de kontrol edilmeli
// ---------------------------------------------------------------------------

/**
 * `partySizeEnabled` yalnız `render()` içinde kontrol edilirse stepper
 * gizlenir ama `sendRsvp` yine `partySize` gönderir → backend 422 →
 * davetli "Geliyorum"a basamaz. İki kullanım da zorunlu.
 */
{
  const invitePath = join(PUBLIC, 'd/index.html')
  if (existsSync(invitePath)) {
    const src = readFileSync(invitePath, 'utf8')
    const count = (src.match(/partySizeEnabled/g) || []).length
    if (count < 2) {
      fail(
        'frontend/public/d/index.html',
        0,
        `partySizeEnabled yalnız ${count} kez geçiyor — hem render() hem sendRsvp() içinde kontrol edilmeli`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 9. /d/ altında gerçek dosya olmasın — `:token` kuralı onları yutar
// ---------------------------------------------------------------------------

/**
 * `_redirects` içindeki `/d/:token → /d/#:token` kuralı, `/d/` altındaki
 * GERÇEK dosyaları da yakalar: `/d/map-link.mjs` isteği
 * `/d/#map-link.mjs`'e yönlendi ve modül yüklenemedi (canlıda görüldü).
 * Paylaşılan varlıklar `/assets/` altında durmalı.
 */
{
  const dDir = join(PUBLIC, 'd')
  if (existsSync(dDir)) {
    for (const entry of readdirSync(dDir)) {
      if (entry === 'index.html') continue
      if (/\.(m?js|css|json|map|woff2?|png|jpe?g|webp|svg)$/i.test(entry)) {
        fail(
          `frontend/public/d/${entry}`,
          0,
          `/d/ altında gerçek dosya var — "_redirects"teki "/d/:token" kuralı bunu ` +
            `fragment'e yönlendirir ve dosya yüklenmez. "/assets/" altına taşı.`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------------

if (problems.length === 0) {
  console.log(`✅ Frontend kontrolleri temiz (${htmlFiles.length} HTML dosyası)`)
  if (notes.length > 0) {
    for (const n of notes) console.log(`   ${n}`)
  }
  process.exit(0)
}

console.error(`❌ ${problems.length} sorun bulundu:\n`)
for (const p of problems) {
  const loc = p.line > 0 ? `${p.file}:${p.line}` : p.file
  console.error(`  ${loc}`)
  console.error(`     ${p.message}`)
}
console.error('')
process.exit(1)
