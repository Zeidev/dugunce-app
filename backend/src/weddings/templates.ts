/**
 * Davetiye şablonları ve font kayıt defteri.
 *
 * Bu dosya TEK KAYNAK: hangi şablonların ve fontların var olduğunu, her
 * şablonun hangi fontu önerdiğini burada tanımlarız. Backend doğrulaması,
 * davetli görünümü ve mobil etiketler bu listelere dayanır.
 *
 * Şablonların görsel tanımı istemci tarafındadır (`[data-template="X"]`
 * CSS blokları) — burada yalnız anahtarlar ve önerilen font tutulur.
 *
 * `docs/superpowers/specs/2026-11-03-davetiye-sablonlari-design.md` §5.
 */

/** Geçerli şablon anahtarları. Sıra: davetiye galerisindeki gösterim sırası. */
export const TEMPLATES = [
  'ZARIF',
  'BOTANIK',
  'ROMANTIK',
  'MINIMAL',
  'GECE',
  'ZEYTIN',
  'EDITORYAL',
  'MONOGRAM',
  'LUKS',
  'FOTOGRAFLI',
  'TIPOGRAFI',
] as const

/**
 * ÜCRETSİZ şablonlar — kullanıcı kararı (2026-11-04).
 *
 * "Şablonların başı olan 2 tanesi ücretsiz, diğerleri premium özel."
 * İlk ikisi: ZARIF (varsayılan, klasik) ve BOTANIK (kır düğünü).
 *
 * `TEMPLATES`in BAŞINDAKİ ikisi olmalı — `template-tiers.test.ts`
 * bunu doğrular.
 */
export const FREE_TEMPLATES = ['ZARIF', 'BOTANIK'] as const

/** Premium (ücretli) şablonlar — `TEMPLATES` eksi `FREE_TEMPLATES`. */
export const PREMIUM_TEMPLATES = TEMPLATES.filter(
  (t) => !(FREE_TEMPLATES as readonly string[]).includes(t),
)

/**
 * Şablon ücretsiz mi?
 *
 * Sunucu tarafı kapı: premium şablon seçimi burada reddedilir.
 */
export function isTemplateFree(value: unknown): boolean {
  return typeof value === 'string' && (FREE_TEMPLATES as readonly string[]).includes(value)
}

/** Geçerli font anahtarları — hepsi Türkçe karakterleri kapsar. */
export const FONTS = [
  'PARISIENNE',
  'GREAT_VIBES',
  'DANCING_SCRIPT',
  'ALLURA',
  'SACRAMENTO',
  'PLAYFAIR',
  'CORMORANT',
  'DM_SERIF',
  'BODONI',
  'JOSEFIN',
] as const

/** Bilinmeyen/boş şablon geldiğinde kullanılan değer. */
export const DEFAULT_TEMPLATE = 'ZARIF'

/**
 * Her şablonun önerilen fontu.
 *
 * Çift font seçmezse bu kullanılır. Yeni bir şablon eklendiğinde buraya
 * da bir satır gerekir — `RECOMMENDED_FONT[t]` tanımsız kalırsa test
 * yakalar.
 */
export const RECOMMENDED_FONT: Record<string, string> = {
  ZARIF: 'PARISIENNE',
  BOTANIK: 'GREAT_VIBES',
  ROMANTIK: 'DANCING_SCRIPT',
  MINIMAL: 'SACRAMENTO',
  GECE: 'GREAT_VIBES',
  ZEYTIN: 'ALLURA',
  EDITORYAL: 'PLAYFAIR',
  MONOGRAM: 'CORMORANT',
  LUKS: 'BODONI',
  FOTOGRAFLI: 'DM_SERIF',
  TIPOGRAFI: 'CORMORANT',
}

function isTemplate(value: unknown): value is string {
  return typeof value === 'string' && (TEMPLATES as readonly string[]).includes(value)
}

function isFont(value: unknown): value is string {
  return typeof value === 'string' && (FONTS as readonly string[]).includes(value)
}

/**
 * Şablon anahtarını normalize eder.
 *
 * Bilinmeyen, boş veya yanlış türdeki değer `DEFAULT_TEMPLATE` döner.
 * Savunmacı: veritabanında bozuk bir değer olsa bile istemciye her zaman
 * geçerli bir anahtar gider — aksi hâlde CSS seçicisi eşleşmez ve davetiye
 * stilsiz kalır.
 */
export function normalizeTemplate(value: unknown): string {
  return isTemplate(value) ? value : DEFAULT_TEMPLATE
}

/**
 * Font anahtarını normalize eder.
 *
 * Boş/geçersiz font, şablonun önerilen fontuna düşer. Şablon da geçersizse
 * önce şablon normalleştirilir, sonra onun önerilen fontu döner.
 */
export function normalizeFont(template: unknown, font: unknown): string {
  const t = normalizeTemplate(template)
  if (isFont(font)) return font
  return RECOMMENDED_FONT[t] ?? RECOMMENDED_FONT[DEFAULT_TEMPLATE]!
}
