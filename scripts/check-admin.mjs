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
import { createRequire } from 'node:module'

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
 * Kaynaktaki YORUMLARI boşlukla değiştirir; KONUM KORUNUR.
 *
 * NEDEN GEREKLİ: Kontroller `base: '/spa/'`, `basename="/spa"`, `--gold`
 * gibi DESENLER arıyor. Yorumlar ayıklanmazsa bir NEDEN yorumunda aynı
 * metin geçtiği için gerçek ayar SİLİNDİĞİ hâlde kontrol YEŞİL kalır.
 *
 * NEDEN ELLE YAZILMIŞ TARAYICI DEĞİL — iki kez yanlış yaptım:
 *
 *  1. sürüm: saf regex `//` gördüğü her yerde satırı siliyordu. String
 *     veya JSX attribute içindeki `//` yüzünden GERÇEK ihlal gizlendi
 *     (`const junk = "a//b"; localStorage.setItem(...)`).
 *  2. sürüm: string/template farkındalıklı elle yazılmış tarayıcı. Bu
 *     kez de REGEX LİTERALİNİ bilmiyordu: `.tsx`'te
 *     `if (/^https?:\/\//.test(u)) el.innerHTML = u` satırında `//`
 *     regex'in parçası olduğu hâlde yorum sanılıp satır silindi ve
 *     GERÇEK XSS kaçtı. Ayrıca JSX süslü-parantez yorumları ve apostroflu
 *     JSX metni yüzünden yanlış kırmızı üretti.
 *
 * Ders: JS/TS/JSX sözdizimini elle taklit etmek kaybedilen bir savaş.
 * TypeScript zaten bağımlılık (`admin/node_modules/typescript`), kendi
 * ayrıştırıcısını kullanıyoruz: `createSourceFile` + `getLeadingCommentRanges`
 * / `getTrailingCommentRanges` yorumları KESİN olarak bulur.
 *
 * Ayrıştırıcı yüklenemezse GÜVENLİ tarafa düşeriz: hiçbir şeyi silmeyiz
 * (yanlış kırmızı üretmek, yanlış yeşilden iyidir — ama ikisi de
 * raporlanır).
 *
 * @param {string} src
 * @param {{file?: string}} [opts] `file`: uzantıya göre dil seçilir.
 */
