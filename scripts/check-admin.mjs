#!/usr/bin/env node
/**
 * Admin SPA sağlık kontrolü — `admin/` kaynak dizini + yayın yapılandırması.
 *
 * NEDEN: Admin paneli ayrı bir Vite projesi. `frontend/` için yazılan
 * `check-frontend.mjs` yalnız `frontend/public/` altındaki HTML dosyalarına
 * bakar; `admin/` hiçbir kontrolden geçmiyordu. Panel, davetli verisinin
 * tamamını görebildiği için buradaki bir XSS veya token sızıntısı davetiye
 * sayfasındakinden daha ağır sonuç doğurur.
 *
 * ASIL TEHLİKE "YANLIŞ YEŞİL": dizin var ama dosyalar eksikse kontrol
 * sessizce geçmemeli. Bu yüzden yalnız güvenlik desenlerine değil, iskeletin
 * TAMAMINA (package.json, vite.config.ts, kaynak dosyalar, tokenlar,
 * _redirects/_headers/.gitignore) bakılır.
 *
 * Kontroller:
 *   1. İskelet — package.json (+ build/typecheck), lock dosyası, tsconfig katılığı
 *   2. Vite yapılandırması — base '/spa/', outDir '../frontend/public/spa'
 *   3. Kaynak dosyalar — main.tsx, App.tsx, tokens.css, app.css, Layout.tsx
 *   4. Tasarım tokenları — spec §9.1 değerleri BİREBİR
 *   5. Router basename — derin bağlantı (/spa/users) eşleşsin
 *   6. Güvenlik — localStorage token yazımı yok, innerHTML yok, a_session yok
 *   7. Yayın — _redirects sonunda /spa/*, _headers'ta noindex + no-store
 *   8. .gitignore — build çıktısı ve node_modules commit'e girmesin
 *
 * Çıkış kodu 1 = en az bir ihlal (CI kırmızı).
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ADMIN = join(ROOT, 'admin')
const ADMIN_SRC = join(ADMIN, 'src')
const PUBLIC = join(ROOT, 'frontend/public')

const problems = []
const notes = []

function fail(file, line, message) {
  problems.push({ file, line, message })
}

function note(message) {
  notes.push(message)
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
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

function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Göreli yol — çıktıda okunur olsun diye. */
function rel(file) {
  return relative(ROOT, file)
}

/**
 * Yorumları boşlukla değiştirir, KONUM KORUNUR.
 *
 * NEDEN: Bu dosyadaki kontroller `vite.config.ts` ve `App.tsx` içinde
 * `base: '/spa/'` / `basename="/spa"` DESENİ arıyor. İlk sürüm yorumları
 * ayıklamıyordu ve bir NEDEN yorumunda `base: '/spa/'` yazdığı için
 * gerçek ayar SİLİNDİĞİ hâlde kontrol YEŞİL kaldı (yanlış yeşil —
 * mutasyon testinde yakalandı). Artık yalnız çalıştırılabilir kod taranır.
 *
 * Blok yorumu ve satır yorumu aynı uzunlukta boşlukla değiştirilir ki
 * `lineOf()` doğru satırı göstermeye devam etsin.
 */
function stripComments(src, { lineComments = true } = {}) {
  const blank = (s) => s.replace(/[^\n]/g, ' ')
  let out = src.replace(/\/\*[\s\S]*?\*\//g, blank)
  if (lineComments) {
    // `://` (URL) ve `\//` (kaçışlı bölme) yorum sayılmaz.
    out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)))
  }
  return out
}

// ---------------------------------------------------------------------------
// 1. İskelet — dizin VAR ama dosyalar eksikse yeşil verme
// ---------------------------------------------------------------------------

const PKG = join(ADMIN, 'package.json')

