# Davetiye Şablonları — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Misafir davetiyesine 11 seçilebilir şablon + 10 fontluk tipografi seçimi eklemek ve tanıtım sayfasını onaylanan `landing-v3` tasarımıyla yeniden yazmak.

**Architecture:** Şablonlar kod içinde sabit CSS token setleri (`data-template`) olarak yaşar; veritabanında yalnız `template` ve `font_key` metin sütunları tutulur. Davetiye sayfası tek statik HTML kalır, seçilen şablona göre `<body>` niteliği değişir. Fontlar `assets/fonts/` altından `latin` + `latin-ext` alt kümeleriyle yüklenir.

**Tech Stack:** TypeScript + Express + Drizzle ORM + PostgreSQL (backend), Kotlin Multiplatform + Compose (mobil), statik HTML/CSS (davetiye + tanıtım).

**Spec:** `docs/superpowers/specs/2026-11-03-davetiye-sablonlari-design.md`

## Global Constraints

- **11 şablon anahtarı:** `ZARIF`, `BOTANIK`, `ROMANTIK`, `MINIMAL`, `GECE`, `ZEYTIN`, `EDITORYAL`, `MONOGRAM`, `LUKS`, `FOTOGRAFLI`, `TIPOGRAFI`
- **10 font anahtarı:** `PARISIENNE`, `GREAT_VIBES`, `DANCING_SCRIPT`, `ALLURA`, `SACRAMENTO`, `PLAYFAIR`, `CORMORANT`, `DM_SERIF`, `BODONI`, `JOSEFIN`
- **Varsayılan:** `template = 'ZARIF'`, `font_key = ''` (boş = şablonun önerilen fontu)
- **Bilinmeyen değer davranışı:** şablon → `ZARIF`, font → şablonun önerilen fontu. Sunucu normalleştirir; istemciye geçersiz değer gitmez.
- **Davetiye sayfası yüklenirken ASLA POST atmaz** (WhatsApp önizlemesi davetliyi habersiz "geliyorum" yapar)
- **Token `#fragment`'te kalır** (sunucu loglarına düşmez)
- **Open Graph etiketi eklenmez** — ne davetiyede ne tanıtımda
- **E-posta toplama yok** — tanıtım CTA'sında form bulunmaz
- **"Türkçe" / "Türkiye" ifadesi kullanılmaz** — sayfa zaten Türkçe yayınlanıyor
- **Font yükleme:** yalnız `latin` + `latin-ext` alt kümeleri, `font-display: swap` zorunlu
- **Davetiye sayfası hedef ağırlığı:** 150 KB altı
- **Yatay taşma yok:** `document.documentElement.scrollWidth === clientWidth` her kırılımda

## Review Focus

1. **Davetliye başka misafirin verisi sızması** — `PUBLIC_FIELDS` beyaz listesine alan eklerken `...row` yayılırsa telefon/`wedding_id` sızar. Her alan açıkça eklenir.
2. **Şablonu bozuk/boş düğünde beyaz ekran** — bilinmeyen `template` değeri CSS seçicisiyle eşleşmezse davetiye stilsiz kalır. `normalizeTemplate` her zaman geçerli bir anahtar döndürmeli.
3. **Türkçe glifi olmayan font** — `unicode-range` glifin var olduğunu garanti etmez. Mrs Saint Delafield bu yüzden elendi (1.968 baytlık `latin-ext`, `Ş` yok). Yeni font eklenirse dosya boyutu ve gerçek render kontrol edilir.
4. **Geçersiz `PATCH` gövdesinin 500 dönmesi** — bugün `weddingPatchSchema.parse` fırlatıyor ve `errorHandler` Zod'u tanımadığı için 500 üretiyor. 400 + alan bazlı mesaj beklenir.
5. **Mobilde yatay kaydırma** — glow/daire dekorları sabit px genişlikteyse 375px viewport'ta taşma yapar.

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `backend/src/db/schema.ts` | `template` + `font_key` sütunları |
| `backend/src/db/migrations/0007_*.sql` | Migration (drizzle-kit üretir) |
| `backend/src/weddings/templates.ts` | **YENİ** — şablon/font anahtar listeleri, önerilen font haritası, normalleştirme |
| `backend/src/weddings/service.ts` | `weddingInputSchema`'ya `template` + `fontKey`; `normalizeTemplate`/`normalizeFont` kullanımı |
| `backend/src/guests/public-view.ts` | `PUBLIC_FIELDS` + `toPublicInvitation` alanları |
| `backend/src/middleware/error-handler.ts` | Zod → 400 eşlemesi (merkezi) |
| `backend/src/routes/invitations.ts` | (değişmez — view üzerinden akar) |
| `frontend/public/d/index.html` | Editoryal DOM + 11 token seti + font yükleme |
| `frontend/public/index.html` | Onaylanan `landing-v3` tasarımı |
| `frontend/public/_headers` | `/assets/*` önbellek (yapıldı) |
| `mobile/.../ui/screens/TemplateScreen.kt` | **YENİ** — şablon + font seçimi |
| `mobile/.../ui/nav/Screen.kt` | `TEMPLATE` eklenir |
| `mobile/.../data/Models.kt` | `WeddingDto`'ya `template` + `fontKey` |