function stripComments(src, { file = '' } = {}) {
  const isCss = file.endsWith('.css')
  const isHtml = file.endsWith('.html')

  // CSS/HTML: TypeScript ayrıştırıcısı bunları ANLAMAZ. Bu dosyalarda
  // `//` yorum DEĞİL (CSS'te `url(http://...)` bozulurdu), yalnız
  // `/* ... */` yorumdur.
  if (isCss || isHtml) return stripBlockCommentsOnly(src)

  let ts
  try {
    ts = loadTypeScript()
  } catch (err) {
    // Ayrıştırıcı yok — SESSİZCE bozulma. Yorum ayıklanamazsa güvenlik
    // taraması yorum içindeki metni ihlal sanar (yanlış kırmızı) ya da
    // tersi. İkisi de kabul edilemez: CI'da `npm ci` bu adımdan ÖNCE
    // çalıştığı için buraya normalde düşülmez; düşülürse ortam bozuktur.
    fail(
      'admin/',
      0,
      'typescript ayrıştırıcısı yüklenemedi — güvenlik taraması yapılamaz ' +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        'Önce `cd admin && npm ci` çalıştırın.',
    )
    return src
  }

  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX
    : file.endsWith('.jsx') ? ts.ScriptKind.JSX
    : file.endsWith('.json') ? ts.ScriptKind.JSON
    : ts.ScriptKind.TS

  const sf = ts.createSourceFile(file || 'x.ts', src, ts.ScriptTarget.Latest, true, kind)

  // Yorum aralıklarını topla: her düğümün önündeki ve arkasındaki.
  const ranges = []
  const collect = (node) => {
    const leading = ts.getLeadingCommentRanges(src, node.getFullStart()) ?? []
    const trailing = ts.getTrailingCommentRanges(src, node.getEnd()) ?? []
    for (const r of [...leading, ...trailing]) ranges.push([r.pos, r.end])

    // JSX SÜSLÜ-PARANTEZ YORUMU: `{/* ... */}` ayrıştırıcı tarafından
    // `getLeadingCommentRanges` ile RAPORLANMAZ; `expression` alanı
    // OLMAYAN bir `JsxExpression` düğümü olarak görünür. Bu kontrol
    // olmadan yorum içindeki `innerHTML` gerçek ihlal sanılıp YANLIŞ
    // KIRMIZI üretiyordu (re-review'da ölçüldü).
    if (node.kind === ts.SyntaxKind.JsxExpression && !node.expression) {
      ranges.push([node.getStart(sf), node.getEnd()])
    }

    ts.forEachChild(node, collect)
  }
  collect(sf)

  // REGEX LİTERALİ: `getLeadingCommentRanges` bir düğümün önündeki
  // yorumları verir ama regex içindeki `//` yorum SANILMAZ — bu yüzden
  // regex güvenli. Yine de regex gövdesini AYRIK tutmak için AST'teki
  // RegularExpressionLiteral düğümlerini not edip, yorum aralıklarıyla
  // KESİŞENLERİ atarız.
  const regexRanges = []
  const collectRegex = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      regexRanges.push([node.getStart(sf), node.getEnd()])
    }
    ts.forEachChild(node, collectRegex)
  }
  collectRegex(sf)

  const overlapsRegex = (a, b) => regexRanges.some(([x, y]) => a < y && b > x)
  const finalRanges = ranges.filter(([a, b]) => !overlapsRegex(a, b))
  finalRanges.sort((a, b) => a[0] - b[0])

  const out = src.split('')
  for (const [pos, end] of finalRanges) {
    for (let k = pos; k < end && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }
  return out.join('')
}

/** CSS/HTML için: yalnız blok yorumlarını boşalt (satır konumu korunur). */
function stripBlockCommentsOnly(src) {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' '
      i = stop
      continue
    }
    i++
  }
  return out.join('')
}