if (!existsSync(ADMIN)) {
  fail('admin/', 0, 'admin/ dizini yok — SPA iskeleti kurulmamış')
} else if (!existsSync(PKG)) {
  fail(rel(PKG), 0, 'package.json yok — npm ci/build çalışmaz')
} else {
  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(PKG, 'utf8'))
  } catch (e) {
    fail(rel(PKG), 0, `package.json ayrıştırılamadı: ${e.message}`)
  }

  if (pkg) {
    for (const script of ['dev', 'build', 'typecheck']) {
      if (!pkg.scripts || typeof pkg.scripts[script] !== 'string') {
        fail(rel(PKG), 0, `"scripts.${script}" tanımlı değil — Task 12 CI bu script'i çağıracak`)
      }
    }
    // Build ÖNCE typecheck çalıştırmalı: tip hatası yayına gitmesin.
    const build = pkg.scripts?.build ?? ''
    if (build && !/\btsc\b/.test(build)) {
      fail(rel(PKG), 0, `"build" tip kontrolü yapmıyor ("${build}") — "tsc --noEmit && vite build" olmalı`)
    }

    // UI kütüphanesi / veri katmanı YASAK (spec §9.1: elle yazılır).
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    const banned = [
      'react-query',
      '@tanstack/react-query',
      'swr',
      'axios',
      'antd',
      'ant-design',
      '@mui/material',
      '@chakra-ui/react',
      'bootstrap',
      'tailwindcss',
      'styled-components',
      '@emotion/react',
      'zustand',
      'redux',
      '@reduxjs/toolkit',
    ]
    for (const name of Object.keys(deps)) {
      if (banned.includes(name)) {
        fail(rel(PKG), 0, `yasak bağımlılık: ${name} — spec §9.1 "UI kütüphanesi YOK, React Query YOK"`)
      }
    }

    // `npm ci` kilit dosyası olmadan HATA verir (plan Task 12 bunu çağırıyor).
    if (!existsSync(join(ADMIN, 'package-lock.json'))) {
      fail('admin/package-lock.json', 0, 'kilit dosyası yok — "npm ci" başarısız olur, commit edilmeli')
    }

    for (const dep of ['react', 'react-dom', 'react-router-dom']) {
      if (!pkg.dependencies || !pkg.dependencies[dep]) {
        fail(rel(PKG), 0, `"${dep}" bağımlılığı yok`)
      }
    }
  }
}