---

### Task 1: Şablon ve font kayıt defteri

**Files:**
- Create: `backend/src/weddings/templates.ts`
- Test: `backend/tests/weddings/templates.test.ts`

**Interfaces:**
- Produces:
  - `export const TEMPLATES: readonly string[]` — 11 anahtar
  - `export const FONTS: readonly string[]` — 10 anahtar
  - `export const DEFAULT_TEMPLATE = 'ZARIF'`
  - `export const RECOMMENDED_FONT: Record<string, string>` — her şablonun önerilen fontu
  - `export function normalizeTemplate(v: unknown): string`
  - `export function normalizeFont(template: unknown, font: unknown): string`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/weddings/templates.test.ts
import { describe, it, expect } from 'vitest'
import {
  TEMPLATES, FONTS, DEFAULT_TEMPLATE, RECOMMENDED_FONT,
  normalizeTemplate, normalizeFont,
} from '../../src/weddings/templates.js'

describe('templates registry', () => {
  it('11 şablon tanımlı', () => {
    expect(TEMPLATES).toHaveLength(11)
  })

  it('10 font tanımlı', () => {
    expect(FONTS).toHaveLength(10)
  })

  it('her şablonun önerilen fontu font listesinde', () => {
    for (const t of TEMPLATES) {
      expect(FONTS).toContain(RECOMMENDED_FONT[t])
    }
  })

  it('bilinmeyen şablon varsayılana düşer', () => {
    expect(normalizeTemplate('YOK')).toBe(DEFAULT_TEMPLATE)
    expect(normalizeTemplate(undefined)).toBe(DEFAULT_TEMPLATE)
    expect(normalizeTemplate(null)).toBe(DEFAULT_TEMPLATE)
    expect(normalizeTemplate(42)).toBe(DEFAULT_TEMPLATE)
  })

  it('geçerli şablon aynen döner', () => {
    expect(normalizeTemplate('GECE')).toBe('GECE')
  })

  it('boş font şablonun önerilen fontunu verir', () => {
    expect(normalizeFont('GECE', '')).toBe(RECOMMENDED_FONT['GECE'])
    expect(normalizeFont('GECE', undefined)).toBe(RECOMMENDED_FONT['GECE'])
  })

  it('geçersiz font önerilen fonta düşer', () => {
    expect(normalizeFont('GECE', 'YOK_FONT')).toBe(RECOMMENDED_FONT['GECE'])
  })

  it('geçerli font aynen döner', () => {
    expect(normalizeFont('GECE', 'BODONI')).toBe('BODONI')
  })

  it('geçersiz şablonla gelen font yine geçerli önerilene düşer', () => {
    expect(normalizeFont('YOK_SABLON', 'BODONI')).toBe('BODONI')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/weddings/templates.test.ts`
Expected: FAIL — "Cannot find module '../../src/weddings/templates.js'"

- [ ] **Step 3: Implement `backend/src/weddings/templates.ts`**

`TEMPLATES` ve `FONTS` sabit dizileri Global Constraints'teki anahtarlarla birebir yazılır. `RECOMMENDED_FONT` şu eşlemeyi taşır:

```ts
export const RECOMMENDED_FONT: Record<string, string> = {
  ZARIF: 'PARISIENNE', BOTANIK: 'GREAT_VIBES', ROMANTIK: 'DANCING_SCRIPT',
  MINIMAL: 'SACRAMENTO', GECE: 'GREAT_VIBES', ZEYTIN: 'ALLURA',
  EDITORYAL: 'PLAYFAIR', MONOGRAM: 'CORMORANT', LUKS: 'BODONI',
  FOTOGRAFLI: 'DM_SERIF', TIPOGRAFI: 'CORMORANT',
}
```

`normalizeTemplate(v)` → `TEMPLATES.includes(v) ? v : DEFAULT_TEMPLATE`.
`normalizeFont(t, f)` → önce `normalizeTemplate(t)` ile şablonu sabitle, sonra `FONTS.includes(f) ? f : RECOMMENDED_FONT[şablon]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/weddings/templates.test.ts`
Expected: PASS (9 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/weddings/templates.ts backend/tests/weddings/templates.test.ts
git commit -m "feat(weddings): template and font registry with normalization"
```

---

### Task 2: Veritabanı sütunları ve migration

**Files:**
- Modify: `backend/src/db/schema.ts` (`weddings` tablosu)
- Create: `backend/src/db/migrations/0007_<drizzle-üretir>.sql`

**Interfaces:**
- Produces: `weddings.template` (text, NOT NULL, default `'ZARIF'`), `weddings.fontKey` (text, NOT NULL, default `''`)

- [ ] **Step 1: Add columns to schema**

`weddings` tanımında `plan` satırının hemen altına:

```ts
    template: text('template').notNull().default('ZARIF'),
    fontKey: text('font_key').notNull().default(''),
```

- [ ] **Step 2: Generate migration**

Run: `cd backend && npm run db:generate`
Expected: `src/db/migrations/0007_*.sql` oluşur, içinde iki `ADD COLUMN` var.

- [ ] **Step 3: Verify migration content**

Run: `cd backend && cat src/db/migrations/0007_*.sql`
Expected: `ALTER TABLE "weddings" ADD COLUMN "template" text DEFAULT 'ZARIF' NOT NULL;` ve `ADD COLUMN "font_key" text DEFAULT '' NOT NULL;`

- [ ] **Step 4: Run migration verification**

Run: `cd backend && npm run verify:migrations`
Expected: PASS — PGlite üzerinde migration'lar hatasız uygulanır

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.ts backend/src/db/migrations/
git commit -m "feat(db): add template and font_key to weddings"
```

---

### Task 3: API sözleşmesi — düğün okuma/yazma

**Files:**
- Modify: `backend/src/weddings/service.ts:12-36` (`weddingInputSchema`)
- Modify: `backend/src/middleware/error-handler.ts` (Zod → 400)
- Test: `backend/tests/weddings/template-api.test.ts`

**Interfaces:**
- Consumes: `normalizeTemplate`, `normalizeFont`, `TEMPLATES`, `FONTS` (Task 1)
- Produces: `PATCH /api/v1/weddings/:id` gövdesinde `template` ve `fontKey` kabul eder; `GET /weddings` ve `GET /weddings/:id` yanıtlarında bu alanlar döner

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/weddings/template-api.test.ts
import { describe, it, expect } from 'vitest'
// mevcut test yardımcılarını kullan (app + auth helper)

describe('wedding template API', () => {
  it('geçerli şablon ve font kaydedilir', async () => {
    // PATCH { template: 'GECE', fontKey: 'BODONI' } → 200
    // yanıt: wedding.template === 'GECE', wedding.fontKey === 'BODONI'
  })

  it('geçersiz şablon 400 döner', async () => {
    // PATCH { template: 'YOK' } → 400
  })

  it('geçersiz font 400 döner', async () => {
    // PATCH { fontKey: 'YOK' } → 400
  })

  it('geçersiz coupleNames artık 400 döner (eskiden 500)', async () => {
    // PATCH { coupleNames: '' } → 400
    // gövde: { error: { code: 'VALIDATION_ERROR', details: { fields: [...] } } }
  })

  it('yetkisiz kullanıcı PATCH edemez', async () => {
    // başka kullanıcının düğünü → 403/404
  })
})
```

Test gövdeleri mevcut `backend/tests/` yardımcılarıyla doldurulur (app factory + auth helper).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/weddings/template-api.test.ts`
Expected: FAIL — geçersiz şablon 500 döndüğü için 400 beklentisi kırılır

- [ ] **Step 3: Extend `weddingInputSchema`**

`rsvpDeadline` alanının altına:

```ts
  template: z.enum(TEMPLATES as [string, ...string[]]).optional(),
  fontKey: z.enum(FONTS as [string, ...string[]]).optional(),
```

`weddingPatchSchema` zaten `.partial()` olduğu için otomatik kapsar.

- [ ] **Step 4: Map Zod errors to 400 in the central error handler**

`toHttpError` diye bir yardımcı **yok** — bu adım onu ekler. Bugün
`errorHandler` Zod hatasını tanımıyor ve 500 dönüyor.

`backend/src/middleware/error-handler.ts` içinde, `AppError` kontrolünden
**önce** bir Zod dalı eklenir:

```ts
import { ZodError } from 'zod'

// errorHandler içinde, `if (err instanceof AppError)` bloğunun ÜSTÜNE:
  if (err instanceof ZodError) {
    logger.debug({ path: safePath(req), method: req.method }, 'validation error')
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Gönderilen veri geçersiz',
        details: {
          fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
    })
    return
  }
```

Merkezi handler'da yapılır çünkü **tüm** router'lar aynı davranışı kazanır.
`details.fields` alan yollarını ve mesajları taşır; ham Zod yapısı sızmaz.

Bu değişiklik `coupleNames`, `weddingDate`, `mapUrl` gibi alanların da artık
400 dönmesi demektir — bilinçli davranış değişikliği, testlerle kapsanır.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/weddings/template-api.test.ts`
Expected: PASS (5 test)

- [ ] **Step 6: Run full backend suite**

Run: `cd backend && npm test`
Expected: Tüm testler geçer (905 + yeni testler)

- [ ] **Step 7: Commit**

```bash
git add backend/src/weddings/service.ts backend/src/routes/weddings.ts backend/tests/weddings/
git commit -m "feat(weddings): accept template and fontKey, map validation errors to 400"
```

---

### Task 4: Davetli görünümüne şablon alanları

**Files:**
- Modify: `backend/src/guests/public-view.ts` (`PUBLIC_FIELDS`, `PublicInvitation`, `toPublicInvitation`)
- Test: `backend/tests/guests/public-view.test.ts` (mevcut test dosyası)

**Interfaces:**
- Consumes: `normalizeTemplate`, `normalizeFont` (Task 1)
- Produces: `GET /api/v1/invitations/:token` yanıtında `template` ve `fontKey` alanları

- [ ] **Step 1: Write the failing test**

```ts
// mevcut public-view test dosyasına ekle
it('yanıtta template ve fontKey var', () => {
  const view = toPublicInvitation(row)
  expect(view).not.toBeNull()
  expect(view!.template).toBe('ZARIF')
  expect(view!.fontKey).toBe('PARISIENNE')
})

it('bilinmeyen şablon ZARIF döner', () => {
  const view = toPublicInvitation({ ...row, wedding: { ...row.wedding, template: 'BOZUK' } })
  expect(view!.template).toBe('ZARIF')
})

it('boş font şablonun önerilen fontunu verir', () => {
  const view = toPublicInvitation({ ...row, wedding: { ...row.wedding, template: 'GECE', fontKey: '' } })
  expect(view!.fontKey).toBe('GREAT_VIBES')
})

it('PUBLIC_FIELDS tam-anahtar listesi güncel', () => {
  // mevcut test PUBLIC_FIELDS'i view anahtarlarıyla karşılaştırıyor
  expect(PUBLIC_FIELDS).toContain('template')
  expect(PUBLIC_FIELDS).toContain('fontKey')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/guests/public-view.test.ts`
Expected: FAIL — `template` undefined

- [ ] **Step 3: Add fields to whitelist and builder**

`PUBLIC_FIELDS` dizisine `'template'` ve `'fontKey'` eklenir (mevcut sıralamanın sonuna).
`PublicInvitation` arayüzüne `template: string` ve `fontKey: string`.
`toPublicInvitation` dönüşüne:

```ts
    template: normalizeTemplate(w.template),
    fontKey: normalizeFont(w.template, w.fontKey),
```

`...row` yayma **kullanılmaz** — alanlar açıkça yazılır.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/guests/public-view.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/guests/public-view.ts backend/tests/guests/
git commit -m "feat(guests): expose template and fontKey in public invitation view"
```

---

### Task 5: Davetiye sayfası — editoryal DOM ve şablon tokenları

**Files:**
- Modify: `frontend/public/d/index.html`

**Interfaces:**
- Consumes: `GET /invitations/:token` yanıtındaki `template` + `fontKey` (Task 4)
- Produces: `<body data-template data-font>` nitelikleri; 11 token seti; font `@font-face` kuralları

- [ ] **Step 1: Add font faces and token sets to `<style>`**

Her font için `latin` + `latin-ext` çifti (spec §11'deki şablon birebir):

```css
@font-face {
  font-family: 'Parisienne';
  src: url('/assets/fonts/parisienne-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F;
  font-display: swap;
}
```

Sonra her şablon için `[data-template="X"]` bloğu: `--t-bg`, `--t-card`, `--t-ink`, `--t-muted`, `--t-accent`, `--t-accent-ink`, `--t-line`, `--t-radius`, `--t-font-display`, `--t-rule`, `--t-align`.

- [ ] **Step 2: Restructure the card markup**

`<div class="card" id="invite">` içi editoryal yapıya çevrilir: `.rule` (üst çizgi), `header` (`.eyebrow`, `h1#coupleNames`, `.divider`, `.salutation`), `.details`, `.program`, `.gift`, `.rsvp`.

Mevcut `id`'ler **korunur**: `coupleNames`, `guestName`, `dateText`, `venueText`, `venueRow`, `program`, `giftNote`, `rsvpBox`, `rsvpHint`, `confirmedLine`, `confirmedPill`, `btnYes`, `btnNo`, `sizeBox`, `sizeLabel`, `btnMinus`, `btnPlus`, `sizeValue`, `status`, `closedBox`.

`<p class="grow">` kartın **dışında**, altında kalır.

- [ ] **Step 3: Apply template and font from data**

`render()` fonksiyonunun başına:

```js
  document.body.dataset.template = normalizeTemplate(data.template)
  document.body.dataset.font = normalizeFont(data.template, data.fontKey)
```

Dosyanın üstüne sabitler:

```js
const TEMPLATES = ['ZARIF','BOTANIK','ROMANTIK','MINIMAL','GECE','ZEYTIN',
                   'EDITORYAL','MONOGRAM','LUKS','FOTOGRAFLI','TIPOGRAFI']
const FONTS = ['PARISIENNE','GREAT_VIBES','DANCING_SCRIPT','ALLURA','SACRAMENTO',
               'PLAYFAIR','CORMORANT','DM_SERIF','BODONI','JOSEFIN']
const RECOMMENDED_FONT = { ZARIF:'PARISIENNE', BOTANIK:'GREAT_VIBES', /* ... Task 1 ile aynı */ }
function normalizeTemplate(t) { return TEMPLATES.includes(t) ? t : 'ZARIF' }
function normalizeFont(t, f) {
  return FONTS.includes(f) ? f : RECOMMENDED_FONT[normalizeTemplate(t)]
}
```

- [ ] **Step 4: Verify page loads without write**

Davetiyeyi tarayıcıda aç, Network sekmesinde **yalnız GET** istekleri olduğunu doğrula. `POST` görünmemeli.

- [ ] **Step 5: Verify no horizontal overflow**

Mobil viewport (375px) ve masaüstü (1280px) için konsolda:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
```
Expected: `true` (her iki genişlikte)

- [ ] **Step 6: Commit**

```bash
git add frontend/public/d/index.html
git commit -m "feat(invitation): editorial layout with 11 templates and font loading"
```

---

### Task 6: Tanıtım sayfası

**Files:**
- Modify: `frontend/public/index.html`

**Interfaces:**
- Consumes: `assets/fonts/`, `assets/motifs/` (hazır), onaylanan `landing-v3.html`

- [ ] **Step 1: Replace index.html with approved design**

`.superpowers/brainstorm/534827-1793690261/content/landing-v3.html` içeriği `frontend/public/index.html`'e taşınır. Yol düzeltmeleri:

- `/files/xxx.woff2` → `/assets/fonts/xxx.woff2`
- `/files/xxx.webp` → `/assets/motifs/xxx.webp`

`<title>` → `Düğünce — Düğün hazırlığın tek yerde`, `<meta name="description">` eklenir.

- [ ] **Step 2: Verify no horizontal overflow on mobile**

375px viewport'ta:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
```
Expected: `true`

- [ ] **Step 3: Verify mobile menu opens and closes**

`#navToggle` tıkla → `.mobile-menu.open` eklenir, `aria-expanded="true"`. Bir linke tıkla → kapanır.

- [ ] **Step 4: Verify FAQ accordion**

`.fq:nth-child(2) .fq-q` tıkla → `.fq.open` eklenir, cevap yüksekliği 0'dan >0'a çıkar.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/index.html
git commit -m "feat(landing): replace placeholder with approved v3 design"
```

---

### Task 7: Mobil — şablon ve font seçim ekranı

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/screens/TemplateScreen.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/ui/nav/Screen.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/dugunce/app/data/Models.kt`
- Test: `mobile/composeApp/src/commonTest/kotlin/com/dugunce/app/ui/screens/TemplateLabelsTest.kt`
- Test: `mobile/composeApp/src/commonTest/kotlin/com/dugunce/app/data/DtoContractTest.kt`

**Interfaces:**
- Consumes: `PATCH /weddings/:id` gövdesi `template` + `fontKey` (Task 3)
- Produces: `Screen.TEMPLATE`, `templateLabel(key): String`, `fontLabel(key): String`, `WeddingDto.template`, `WeddingDto.fontKey`

- [ ] **Step 1: Write the failing label test**

```kotlin
// TemplateLabelsTest.kt
class TemplateLabelsTest {
    @Test
    fun `on bir sablonun hepsi etiketli`() {
        assertEquals(11, TEMPLATE_KEYS.size)
        TEMPLATE_KEYS.forEach { assertTrue(templateLabel(it).isNotBlank()) }
    }

    @Test
    fun `on fontun hepsi etiketli`() {
        assertEquals(10, FONT_KEYS.size)
        FONT_KEYS.forEach { assertTrue(fontLabel(it).isNotBlank()) }
    }

    @Test
    fun `bilinmeyen sablon Zarif doner`() {
        assertEquals("Zarif", templateLabel("YOK"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && ./gradlew :composeApp:compileDebugUnitTestKotlinAndroid`
Expected: FAIL — `templateLabel` unresolved

- [ ] **Step 3: Implement labels and keys in `TemplateScreen.kt`**

`TEMPLATE_KEYS` (11), `FONT_KEYS` (10), `templateLabel(key)`, `fontLabel(key)` — Task 1'deki anahtarlarla birebir. Bilinmeyen anahtar `"Zarif"` döner.

- [ ] **Step 4: Add `TEMPLATE` to `Screen` enum and navigation**

`Screen.kt`'ye `TEMPLATE` eklenir; `isOnboarding()`, `isTab()` dışında kalır (alt ekran). `App.kt`'te ilgili `when` dalına eklenir. `ScreenCoverageTest` bunu otomatik kapsar.

- [ ] **Step 5: Add fields to `WeddingDto`**

`Models.kt`'de `WeddingDto`'ya `template: String = "ZARIF"` ve `fontKey: String = ""` eklenir.

- [ ] **Step 6: Add DtoContractTest assertions**

Mevcut `weddingJson` sabitine `"template": "GECE", "fontKey": "BODONI"` eklenir ve:

```kotlin
assertEquals("GECE", w.template)
assertEquals("BODONI", w.fontKey)
```

- [ ] **Step 7: Implement the screen UI**

`TemplateScreen`: 11 şablon kartı (renk kutusu + tipografi örneği), 10 font listesi, seçim durumu, kaydet butonu. Kaydederken `PATCH /weddings/:id` gövdesi `{ template, fontKey }`. Başarıda "Davetiyeniz güncellendi" mesajı.

Fotoğraf alanı **yer tutucu**: "Aşama 6'da geliyor" yazar, tıklanınca bilgi verir, devre dışı.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd mobile && ./gradlew :composeApp:compileDebugUnitTestKotlinAndroid`
Expected: PASS — derleme başarılı (testler CI'da koşar, bu makinede Android SDK yok)

- [ ] **Step 9: Commit**

```bash
git add mobile/composeApp/src/
git commit -m "feat(mobile): template and font selection screen"
```

---

## Plan Sonrası

Tüm görevler bittiğinde `verification-before-completion` ile:

```bash
cd backend && npm test          # tüm testler
cd backend && npm run typecheck # 0 hata
cd backend && npm run verify:migrations
```

Mobil doğrulama CI'da (`mobile-ci.yml`). Tanıtım ve davetiye sayfaları elle kontrol edilir.