/** TypeScript ayrıştırıcısını `admin/node_modules`ten yükler. */
function loadTypeScript() {
  const req = createRequire(join(ADMIN, 'package.json'))
  return req('typescript')
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
    const code = stripComments(src, { file: 'vite.config.ts' })

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
  const rawTokens = readText(TOKENS_CSS)
  // YORUMLAR AYIKLANIR: bir token yoruma taşınırsa (ör. `/* --gold */`)
  // ham metinde hâlâ görünür ve kontrol yanlış yeşil verir. Üretilen CSS'te
  // token TANIMSIZ olur, tema çöker.
  const src = rawTokens === null ? null : stripComments(rawTokens, { file: 'tokens.css' })
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
    const code = stripComments(src, { file: 'App.tsx' })

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
// `admin/index.html` DE taranır: Vite'ın giriş HTML'i, `<script>` bloğu
// taşıyabilir ve oradaki bir `localStorage.setItem`/`innerHTML` tam da
// kaçırmak istemediğimiz sınıftır. Önce yalnız `admin/src/` taranıyordu
// (re-review'da ölçüldü: index.html'e XSS koymak YEŞİL kalıyordu).
const SCAN_ROOTS = [ADMIN_SRC, join(ADMIN, 'index.html')]
const SRC_FILES = SCAN_ROOTS.flatMap((p) =>
  existsSync(p) && !statSync(p).isDirectory() ? [p] : walk(p),
).filter((f) => /\.(ts|tsx|js|jsx|mjs|css|html)$/.test(f))

if (existsSync(ADMIN_SRC) && SRC_FILES.length === 0) {
  fail('admin/src/', 0, 'kaynak dosya yok — iskelet kurulmamış')
}

for (const file of SRC_FILES) {
  const raw = readFileSync(file, 'utf8')
  const fileRel = rel(file)

  // HTML: ayrı bir yol. `<!-- -->` yorumları ve `<script>` içeriği
  // ayrıştırıcıyla değil, açık kurallarla işlenir.
  if (file.endsWith('.html')) {
    scanHtml(fileRel, raw)
    continue
  }

  // CSS: yalnız blok yorumu var; desen taraması CSS'te anlamsız
  // (innerHTML gibi kavramlar yok). Atla.
  if (file.endsWith('.css')) continue

  scanTs(fileRel, raw)
}

/**
 * HTML dosyası taraması.
 *
 * NEDEN AYRI: `<!-- ... -->` HTML yorumudur ama `/* *\/` DEĞİLDİR.
 * Önceki sürüm `.html` için yalnız blok yorumu ayıklıyordu; bu yüzden
 * `<!-- el.innerHTML = x yapma -->` gibi bir UYARI yorumu gerçek ihlal
 * sanılıp YANLIŞ KIRMIZI üretiyordu (doğrulamada ölçüldü).
 */
function scanHtml(fileRel, raw) {
  // HTML yorumlarını boşalt (satır konumu korunur).
  const noComments = raw.replace(/<!--[\s\S]*?-->/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  )
  // Yalnız `<script>` bloklarının İÇİNİ TS olarak tara: HTML etiketi
  // içindeki attribute'lar JS değildir.
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = scriptRe.exec(noComments)) !== null) {
    const body = m[1] ?? ''
    // Boş `<script src="...">` bloğu atlanır.
    if (body.trim() === '') continue
    const offset = m.index + m[0].indexOf(body)
    scanTs(fileRel, body, offset, noComments)
  }
}

/**
 * TS/TSX/JS/JSX taraması — AYRIŞTIRICI TABANLI.
 *
 * NEDEN REGEX DEĞİL (dört tur boyunca aynı sınıf hata çıktı):
 *  - `"Function( ile baslar"` gibi bir UI METNİ yanlış kırmızı üretti.
 *  - `window.Function(...)`, `globalThis.eval` gibi nokta-öncesi çağrılar
 *    kaçtı (regex asimetrisi).
 *  - `el["innerHTML"]` köşeli-parantez erişimi kaçtı.
 * Her yeni regex bir öncekinin açtığı deliği kapatırken yenisini açtı.
 *
 * Çözüm: TypeScript AST'si. `CallExpression` / `NewExpression` /
 * `PropertyAccessExpression` / `ElementAccessExpression` düğümleri
 * üzerinden İSİM eşleşmesi yapılır; metin literalleri düğüm DEĞİLDİR,
 * dolayısıyla yanlış kırmızı üretmez.
 */
