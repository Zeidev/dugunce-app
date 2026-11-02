/**
 * Para birimi — kuruş bazlı tam sayı.
 *
 * SECURITY §10.1: "Para tipi: NUMERIC(12,2) veya kuruş bazlı tam sayı.
 * Asla float. İki yöntem aynı hesaplama zincirinde karıştırılmaz."
 *
 * Bu modül **yalnızca kuruş (bigint)** kullanır. Float aritmetiği yoktur,
 * bu yüzden `0.1 + 0.2 !== 0.3` türü hatalar imkânsızdır.
 */

/** Kuruş — para birimi tam sayı. */
export type Kurus = bigint

/** Azami taksit sayısı (Türkiye'de banka kartı taksitleri 36'ya kadar). */
export const MAX_INSTALLMENTS = 36

/**
 * TL string/number → kuruş.
 *
 * Kabul edilen formatlar:
 * - `"12000"` → 1_200_000
 * - `"12000.50"` → 1_200_050
 * - `"12.000,50"` → 1_200_050 (Türkçe format)
 * - `12000` (number) → 1_200_000
 *
 * @throws {Error} geçersiz, negatif veya 2+ ondalık basamak
 */
export function toKurus(input: string | number): Kurus {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Tutar geçersiz')
    if (input < 0) throw new Error('Tutar negatif olamaz')
    // Number'ı string'e çevir — float hatası taşınmasın
    input = input.toString()
  }

  const raw = input.trim()
  if (!raw) throw new Error('Tutar boş olamaz')
  if (raw.startsWith('-')) throw new Error('Tutar negatif olamaz')

  // Türkçe format: "12.000,50" → "12000.50"
  // Virgül varsa: noktalar binlik ayraç, virgül ondalık
  let normalized = raw
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Geçersiz tutar: ${raw}`)
  }

  const parts = normalized.split('.')
  const whole = parts[0] ?? '0'
  const frac = (parts[1] ?? '').padEnd(2, '0')

  return BigInt(whole) * 100n + BigInt(frac)
}

/**
 * Kuruş → TL string (formatlanmamış, makine okunur).
 *
 * `1_200_050n` → `"12000.50"`
 */
export function toTl(kurus: Kurus): string {
  const negative = kurus < 0n
  const abs = negative ? -kurus : kurus
  const whole = abs / 100n
  const frac = abs % 100n
  return `${negative ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`
}

/**
 * Kuruş → Türkçe görüntüleme formatı.
 *
 * `1_200_050n` → `"12.000,50 TL"`
 */
export function formatTl(kurus: Kurus): string {
  const s = toTl(kurus)
  const negative = s.startsWith('-')
  const unsigned = negative ? s.slice(1) : s
  const parts = unsigned.split('.')
  const whole = parts[0] ?? '0'
  const frac = parts[1] ?? '00'

  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${withThousands},${frac} TL`
}

/** İki kuruş değeri toplar. */
export function addKurus(a: Kurus, b: Kurus): Kurus {
  return a + b
}

/** Kuruş dizisini toplar. Boş dizi → 0n. */
export function sumKurus(values: readonly Kurus[]): Kurus {
  return values.reduce<Kurus>((acc, v) => acc + v, 0n)
}

/**
 * Tutarı eşit parçalara böler.
 *
 * **Kritik:** Yuvarlama farkı **son parçaya** eklenir — böylece toplam
 * her zaman korunur (SECURITY §10.1 #1: "Taksit toplamı ana harcamaya
 * kuruş hassasiyetinde eşit").
 *
 * Örnek: `splitKurus(10_000n, 3)` → `[3333n, 3333n, 3334n]`
 *
 * @throws {Error} parts < 1, parts > MAX_INSTALLMENTS, total < 0
 */
export function splitKurus(total: Kurus, parts: number): Kurus[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error('Taksit sayısı en az 1 olmalı')
  }
  if (parts > MAX_INSTALLMENTS) {
    throw new Error(`Taksit sayısı en fazla ${MAX_INSTALLMENTS} olabilir`)
  }
  if (total < 0n) {
    throw new Error('Tutar negatif olamaz')
  }

  const partsBig = BigInt(parts)
  const base = total / partsBig
  const remainder = total % partsBig

  const result: Kurus[] = []
  for (let i = 0; i < parts; i++) {
    // Son parça kalanı alır
    result.push(i === parts - 1 ? base + remainder : base)
  }
  return result
}