// TypeScript katılığı — backend/tsconfig.json deseniyle aynı
const TSCONFIG = join(ADMIN, 'tsconfig.json')
{
  const src = readText(TSCONFIG)
  if (src === null) {
    fail('admin/tsconfig.json', 0, 'tsconfig.json yok')
  } else {
    // Yorumları at (tsconfig JSONC olabilir) — kaba ama yeterli.
    const stripped = src.replace(/^\s*\/\/.*$/gm, '')
    let cfg = null
    try {
      cfg = JSON.parse(stripped)
    } catch (e) {
      fail('admin/tsconfig.json', 0, `ayrıştırılamadı: ${e.message}`)
    }
    if (cfg) {
      const co = cfg.compilerOptions ?? {}
      for (const flag of ['strict', 'noUncheckedIndexedAccess', 'noUnusedLocals', 'noUnusedParameters']) {
        if (co[flag] !== true) {
          fail('admin/tsconfig.json', 0, `"${flag}": true eksik — backend deseniyle uyumsuz`)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Vite yapılandırması — base ve outDir
// ---------------------------------------------------------------------------

const VITE_CONFIG = join(ADMIN, 'vite.config.ts')
{
  const src = readText(VITE_CONFIG)
  if (src === null) {
    fail('admin/vite.config.ts', 0, 'vite.config.ts yok')
  } else {
    // YORUMLAR AYIKLANIR: dosya `base: '/spa/'` ifadesini bir NEDEN
    // yorumunda da geçiriyor. Yorumlar taranırsa ayar silindiğinde bile
    // kontrol yeşil kalır (mutasyon testinde tam olarak bu oldu).
    const code = stripComments(src)

    // Varlık yolları: base olmadan /spa/ altındaki derin bağlantıda
    // /assets/index-xxx.js isteği 404 olur.
    if (!/base\s*:\s*['"]\/spa\/['"]/.test(code)) {
      fail('admin/vite.config.ts', 0, `base: '/spa/' tanımlı değil — varlık yolları kırılır`)
    } else {
      note("vite.config.ts: base '/spa/' ✓")
    }

    // Çıktı doğrudan Cloudflare Pages'in yayınladığı dizine gitmeli;
    // ayrı bir kopyalama adımı CI'da unutulur.
    if (!/outDir\s*:\s*['"]\.\.\/frontend\/public\/spa['"]/.test(code)) {
      fail('admin/vite.config.ts', 0, `outDir: '../frontend/public/spa' tanımlı değil`)
    } else {
      note("vite.config.ts: outDir '../frontend/public/spa' ✓")
    }

    if (!/emptyOutDir\s*:\s*true/.test(code)) {
      fail('admin/vite.config.ts', 0, 'emptyOutDir: true yok — eski varlıklar birikir')
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Kaynak dosyalar — gerçekten var mı
// ---------------------------------------------------------------------------

const REQUIRED_SOURCES = [
  'src/main.tsx',
  'src/App.tsx',
  'src/styles/tokens.css',
  'src/styles/app.css',
  'src/components/Layout.tsx',
  'index.html',
]

for (const relPath of REQUIRED_SOURCES) {
  if (!existsSync(join(ADMIN, relPath))) {
    fail(`admin/${relPath}`, 0, 'dosya yok — iskelet eksik')
  }
}

// ---------------------------------------------------------------------------
// 4. Tasarım tokenları — spec §9.1 BİREBİR
// ---------------------------------------------------------------------------

/**
 * Değerler `docs/superpowers/specs/2026-11-05-admin-paneli-design.md`
 * §9.1'deki bloktan birebir alınmıştır. Token uydurulursa marka kimliği
 * davetiye sayfasından kopar; bu yüzden değer de karşılaştırılır.
 */
const EXPECTED_TOKENS = {
  gold: '#a8925f',
  'gold-strong': '#8a7443',
  sage: '#4a5f45',
  'sage-soft': '#eef1ec',
  cream: '#f4f2ee',
  surface: '#ffffff',
  ink: '#2d3a2e',
  'ink-soft': '#55604f',
  muted: '#6a6459',
  line: '#e4e0d8',
  ok: '#2f6b46',
  'ok-soft': '#e8f2ec',
  warn: '#8a5f1f',
  'warn-soft': '#f7efe0',
  danger: '#8c2f2f',
  'danger-soft': '#f8eaea',
  's-1': '4px',
  's-2': '8px',
  's-3': '12px',
  's-4': '16px',
  's-5': '24px',
  's-6': '32px',
  's-7': '48px',
  radius: '10px',
  'radius-lg': '16px',
}

const TOKENS_CSS = join(ADMIN, 'src/styles/tokens.css')
{
  const src = readText(TOKENS_CSS)
  if (src !== null) {
    /** `--ad: deger` çiftlerini topla (ilk tanım geçerli). */
    const declared = new Map()
    const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/g
    let m
    while ((m = re.exec(src)) !== null) {
      const name = m[1]
      if (!declared.has(name)) declared.set(name, m[2].trim().toLowerCase())
    }

    // Brief'in açıkça istediği beş token — eksikse doğrudan ihlal.
    for (const name of ['gold', 'sage', 'cream', 'ink', 's-7']) {
      if (!declared.has(name)) {
        fail('admin/src/styles/tokens.css', 0, `--${name} tanımlı değil`)
      }
    }

    for (const [name, expected] of Object.entries(EXPECTED_TOKENS)) {
      const actual = declared.get(name)
      if (actual === undefined) {
        fail('admin/src/styles/tokens.css', 0, `--${name} tanımlı değil (spec §9.1)`)
      } else if (actual !== expected) {
        fail(
          'admin/src/styles/tokens.css',
          0,
          `--${name}: ${actual} — spec §9.1'deki değer ${expected} (token uydurulmamalı)`,
        )
      }
    }

    if (!declared.has('font-display') || !declared.has('font-body')) {
      fail('admin/src/styles/tokens.css', 0, '--font-display / --font-body tanımlı değil')
    }
    if (!declared.has('shadow-1') || !declared.has('shadow-2')) {
      fail('admin/src/styles/tokens.css', 0, '--shadow-1 / --shadow-2 tanımlı değil')
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Router basename — /spa/users derin bağlantısı eşleşsin
// ---------------------------------------------------------------------------

const APP_TSX = join(ADMIN, 'src/App.tsx')
{
  const src = readText(APP_TSX)
  if (src !== null) {
    // YORUMLAR AYIKLANIR: App.tsx `basename="/spa"` ifadesini bir NEDEN
    // yorumunda da anıyor. Yorum taranırsa gerçek prop silindiğinde
    // kontrol yeşil kalır (mutasyon testinde yakalandı).
    const code = stripComments(src)

    // `base: '/spa/'` yalnız varlık yollarını düzeltir. Router basename
    // almazsa /spa/users hiçbir rotaya uymaz ve panel boş açılır.
    if (!/basename\s*=\s*["']\/spa["']/.test(code)) {
      fail('admin/src/App.tsx', 0, `BrowserRouter basename="/spa" yok — derin bağlantı eşleşmez`)
    } else {
      note('App.tsx: basename="/spa" ✓')
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Güvenlik — admin/src/** üzerinde desen taraması
// ---------------------------------------------------------------------------

/**
 * Token `localStorage`'a YAZILMAZ (spec §9 "Güvenlik"): oturum HttpOnly
 * cookie'de durur, SPA yalnız `credentials: 'include'` ile istek atar.
 * `localStorage`'a yazılan bir token XSS'te doğrudan çalınır.
 */
const SRC_FILES = walk(ADMIN_SRC).filter((f) => /\.(ts|tsx|js|jsx|mjs|css|html)$/.test(f))

if (existsSync(ADMIN_SRC) && SRC_FILES.length === 0) {
  fail('admin/src/', 0, 'kaynak dosya yok — iskelet kurulmamış')
}

for (const file of SRC_FILES) {
  // Yorumlar ayıklanır: "şunu YAPMA" diye yazılmış bir uyarı yorumu
  // (`// localStorage.setItem KULLANMA`) ihlal sayılmamalı. Ayrıca
  // yorumdaki desen yüzünden gerçek ihlalin gözden kaçması da önlenir.
  // `.css`/`.html` için `//` yorumu yok — orada yalnız blok yorumu atılır.
  const raw = readFileSync(file, 'utf8')
  const isCss = file.endsWith('.css') || file.endsWith('.html')
  const src = stripComments(raw, { lineComments: !isCss })
  const fileRel = rel(file)

  // 6a. Kalıcı depoya token yazımı
  const storageRe = /\b(localStorage|sessionStorage)\s*\.\s*setItem\s*\(/g
  let m
  while ((m = storageRe.exec(src)) !== null) {
    fail(
      fileRel,
      lineOf(src, m.index),
      `${m[1]}.setItem — token HttpOnly cookie'de tutulur, kalıcı depoya YAZILMAZ`,
    )
  }

  // 6b. innerHTML ailesi — kullanıcı verisi XSS'e açılır
  for (const pattern of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    const re = new RegExp(`\\.${pattern}\\s*=`, 'g')
    while ((m = re.exec(src)) !== null) {
      fail(fileRel, lineOf(src, m.index), `${pattern} kullanılıyor — metin React ile (JSX) basılmalı (XSS)`)
    }
  }
  if (/dangerouslySetInnerHTML/.test(src)) {
    const i = src.search(/dangerouslySetInnerHTML/)
    fail(fileRel, lineOf(src, i), 'dangerouslySetInnerHTML kullanılıyor — XSS riski')
  }

  // 6c. eval / new Function
  if (/\beval\s*\(/.test(src)) {
    fail(fileRel, lineOf(src, src.search(/\beval\s*\(/)), 'eval() kullanılıyor — güvenlik riski')
  }

  // 6d. Oturum cookie'si JS'ten okunamaz/yazılamaz.
  //     `a_csrf` okuması Task 10'da SERBEST (HttpOnly değil), `a_session` ASLA.
  const sessionRe = /\ba_session\b/g
  while ((m = sessionRe.exec(src)) !== null) {
    fail(
      fileRel,
      lineOf(src, m.index),
      'a_session (oturum token\'ı) kaynak kodda geçiyor — HttpOnly cookie tarayıcı yönetir, JS dokunmaz',
    )
  }

  // 6e. Token'ı cookie'ye yazma girişimi
  const cookieWriteRe = /document\.cookie\s*=/g
  while ((m = cookieWriteRe.exec(src)) !== null) {
    const line = src.slice(m.index, src.indexOf('\n', m.index) === -1 ? undefined : src.indexOf('\n', m.index))
    if (/a_session|token|session/i.test(line)) {
      fail(fileRel, lineOf(src, m.index), 'document.cookie ile oturum token\'ı yazılıyor — token HttpOnly olmalı')
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Yayın yapılandırması — _redirects / _headers
// ---------------------------------------------------------------------------

const REDIRECTS = join(PUBLIC, '_redirects')
{
  const src = readText(REDIRECTS)
  if (src === null) {
    fail('frontend/public/_redirects', 0, '_redirects yok')
  } else {
    const rules = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter((r) => r.line && !r.line.startsWith('#'))

    const spaRules = rules.filter((r) => /^\/spa\/\*\s+\/spa\/index\.html\s+200$/.test(r.line))
    if (spaRules.length === 0) {
      fail('frontend/public/_redirects', 0, '"/spa/*  /spa/index.html  200" kuralı yok — SPA derin bağlantısı 404')
    } else {
      // Sıra ÖNEMLİ: /spa/* kuralı öne geçerse /d/:token veya /auth
      // kuralları gölgelenebilir (Cloudflare ilk eşleşeni uygular).
      const last = rules[rules.length - 1]
      if (last !== undefined && last.line !== spaRules[0].line) {
        fail(
          'frontend/public/_redirects',
          last.no,
          `/spa/* kuralı en sonda olmalı — son kural: "${last.line}"`,
        )
      } else {
        note('_redirects: /spa/* kuralı en sonda ✓')
      }
    }
  }
}

const HEADERS = join(PUBLIC, '_headers')
{
  const src = readText(HEADERS)
  if (src === null) {
    fail('frontend/public/_headers', 0, '_headers yok')
  } else {
    // Bloklar: satır başında boşluk olmayan satır yeni blok açar.
    const blocks = src.split(/\n(?=\S)/)
    const spaBlock = blocks.find((b) => b.split('\n')[0]?.trim() === '/spa/*')
    if (!spaBlock) {
      fail('frontend/public/_headers', 0, '"/spa/*" bloğu yok — panel arama motoruna açık kalır')
    } else {
      const body = spaBlock.toLowerCase()
      if (!/x-robots-tag\s*:\s*noindex\s*,\s*nofollow/.test(body)) {
        fail('frontend/public/_headers', 0, '/spa/* bloğunda "X-Robots-Tag: noindex, nofollow" yok')
      }
      if (!/cache-control\s*:\s*no-store/.test(body)) {
        fail('frontend/public/_headers', 0, '/spa/* bloğunda "Cache-Control: no-store" yok')
      }
      if (/x-robots-tag/.test(body) && /cache-control\s*:\s*no-store/.test(body)) {
        note('_headers: /spa/* noindex + no-store ✓')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 8. .gitignore — build çıktısı ve node_modules commit'e girmesin
// ---------------------------------------------------------------------------

{
  const src = readText(join(ROOT, '.gitignore'))
  if (src === null) {
    fail('.gitignore', 0, '.gitignore yok')
  } else {
    const lines = src.split('\n').map((l) => l.trim())
    // Build çıktısı CI üretir; commit edilirse derleme çıktısı kaynakla
    // karışır ve "git status" her build'de kirlenir.
    for (const entry of ['frontend/public/spa/', 'admin/node_modules/', 'admin/dist/']) {
      if (!lines.includes(entry)) {
        fail('.gitignore', 0, `"${entry}" yok — build çıktısı / bağımlılıklar commit'e girer`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------------

if (problems.length === 0) {
  console.log(`✅ Admin SPA kontrolleri temiz (${SRC_FILES.length} kaynak dosyası)`)
  for (const n of notes) console.log(`   ${n}`)
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