function scanTs(fileRel, code, offset = 0, fullSrc = null) {
  let ts
  try {
    ts = loadTypeScript()
  } catch (err) {
    fail(
      'admin/',
      0,
      'typescript ayrıştırıcısı yüklenemedi — güvenlik taraması yapılamaz ' +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        'Önce `cd admin && npm ci` çalıştırın.',
    )
    return
  }

  // SCRIPT KIND UZANTIYA GÖRE — hepsini TSX saymak KÖR BIRAKIR.
  //
  // TSX'te `<Row>raw` bir JSX elementi sanılır; ayrıştırıcı kapanış
  // etiketi arar ve DOSYANIN KALANINI yutar. `.ts` dosyalarında tip
  // iddiası (`<Record<string,string>>raw`) bu yüzden tamamen geçerli
  // koddur ama TSX modunda ayrıştırmayı bozar ve sonraki TÜM ihlaller
  // görünmez olur (ölçüldü: exit=0, "temiz").
  const kind = fileRel.endsWith('.tsx') || fileRel.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : fileRel.endsWith('.js') || fileRel.endsWith('.mjs')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS

  const sf = ts.createSourceFile(`scan.${kind === ts.ScriptKind.TSX ? 'tsx' : 'ts'}`, code, ts.ScriptTarget.Latest, true, kind)

  // AYRIŞTIRMA HATASI = TARAMA YAPILAMADI. Kısmi AST ile devam etmek
  // "yanlış yeşil"dir: hata noktasından SONRAKİ her ihlal görünmez olur.
  // Sessizce geçmek yerine açıkça raporlanır.
  const diags = sf.parseDiagnostics ?? []
  if (diags.length > 0) {
    const first = diags[0]
    const pos = first.start ?? 0
    fail(
      fileRel,
      (fullSrc ?? code).slice(0, pos + offset).split('\n').length,
      `ayrıştırılamadı (${ts.flattenDiagnosticMessageText(first.messageText, ' ')}) — ` +
        'güvenlik taraması bu dosyada GÜVENİLİR DEĞİL',
    )
    return
  }

  const lineOfNode = (node) => {
    const pos = node.getStart(sf) + offset
    const src = fullSrc ?? code
    return src.slice(0, pos).split('\n').length
  }

  /** Erişim zincirinin son adını verir: `a.b.c` → 'c'. */
  const tailName = (node) => {
    if (!node) return null
    if (ts.isIdentifier(node)) return node.text
    if (ts.isPropertyAccessExpression(node)) return node.name.text
    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        return arg.text
      }
    }
    return null
  }

  /**
   * `document` zincirini çözer: `document`, `window.document`,
   * `self.document`, `globalThis.document`, `foo.document` → true.
   * SON ad `document` ise yeterli — hangi nesne üzerinden erişildiği
   * güvenlik açısından fark etmez.
   */
  const isDocumentChain = (node, tsx) => {
    if (!node) return false
    if (tsx.isIdentifier(node)) return node.text === 'document'
    if (tsx.isPropertyAccessExpression(node)) return node.name.text === 'document'
    if (tsx.isElementAccessExpression(node)) {
      const a = node.argumentExpression
      return !!a && (tsx.isStringLiteral(a) || tsx.isNoSubstitutionTemplateLiteral(a)) && a.text === 'document'
    }
    return false
  }

  /**
   * İfade GLOBAL bir nesneyi mi gösteriyor?
   *
   * `window`, `globalThis`, `self`, `this`, `global` → evet.
   * `document` gibi diğerleri de global sayılır (dolaylı erişim).
   * `tools` gibi kullanıcı tanımlı bir değişken → HAYIR; `tools.Function`
   * meşru olabilir ve ihlal sayılmamalı.
   */
  const GLOBAL_OWNERS = new Set(['window', 'globalThis', 'self', 'this', 'global', 'document'])
  const isGlobalOwner = (node, tsx) => {
    const name = tailName(node)
    if (name === null) return false
    // Bilinen global sahipler VEYA hiç çözülemeyen zincir (ör. `a.b.c`).
    return GLOBAL_OWNERS.has(name)
  }

  const STORAGE = new Set(['localStorage', 'sessionStorage'])
  const XSS_PROPS = new Set(['innerHTML', 'outerHTML'])
  const XSS_CALLS = new Set(['insertAdjacentHTML', 'write', 'writeln'])
  const DYN_CODE = new Set(['eval', 'Function'])

  const visit = (node) => {
    // 6a. localStorage.setItem / sessionStorage.setItem
    //     `["setItem"]` köşeli-parantez biçimi de `tailName` ile yakalanır.
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
        const method = tailName(callee)
        const owner = tailName(callee.expression)
        if (method === 'setItem' && STORAGE.has(owner)) {
          fail(
            fileRel,
            lineOfNode(node),
            `${owner}.setItem — token HttpOnly cookie'de tutulur, kalıcı depoya YAZILMAZ`,
          )
        }

        // 6b. innerHTML'e ATAMA `+=` da olabilir; PropertyAccess ile gelir.
        //     `insertAdjacentHTML(...)`, `document.write(...)`, `writeln`.
        if (XSS_CALLS.has(method)) {
          // SAHİPLİK ZİNCİRİ: `document.write`, `window.document.write`,
          // `self.document.write`, `globalThis.document.write` — hepsi aynı
          // API. Yalnız çıplak `document` Identifier'ını kabul etmek
          // `window.document.write`i kaçırıyordu (ölçüldü: regresyon).
          const isDocCall =
            method !== 'insertAdjacentHTML' &&
            isDocumentChain(callee.expression, ts)
          if (method === 'insertAdjacentHTML' || isDocCall) {
            fail(
              fileRel,
              lineOfNode(node),
              `${method}() kullanılıyor — metin React ile (JSX) basılmalı (XSS)`,
            )
          }
        }

        // 6c. eval / Function — nokta önekli biçimler de (window.eval,
        //     globalThis.Function) aynı riski taşır.
        //
        // YANLIŞ KIRMIZI KORUMASI: kullanıcı tanımlı bir üye de `Function`
        // adını taşıyabilir (`const tools = { Function: (s) => s }`).
        // Yalnız GLOBAL kabul edilen sahipler ihlal sayılır.
        if (DYN_CODE.has(method) && isGlobalOwner(callee.expression, ts)) {
          fail(
            fileRel,
            lineOfNode(node),
            `${method}() kullanılıyor — dinamik kod çalıştırma (güvenlik riski)`,
          )
        }
      }
      // Düz `eval(...)` / `Function(...)` — YALNIZ çıplak Identifier.
      //
      // `tools.Function("1")` kullanıcı tanımlı bir üye olabilir; onu
      // yakalamak YANLIŞ KIRMIZI üretiyordu. Nokta-önekli biçimler
      // (`window.Function`) yukarıdaki sahiplik kontrolünde ele alınır.
      if (ts.isIdentifier(callee) && DYN_CODE.has(callee.text)) {
        fail(
          fileRel,
          lineOfNode(node),
          `${callee.text}() kullanılıyor — dinamik kod çalıştırma (güvenlik riski)`,
        )
      }
    }

    // 6c'. `new Function(...)`
    if (ts.isNewExpression(node)) {
      const name = tailName(node.expression)
      if (DYN_CODE.has(name)) {
        fail(
          fileRel,
          lineOfNode(node),
          `new ${name}() kullanılıyor — dinamik kod çalıştırma (güvenlik riski)`,
        )
      }
    }

    // 6b'. innerHTML / outerHTML ATAMASI (düz veya `+=`).
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind
      const isAssign =
        op === ts.SyntaxKind.EqualsToken || op === ts.SyntaxKind.PlusEqualsToken
      if (isAssign) {
        const target = tailName(node.left)
        if (XSS_PROPS.has(target)) {
          fail(
            fileRel,
            lineOfNode(node),
            `${target} kullanılıyor — metin React ile (JSX) basılmalı (XSS)`,
          )
        }
      }
    }

    // 6b''. dangerouslySetInnerHTML / srcDoc — YALNIZ JSX attribute DEĞİL.
    //
    // `React.createElement("div", { dangerouslySetInnerHTML: ... })`,
    // düz nesne literali ve `{...{dangerouslySetInnerHTML}}` yayması da
    // aynı riski taşır. Yalnız `JsxAttribute` bakmak üçünü kaçırıyordu.
    if (ts.isJsxAttribute(node)) {
      const attr = node.name.getText(sf)
      if (attr === 'dangerouslySetInnerHTML' || attr === 'srcDoc') {
        fail(fileRel, lineOfNode(node), `${attr} kullanılıyor — XSS riski`)
      }
    }
    // Nesne literali anahtarı veya string anahtar: `{ dangerouslySetInnerHTML: x }`
    if (ts.isPropertyAssignment(node)) {
      const key = tailName(node.name)
      if (key === 'dangerouslySetInnerHTML' || key === 'srcDoc') {
        fail(fileRel, lineOfNode(node), `${key} kullanılıyor — XSS riski`)
      }
    }

    // 6d. `a_session` kaynak kodda GEÇMEMELİ.
    //
    // Yalnız TAM string literal değil: `getItem(`a_session`)` (template),
    // `<p>a_session</p>` (JSX metni) ve `"cookie=a_session=1"` (alt dize)
    // de aynı sızıntı sınıfıdır. Eski sürüm `\ba_session\b` ile her yerde
    // arıyordu; AST'ye geçerken daraltmak REGRESYON oldu.
    const A_SESSION = /\ba_session\b/
    let hit = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (A_SESSION.test(node.text)) hit = node
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (A_SESSION.test(node.text)) hit = node
    } else if (ts.isJsxText(node)) {
      if (A_SESSION.test(node.text)) hit = node
    } else if (ts.isTemplateExpression(node)) {
      // `a_session` yalnız head/tail'de değil, arada düz metinde de olabilir;
      // head/middle/tail yukarıda yakalanıyor, burada ek kontrol gerekmez.
    }
    if (hit) {
      fail(
        fileRel,
        lineOfNode(hit),
        "a_session (oturum token'ı) kaynak kodda geçiyor — HttpOnly cookie tarayıcı yönetir, JS dokunmaz",
      )
    }

    // 6e. `document.cookie = ...` yazımı.
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = tailName(node.left)
      const owner = ts.isPropertyAccessExpression(node.left) ? tailName(node.left.expression) : null
      if (target === 'cookie' && owner === 'document') {
        const text = node.getText(sf)
        if (/a_session|token|session/i.test(text)) {
          fail(
            fileRel,
            lineOfNode(node),
            "document.cookie ile oturum token'ı yazılıyor — token HttpOnly olmalı",
          )
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
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

    // CATCH-ALL HEDEFİ — `/spa/` olmalı, `/spa/index.html` DEĞİL.
    //
    // Cloudflare'in `_redirects` ayrıştırıcısı, `from` soneki `/*` olup
    // `to` değeri `/index(.html)?` ile biten kuralı "Infinite loop"
    // gerekçesiyle GEÇERSİZ sayar ve SESSİZCE yok sayar:
    //
    //   ▲ [WARNING] Found 1 invalid redirect rule:
    //     ▶︎ Infinite loop detected in this rule and has been ignored.
    //       at frontend/public/_redirects:39 | /spa/*  /spa/index.html  200
    //
    // Kural yok sayılınca `/spa/users` SPA kabuğu yerine KÖK index.html
    // (pazarlama sayfası) döner. Bu, gerçek `wrangler pages dev` ile
    // ölçüldü — doküman yorumu değil.
    //
    // Doğrusu `/spa/*  /spa/  200`: sondaki `/` HTML-handling ile
    // uzlaşır, kural KABUL edilir ve derin bağlantı SPA kabuğunu alır.
    const CATCH_ALL = /^\/spa\/\*\s+\/spa\/\s+200$/
    // Reddedilme sınıfı: `/*` + `/index(.html)?` ile biten hedef.
    const LOOPED = /^\/spa\/\*\s+\/spa\/index(?:\.html)?\s+200$/

    const spaRules = rules.filter((r) => CATCH_ALL.test(r.line))
    const looped = rules.filter((r) => LOOPED.test(r.line))

    if (looped.length > 0) {
      fail(
        'frontend/public/_redirects',
        looped[0].no,
        `"${looped[0].line}" Cloudflare tarafından REDDEDİLİR (infinite loop) — ` +
          'kural sessizce yok sayılır ve derin bağlantı pazarlama sayfası döndürür. ' +
          'Hedef `/spa/` olmalı: "/spa/*  /spa/  200"',
      )
    }

    if (spaRules.length === 0) {
      fail(
        'frontend/public/_redirects',
        0,
        '"/spa/*  /spa/  200" kuralı yok — SPA derin bağlantısı yanlış sayfa döndürür',
      )
    } else {
      // Sıra ÖNEMLİ: catch-all öne geçerse /d/:token veya /auth kuralları
      // gölgelenir (Cloudflare'de İLK eşleşen uygulanır).
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

      // VARLIK GÖLGELENMESİ — bu kontrol olmadan panel BEYAZ EKRAN açar.
      //
      // Cloudflare: "Redirects are always followed, regardless of whether
      // or not an asset matches". Yani catch-all, `/spa/assets/index-abc.js`
      // gerçek bir dosya olsa bile devreye girer ve JS yerine kabuk
      // (text/html) döner. Tarayıcı modülü çözemez, uygulama açılmaz.
      //
      // Bu hata sınıfı bu repoda YAŞANDI: `/d/:token` kuralı
      // `/d/map-link.mjs`i yutmuştu (commit 1d54e59).
      const spaIdx = rules.findIndex((r) => CATCH_ALL.test(r.line))
      const assetPass = rules.findIndex((r) => /^\/spa\/assets\/\*\s+\/spa\/assets\/:splat\s+200$/.test(r.line))

      if (assetPass === -1) {
        fail(
          'frontend/public/_redirects',
          spaIdx + 1,
          '/spa/assets/* için pass-through kuralı YOK — catch-all JS/CSS isteklerini ' +
            'HTML olarak döndürür ve panel beyaz ekran açar',
        )
      } else if (spaIdx !== -1 && assetPass > spaIdx) {
        fail(
          'frontend/public/_redirects',
          rules[assetPass].no,
          '/spa/assets/* pass-through kuralı catch-all\'DAN ÖNCE olmalı — ' +
            'sonra olursa catch-all önce eşleşir ve varlıklar gölgelenir',
        )
      } else {
        note('_redirects: /spa/assets/* pass-through catch-all\'dan önce ✓')
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

    // VARLIK ÖNBELLEĞİ + DETACH — ikisi birlikte doğru.
    //
    // `/spa/*` bloğu `no-store` yazar; `/spa/assets/*` bloğu `immutable`
    // yazar. Cloudflare `_headers` kurallarını BİRLEŞTİRİP aynı başlığı
    // virgülle eklediği için, `! Cache-Control` detach satırı olmadan
    // canlıda `no-store, public, max-age=31536000, immutable` gibi
    // ÇELİŞKİLİ bir değer oluşur. Satır silinirse kontrol yakalamalı.
    const assetBlock = blocks.find((b) => b.split('\n')[0]?.trim() === '/spa/assets/*')
    if (!assetBlock) {
      fail('frontend/public/_headers', 0, '"/spa/assets/*" bloğu yok — varlık önbelleği ayarlanmamış')
    } else {
      const body = assetBlock.toLowerCase()
      if (!/^\s*!\s*cache-control/m.test(body)) {
        fail(
          'frontend/public/_headers',
          0,
          '/spa/assets/* bloğunda "! Cache-Control" detach satırı YOK — ' +
            'üstteki /spa/* bloğunun "no-store" değeri birleşir ve ' +
            'çelişkili "no-store, public, immutable" başlığı oluşur',
        )
      } else if (!/cache-control\s*:\s*public[^\n]*immutable/.test(body)) {
        fail(
          'frontend/public/_headers',
          0,
          '/spa/assets/* bloğunda "Cache-Control: public, ..., immutable" yok — ' +
            "hash'li varlıklar her açılışta yeniden iner",
        )
      } else {
        note('_headers: /spa/assets/* immutable + detach ✓')
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
