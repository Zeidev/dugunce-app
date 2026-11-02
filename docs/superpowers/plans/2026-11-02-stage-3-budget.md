# Düğünce — Aşama 3: Bütçe ve Taksit

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çiftlerin harcamalarını gelin/damat tarafı ayrımıyla kaydedebildiği, taksitli harcamaların aylara **kuruş hassasiyetinde** doğru dağıtıldığı bir bütçe modülü kurmak.

**Architecture:** `expense` satın almanın kendisi, `installment` her ay ödenecek parça. Para **kuruş bazlı tam sayı** (bigint) olarak saklanır — float asla kullanılmaz. Taksit dağıtımı saf fonksiyon olarak yazılır ve ayrı test edilir. Tüm sorgular `wedding_id` ile kapsamlı; composite FK ile DB seviyesinde de zorlanır.

**Tech Stack:** Drizzle ORM, PostgreSQL 16, Zod, Vitest, PGlite (izolasyon testleri).

**Spec:** `docs/SECURITY.md` §10.1 (taksit kuralları), `docs/superpowers/specs/2026-11-02-dugunce-design.md` §7 (veri modeli), §9 (gelir modeli), `docs/DUGUNCE_CLAUDE_BRIEF-v2.md` §5.3 (taksit iş mantığı)

## Global Constraints

- **Para `bigint` kuruş** — `amount_kurus: bigint`. `float`/`number` **yasak** (SECURITY §10.1)
- **Taksit toplamı = harcama toplamı, kuruş hassasiyetinde** — yuvarlama farkı **son taksite** eklenir
- **Tüm sorgular `wedding_id` kapsamlı**; composite FK zorunlu
- **`userId` servis katmanında da kontrol edilir** (defense in depth)
- **Timezone: `Europe/Istanbul`**; ay hesapları `wedding.timezone`'a göre
- **Ayın 29/30/31'i** — sonraki aya taşınır (Şubat 30 çekmez)
- **Geçmiş ödemeler sessizce değiştirilmez** — taksit değişikliğinde onay + audit
- **Silme: soft delete** (`deleted_at`) — kota ve raporlar tutarlı kalsın
- Test: **Vitest**, her görev testleri geçmeden tamam değil
- Türkçe kullanıcı metni, İngilizce kod

## Review Focus

Para ile ilgili hatalar **güven kaybıdır** — kullanıcı yanlış taksit görürse uygulamayı bırakır. Bu 5 durum en olası hata kaynakları:

1. **Yuvarlama farkı toplamı bozar** — 100 TL / 3 taksit = 33.33 + 33.33 + 33.34 olmalı; 33.33×3 = 99.99 kalırsa toplam tutmaz. (Task 2)
2. **Float aritmetiği** — `0.1 + 0.2 !== 0.3`. Kuruş integer ile önlenir. (Task 1)
3. **Ay sonu taşması** — 31 Ocak + 1 ay = 28 Şubat; naif `setMonth` 3 Mart verir. (Task 2)
4. **Çift sayım** — "toplam harcama" ile "bu ay ödenecek" karışırsa bütçe iki katı görünür. (Task 6)
5. **Taksit değişince geçmiş bozulur** — ödenmiş taksit sessizce değişirse muhasebe tutmaz. (Task 5)

---

## Dosya Yapısı

```
backend/src/
├── money/
│   ├── money.ts            # kuruş <-> TL dönüşümü, formatlama, aritmetik
│   └── installment-plan.ts # saf taksit dağıtım fonksiyonu
├── expenses/
│   ├── service.ts          # iş mantığı (test edilebilir, deps enjekte)
│   └── store.ts            # Drizzle implementasyonu
├── db/
│   └── schema.ts           # expense, installment, card, expense_category, person
└── routes/
    └── expenses.ts         # HTTP katmanı
```

---

## Task 1: Para tipi ve aritmetiği (kuruş)

**Files:**
- Create: `backend/src/money/money.ts`
- Test: `backend/tests/money/money.test.ts`

**Interfaces:**
- Consumes: yok
- Produces: `Kurus` tipi (bigint), `toKurus(tl: string | number): bigint`, `toTl(kurus: bigint): string`, `formatTl(kurus: bigint): string`, `splitKurus(total: bigint, parts: number): bigint[]`, `sumKurus(values: bigint[]): bigint`

- [x] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from 'vitest'
import { toKurus, toTl, formatTl, splitKurus, sumKurus, addKurus } from '../../src/money/money.js'

describe('toKurus', () => {
  it('tam sayı TL → kuruş', () => {
    expect(toKurus('12000')).toBe(1_200_000n)
    expect(toKurus(12000)).toBe(1_200_000n)
  })

  it('ondalıklı TL → kuruş', () => {
    expect(toKurus('12000.50')).toBe(1_200_050n)
    expect(toKurus('0.01')).toBe(1n)
    expect(toKurus('0.99')).toBe(99n)
  })

  it('tek ondalık basamak', () => {
    expect(toKurus('10.5')).toBe(1050n)
  })

  it('binlik ayraçlı string kabul edilir', () => {
    expect(toKurus('12.000,50')).toBe(1_200_050n)
  })

  it('negatif değer reddedilir', () => {
    expect(() => toKurus('-5')).toThrow()
  })

  it('geçersiz string reddedilir', () => {
    expect(() => toKurus('abc')).toThrow()
    expect(() => toKurus('')).toThrow()
  })

  it('ikiden fazla ondalık basamak reddedilir', () => {
    expect(() => toKurus('10.123')).toThrow()
  })

  it('float hatası yok — 0.1 + 0.2', () => {
    // Float'ta 0.1 + 0.2 = 0.30000000000000004
    expect(addKurus(toKurus('0.1'), toKurus('0.2'))).toBe(toKurus('0.3'))
  })

  it('çok büyük değer desteklenir (NUMERIC(12,2) sınırı)', () => {
    expect(toKurus('9999999999.99')).toBe(999_999_999_999n)
  })
})

describe('toTl', () => {
  it('kuruş → TL string', () => {
    expect(toTl(1_200_050n)).toBe('12000.50')
    expect(toTl(1n)).toBe('0.01')
    expect(toTl(0n)).toBe('0.00')
  })
})

describe('formatTl', () => {
  it('Türkçe format — binlik nokta, ondalık virgül', () => {
    expect(formatTl(1_200_050n)).toBe('12.000,50 TL')
    expect(formatTl(1n)).toBe('0,01 TL')
    expect(formatTl(0n)).toBe('0,00 TL')
  })

  it('büyük tutar', () => {
    expect(formatTl(500_000_00n)).toBe('500.000,00 TL')
  })
})

describe('splitKurus — eşit bölme, kalanı sona ekle', () => {
  it('tam bölünen', () => {
    expect(splitKurus(1_200_000n, 4)).toEqual([300_000n, 300_000n, 300_000n, 300_000n])
  })

  it('kalan son taksite eklenir (Review Focus #1)', () => {
    // 100.00 TL / 3 = 33.33 + 33.33 + 33.34
    expect(splitKurus(10_000n, 3)).toEqual([3_333n, 3_333n, 3_334n])
  })

  it('toplam her zaman korunur', () => {
    for (const total of [1n, 7n, 100n, 10_000n, 123_457n]) {
      for (const parts of [2, 3, 4, 6, 12]) {
        const parts_ = splitKurus(total, parts)
        expect(sumKurus(parts_)).toBe(total)
      }
    }
  })

  it('1 kuruş / 12 taksit — ilk 11 sıfır, son 1', () => {
    const r = splitKurus(1n, 12)
    expect(r).toHaveLength(12)
    expect(sumKurus(r)).toBe(1n)
  })

  it('parça sayısı 0 veya negatif → hata', () => {
    expect(() => splitKurus(100n, 0)).toThrow()
    expect(() => splitKurus(100n, -1)).toThrow()
  })

  it('taksit sayısı üst sınırı (36)', () => {
    expect(() => splitKurus(1000n, 37)).toThrow()
    expect(splitKurus(1000n, 36)).toHaveLength(36)
  })
})

describe('sumKurus', () => {
  it('boş dizi → 0', () => {
    expect(sumKurus([])).toBe(0n)
  })
  it('toplar', () => {
    expect(sumKurus([1n, 2n, 3n])).toBe(6n)
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/money/money.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement et**

```ts
/** Kuruş — para birimi tam sayı. Float asla kullanılmaz (SECURITY §10.1). */
export type Kurus = bigint

export const MAX_INSTALLMENTS = 36

/** TL string/number → kuruş. Binlik ayraç ve virgül ondalık desteklenir. */
export function toKurus(input: string | number): Kurus {
  const raw = typeof input === 'number' ? String(input) : input.trim()
  if (!raw) throw new Error('Tutar boş olamaz')

  // "12.000,50" → "12000.50"; "12000.50" → "12000.50"
  let normalized = raw
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Geçersiz tutar: ${raw}`)
  }

  const [whole, frac = ''] = normalized.split('.') as [string, string?]
  const paddedFrac = frac.padEnd(2, '0')
  return BigInt(whole) * 100n + BigInt(paddedFrac)
}

export function toTl(kurus: Kurus): string {
  const negative = kurus < 0n
  const abs = negative ? -kurus : kurus
  const whole = abs / 100n
  const frac = abs % 100n
  return `${negative ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`
}

export function formatTl(kurus: Kurus): string {
  const s = toTl(kurus)
  const [whole, frac] = s.split('.') as [string, string]
  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${withThousands},${frac} TL`
}

export function addKurus(a: Kurus, b: Kurus): Kurus {
  return a + b
}

export function sumKurus(values: Kurus[]): Kurus {
  return values.reduce((acc, v) => acc + v, 0n)
}

/**
 * Tutarı eşit parçalara böler. Yuvarlama farkı SON parçaya eklenir —
 * böylece toplam her zaman korunur (SECURITY §10.1 #1).
 */
export function splitKurus(total: Kurus, parts: number): Kurus[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error('Taksit sayısı en az 1 olmalı')
  }
  if (parts > MAX_INSTALLMENTS) {
    throw new Error(`Taksit sayısı en fazla ${MAX_INSTALLMENTS} olabilir`)
  }
  if (total < 0n) throw new Error('Tutar negatif olamaz')

  const base = total / BigInt(parts)
  const remainder = total % BigInt(parts)

  const result: Kurus[] = []
  for (let i = 0; i < parts; i++) {
    result.push(i === parts - 1 ? base + remainder : base)
  }
  return result
}
```

- [ ] **Step 4: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/money/money.test.ts`
Expected: PASS (~20 test)

- [x] **Step 5: Commit**

```bash
git add backend/src/money/money.ts backend/tests/money/money.test.ts
git commit -m "feat(money): add kurus-based money arithmetic with lossless split"
```

---

## Task 2: Taksit planı (ay hesaplama, ay sonu)

**Files:**
- Create: `backend/src/money/installment-plan.ts`
- Test: `backend/tests/money/installment-plan.test.ts`

**Interfaces:**
- Consumes: `Kurus`, `splitKurus` (Task 1)
- Produces: `buildInstallmentPlan(params): InstallmentRow[]`, `addMonthsSafe(date, months, timezone): string` (YYYY-MM)

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from 'vitest'
import { buildInstallmentPlan, addMonthsSafe } from '../../src/money/installment-plan.js'

describe('addMonthsSafe — ay sonu taşması (Review Focus #3)', () => {
  it('31 Ocak + 1 ay = Şubat (28/29)', () => {
    expect(addMonthsSafe('2026-01-31', 1)).toBe('2026-02')
    expect(addMonthsSafe('2024-01-31', 1)).toBe('2024-02') // artık yıl
  })

  it('31 Mart + 1 ay = Nisan (30 gün)', () => {
    expect(addMonthsSafe('2026-03-31', 1)).toBe('2026-04')
  })

  it('31 Mayıs + 1 ay = Haziran', () => {
    expect(addMonthsSafe('2026-05-31', 1)).toBe('2026-06')
  })

  it('yıl geçişi', () => {
    expect(addMonthsSafe('2026-12-15', 1)).toBe('2027-01')
  })

  it('12 ay sonra aynı ay', () => {
    expect(addMonthsSafe('2026-03-15', 12)).toBe('2027-03')
  })

  it('0 ay = aynı ay', () => {
    expect(addMonthsSafe('2026-03-15', 0)).toBe('2026-03')
  })

  it('negatif ay reddedilir', () => {
    expect(() => addMonthsSafe('2026-03-15', -1)).toThrow()
  })

  it('geçersiz tarih reddedilir', () => {
    expect(() => addMonthsSafe('gecersiz', 1)).toThrow()
  })
})

describe('buildInstallmentPlan', () => {
  it('4 taksit, 12.000 TL → 4 × 3.000', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 1_200_000n,
      count: 4,
      firstMonth: '2026-01',
    })
    expect(plan).toHaveLength(4)
    expect(plan[0]?.amountKurus).toBe(300_000n)
    expect(plan[0]?.dueMonth).toBe('2026-01')
    expect(plan[3]?.dueMonth).toBe('2026-04')
  })

  it('yuvarlama farkı son taksite (Review Focus #1)', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 10_000n,
      count: 3,
      firstMonth: '2026-01',
    })
    expect(plan.map((p) => p.amountKurus)).toEqual([3_333n, 3_333n, 3_334n])
    const total = plan.reduce((s, p) => s + p.amountKurus, 0n)
    expect(total).toBe(10_000n)
  })

  it('aylar sıralı ve ardışık', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 600_000n,
      count: 12,
      firstMonth: '2026-01',
    })
    expect(plan[0]?.dueMonth).toBe('2026-01')
    expect(plan[11]?.dueMonth).toBe('2026-12')
  })

  it('yıl geçişi doğru', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 300_000n,
      count: 3,
      firstMonth: '2026-11',
    })
    expect(plan.map((p) => p.dueMonth)).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('tek taksit', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 500_000n,
      count: 1,
      firstMonth: '2026-06',
    })
    expect(plan).toHaveLength(1)
    expect(plan[0]?.amountKurus).toBe(500_000n)
  })

  it('taksit numarası 1\'den başlar', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 300_000n,
      count: 3,
      firstMonth: '2026-01',
    })
    expect(plan.map((p) => p.number)).toEqual([1, 2, 3])
  })

  it('başlangıç ayı ile satın alma tarihi farklı olabilir (Review Focus #2 / SECURITY §10.1 #2)', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 300_000n,
      count: 3,
      firstMonth: '2026-03', // satın alma Ocak'ta ama ilk taksit Mart
    })
    expect(plan[0]?.dueMonth).toBe('2026-03')
  })

  it('taksit sayısı 0 → hata', () => {
    expect(() =>
      buildInstallmentPlan({ totalKurus: 100n, count: 0, firstMonth: '2026-01' }),
    ).toThrow()
  })

  it('36 taksit desteklenir', () => {
    const plan = buildInstallmentPlan({
      totalKurus: 3_600_000n,
      count: 36,
      firstMonth: '2026-01',
    })
    expect(plan).toHaveLength(36)
    expect(plan[35]?.dueMonth).toBe('2028-12')
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/money/installment-plan.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement et**

```ts
import { splitKurus, type Kurus } from './money.js'

export interface InstallmentRow {
  number: number
  amountKurus: Kurus
  dueMonth: string // YYYY-MM
}

/**
 * Ay ekler — ay sonu taşmasını güvenli şekilde yönetir.
 *
 * Naif `setMonth` 31 Ocak + 1 ay = 3 Mart verir (Şubat 31 çekmediği için
 * taşar). Bu fonksiyon her zaman hedef ayın 1'ini kullanır, yalnızca
 * YYYY-MM döndürdüğü için gün bilgisi kaybolmaz.
 *
 * @param date YYYY-MM-DD
 * @param months eklenecek ay (>= 0)
 * @returns YYYY-MM
 */
export function addMonthsSafe(date: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error('Ay sayısı negatif olamaz')
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Geçersiz tarih: ${date}`)

  const year = Number(match[1])
  const month = Number(match[2]) // 1-12

  const totalMonths = year * 12 + (month - 1) + months
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (totalMonths % 12) + 1

  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

export interface BuildPlanParams {
  totalKurus: Kurus
  count: number
  /** İlk taksitin ayı (YYYY-MM). Satın alma tarihinden farklı olabilir. */
  firstMonth: string
}

/**
 * Taksit planı üretir.
 *
 * - Tutar eşit bölünür, yuvarlama farkı **son taksite** eklenir
 * - Aylar ardışık, ay sonu taşması yok
 * - Taksit numarası 1'den başlar
 */
export function buildInstallmentPlan(params: BuildPlanParams): InstallmentRow[] {
  const { totalKurus, count, firstMonth } = params

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth)) {
    throw new Error(`Geçersiz ay: ${firstMonth} (YYYY-MM bekleniyor)`)
  }

  const amounts = splitKurus(totalKurus, count)

  return amounts.map((amountKurus, i) => ({
    number: i + 1,
    amountKurus,
    dueMonth: addMonthsSafe(`${firstMonth}-01`, i),
  }))
}
```

- [ ] **Step 4: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/money/installment-plan.test.ts`
Expected: PASS (~18 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/money/installment-plan.ts backend/tests/money/installment-plan.test.ts
git commit -m "feat(money): add installment plan builder with month-end safety"
```

---

## Task 3: Bütçe şeması

**Files:**
- Modify: `backend/src/db/schema.ts`
- Test: `backend/tests/db/schema-budget.test.ts`

**Interfaces:**
- Consumes: mevcut `weddings`, `users`
- Produces: `expenseCategories`, `cards`, `persons`, `expenses`, `installments` tabloları

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { expenses, installments, cards, expenseCategories, persons } from '../../src/db/schema.js'

const col = (t: Parameters<typeof getTableConfig>[0], n: string) =>
  getTableConfig(t).columns.find((c) => c.name === n)

describe('expenses', () => {
  it('amount_kurus bigint (float DEĞİL)', () => {
    const c = col(expenses, 'amount_kurus')
    expect(c).toBeDefined()
    expect(c?.columnType).toBe('PgBigInt53')
  })
  it('wedding_id not null', () => {
    expect(col(expenses, 'wedding_id')?.notNull).toBe(true)
  })
  it('deleted_at nullable (soft delete)', () => {
    expect(col(expenses, 'deleted_at')?.notNull).toBe(false)
  })
  it('paid_by_side alanı var', () => {
    expect(col(expenses, 'paid_by_side')).toBeDefined()
  })
  it('(id, wedding_id) unique — composite FK hedefi', () => {
    const cfg = getTableConfig(expenses)
    const uniques = cfg.uniqueConstraints.map((u) =>
      u.columns.map((c) => c.name).sort().join(','),
    )
    expect(uniques).toContain('id,wedding_id')
  })
})

describe('installments', () => {
  it('amount_kurus bigint', () => {
    expect(col(installments, 'amount_kurus')?.columnType).toBe('PgBigInt53')
  })
  it('due_month var', () => {
    expect(col(installments, 'due_month')).toBeDefined()
  })
  it('status var', () => {
    expect(col(installments, 'status')?.notNull).toBe(true)
  })
  it('(expense_id, number) unique', () => {
    const cfg = getTableConfig(installments)
    const uniques = cfg.uniqueConstraints.map((u) =>
      u.columns.map((c) => c.name).sort().join(','),
    )
    expect(uniques.some((u) => u.includes('expense_id') && u.includes('number'))).toBe(true)
  })
})

describe('cards / categories / persons', () => {
  it('card last_four var, tam numara YOK', () => {
    expect(col(cards, 'last_four')).toBeDefined()
    expect(col(cards, 'card_number')).toBeUndefined()
  })
  it('category is_system var', () => {
    expect(col(expenseCategories, 'is_system')).toBeDefined()
  })
  it('person side var', () => {
    expect(col(persons, 'side')).toBeDefined()
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız**

Run: `cd backend && npx vitest run tests/db/schema-budget.test.ts`
Expected: FAIL

- [ ] **Step 3: Şemayı ekle**

`src/db/schema.ts`'e ekle (mevcut korunur):

```ts
export const expenseCategories = pgTable('expense_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').references(() => weddings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  bankName: text('bank_name'),
  lastFour: text('last_four'),      // ASLA tam numara
  statementDay: integer('statement_day'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  side: text('side').notNull().default('SHARED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull().references(() => weddings.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  amountKurus: bigint('amount_kurus', { mode: 'bigint' }).notNull(),
  currency: text('currency').notNull().default('TRY'),
  categoryId: uuid('category_id').references(() => expenseCategories.id, { onDelete: 'set null' }),
  paidBySide: text('paid_by_side').notNull().default('SHARED'),
  paidByPersonId: uuid('paid_by_person_id').references(() => persons.id, { onDelete: 'set null' }),
  paymentMethod: text('payment_method').notNull().default('CASH'),
  paymentStatus: text('payment_status').notNull().default('PAID'),
  cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
  installmentCount: integer('installment_count'),
  firstInstallmentMonth: text('first_installment_month'),
  purchaseDate: timestamp('purchase_date', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  idWeddingUnique: unique('expenses_id_wedding_unique').on(t.id, t.weddingId),
  weddingIdx: index('expenses_wedding_idx').on(t.weddingId),
  dateIdx: index('expenses_date_idx').on(t.purchaseDate),
  categoryIdx: index('expenses_category_idx').on(t.categoryId),
}))

export const installments = pgTable('installments', {
  id: uuid('id').primaryKey().defaultRandom(),
  weddingId: uuid('wedding_id').notNull(),
  expenseId: uuid('expense_id').notNull(),
  number: integer('number').notNull(),
  amountKurus: bigint('amount_kurus', { mode: 'bigint' }).notNull(),
  dueMonth: text('due_month').notNull(),
  status: text('status').notNull().default('PENDING'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // COMPOSITE FK — yanlış wedding_id ile yazma DB'de reddedilir (SECURITY §1.1)
  expenseFk: foreignKey({
    columns: [t.expenseId, t.weddingId],
    foreignColumns: [expenses.id, expenses.weddingId],
    name: 'installments_expense_fk',
  }).onDelete('cascade'),
  uniqueNumber: unique('installments_expense_number_unique').on(t.expenseId, t.number),
  dueIdx: index('installments_due_idx').on(t.dueMonth),
  weddingIdx: index('installments_wedding_idx').on(t.weddingId),
}))
```

Gerekli import: `bigint`, `boolean`, `foreignKey`.

- [ ] **Step 4: Migration üret**

Run: `cd backend && npm run db:generate`
Expected: `src/db/migrations/0002_*.sql`

- [ ] **Step 5: PGlite ile doğrula**

Run: `cd backend && npm run verify:migrations`
Expected: Tüm migration'lar çalışır

- [ ] **Step 6: Testi çalıştır — geçmeli**

Run: `cd backend && npx vitest run tests/db/schema-budget.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/db backend/tests/db/schema-budget.test.ts
git commit -m "feat(db): add budget schema (expense, installment, card, category, person)"
```

---

## Task 4: Harcama servisi (oluştur, listele, güncelle, sil)

**Files:**
- Create: `backend/src/expenses/service.ts`
- Test: `backend/tests/expenses/service.test.ts`

**Interfaces:**
- Consumes: `toKurus`, `buildInstallmentPlan` (Task 1, 2)
- Produces: `createExpense`, `listExpenses`, `getExpense`, `updateExpense`, `deleteExpense`, `validateExpenseInput`

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createExpense, validateExpenseInput, listExpenses } from '../../src/expenses/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    insertExpense: vi.fn().mockResolvedValue({ id: 'e1', amountKurus: 1_200_000n }),
    insertInstallments: vi.fn().mockResolvedValue(undefined),
    listByWedding: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    updateExpense: vi.fn().mockResolvedValue(null),
    softDelete: vi.fn().mockResolvedValue(true),
    deleteInstallments: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

describe('validateExpenseInput', () => {
  it('geçerli girdi kabul edilir', () => {
    const r = validateExpenseInput({
      title: 'Gelinlik',
      amount: '12000',
      purchaseDate: '2026-01-15',
    })
    expect(r.amountKurus).toBe(1_200_000n)
  })

  it('başlık boşsa hata', () => {
    expect(() =>
      validateExpenseInput({ title: '', amount: '100', purchaseDate: '2026-01-15' }),
    ).toThrow()
  })

  it('tutar 0 ise hata', () => {
    expect(() =>
      validateExpenseInput({ title: 'X', amount: '0', purchaseDate: '2026-01-15' }),
    ).toThrow()
  })

  it('taksit 1 ise taksit planı gerekmez', () => {
    const r = validateExpenseInput({
      title: 'X', amount: '100', purchaseDate: '2026-01-15', installmentCount: 1,
    })
    expect(r.installmentCount).toBe(1)
  })

  it('taksit > 1 ise ilk taksit ayı zorunlu', () => {
    expect(() =>
      validateExpenseInput({
        title: 'X', amount: '1200', purchaseDate: '2026-01-15', installmentCount: 4,
      }),
    ).toThrow(/taksit ayı/i)
  })

  it('taksit 36 üstü reddedilir', () => {
    expect(() =>
      validateExpenseInput({
        title: 'X', amount: '1200', purchaseDate: '2026-01-15',
        installmentCount: 37, firstInstallmentMonth: '2026-01',
      }),
    ).toThrow()
  })

  it('Türkçe karakterler korunur', () => {
    const r = validateExpenseInput({
      title: 'Şükrü\'nün çiçeği', amount: '100', purchaseDate: '2026-01-15',
    })
    expect(r.title).toBe('Şükrü\'nün çiçeği')
  })
})

describe('createExpense', () => {
  it('taksitsiz harcama tek installment üretir', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1',
        weddingId: 'w1',
        input: { title: 'X', amount: '1000', purchaseDate: '2026-01-15' },
      },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as unknown[]
    expect(rows).toHaveLength(1)
  })

  it('4 taksit → 4 installment satırı', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1',
        weddingId: 'w1',
        input: {
          title: 'X', amount: '12000', purchaseDate: '2026-01-15',
          installmentCount: 4, firstInstallmentMonth: '2026-01',
        },
      },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as unknown[]
    expect(rows).toHaveLength(4)
  })

  it('taksit toplamı harcama tutarına eşit (Review Focus #1)', async () => {
    const d = makeDeps()
    await createExpense(
      {
        userId: 'u1', weddingId: 'w1',
        input: {
          title: 'X', amount: '100', purchaseDate: '2026-01-15',
          installmentCount: 3, firstInstallmentMonth: '2026-01',
        },
      },
      d,
    )
    const rows = d.insertInstallments.mock.calls[0]![0] as { amountKurus: bigint }[]
    const sum = rows.reduce((s, r) => s + r.amountKurus, 0n)
    expect(sum).toBe(10_000n)
  })

  it('transaction içinde (harcama + taksitler atomik)', async () => {
    const d = makeDeps()
    await createExpense(
      { userId: 'u1', weddingId: 'w1', input: { title: 'X', amount: '100', purchaseDate: '2026-01-15' } },
      d,
    )
    expect(d.transaction).toHaveBeenCalledOnce()
  })

  it('taksit eklenirken hata → harcama da geri alınır', async () => {
    const d = makeDeps({ insertInstallments: vi.fn().mockRejectedValue(new Error('DB')) })
    await expect(
      createExpense(
        { userId: 'u1', weddingId: 'w1', input: { title: 'X', amount: '100', purchaseDate: '2026-01-15' } },
        d,
      ),
    ).rejects.toThrow()
  })
})

describe('listExpenses', () => {
  it('weddingId + userId ile çağrılır (IDOR koruması)', async () => {
    const d = makeDeps()
    await listExpenses({ weddingId: 'w1', userId: 'u1' }, d)
    expect(d.listByWedding).toHaveBeenCalledWith('w1', 'u1', expect.anything())
  })

  it('silinmiş harcamalar listelenmez', async () => {
    const d = makeDeps()
    await listExpenses({ weddingId: 'w1', userId: 'u1' }, d)
    const args = d.listByWedding.mock.calls[0] as unknown[]
    expect(args[2]).toMatchObject({ includeDeleted: false })
  })
})
```

- [ ] **Step 2-5: TDD döngüsü**

`createExpense`:
1. Input doğrula (Zod), `toKurus`
2. Transaction başlat
3. `expense` insert (taksit alanları dahil)
4. Taksit varsa `buildInstallmentPlan` → `insertInstallments`
5. Dön

`updateExpense`:
- Taksit sayısı/tutarı değişiyorsa **ödenmiş taksit varsa reddet** (Review Focus #5)
- Değişiklik yoksa normal update

`deleteExpense`:
- Soft delete (`deleted_at`)
- Taksitler `PENDING` ise silinir, `PAID` ise kalır (muhasebe)

- [ ] **Step 6: Commit**

```bash
git add backend/src/expenses backend/tests/expenses
git commit -m "feat(expenses): add expense service with installment generation"
```

---

## Task 5: Taksit güncelleme koruması

**Files:**
- Modify: `backend/src/expenses/service.ts`
- Test: `backend/tests/expenses/update-protection.test.ts`

**Interfaces:**
- Consumes: Task 4
- Produces: `updateExpense` — ödenmiş taksit koruması

- [ ] **Step 1: Failing test yaz**

```ts
describe('taksit değişikliği koruması (Review Focus #5)', () => {
  it('ödenmiş taksit varsa taksit sayısı değiştirilemez', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({
        id: 'e1', installmentCount: 4, amountKurus: 1_200_000n,
        installments: [{ number: 1, status: 'PAID' }, { number: 2, status: 'PENDING' }],
      }),
    })
    await expect(
      updateExpense({
        weddingId: 'w1', userId: 'u1', expenseId: 'e1',
        patch: { installmentCount: 6 },
      }, d),
    ).rejects.toThrow(/ödenmiş/i)
  })

  it('ödenmiş taksit varsa tutar değiştirilemez', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({
        id: 'e1', installmentCount: 4, amountKurus: 1_200_000n,
        installments: [{ number: 1, status: 'PAID' }],
      }),
    })
    await expect(
      updateExpense({
        weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '20000' },
      }, d),
    ).rejects.toThrow(/ödenmiş/i)
  })

  it('ödenmiş taksit yoksa değiştirilebilir', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({
        id: 'e1', installmentCount: 4, amountKurus: 1_200_000n,
        installments: [{ number: 1, status: 'PENDING' }],
      }),
      updateExpense: vi.fn().mockResolvedValue({ id: 'e1' }),
    })
    await expect(
      updateExpense({
        weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '20000' },
      }, d),
    ).resolves.toBeDefined()
  })

  it('başlık değişikliği her zaman serbest', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({
        id: 'e1', installmentCount: 4, amountKurus: 1_200_000n,
        installments: [{ number: 1, status: 'PAID' }],
      }),
      updateExpense: vi.fn().mockResolvedValue({ id: 'e1' }),
    })
    await expect(
      updateExpense({
        weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { title: 'Yeni' },
      }, d),
    ).resolves.toBeDefined()
  })

  it('tutar değişince taksitler yeniden üretilir', async () => {
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({
        id: 'e1', installmentCount: 3, amountKurus: 10_000n, installments: [],
      }),
      updateExpense: vi.fn().mockResolvedValue({ id: 'e1' }),
    })
    await updateExpense({
      weddingId: 'w1', userId: 'u1', expenseId: 'e1', patch: { amount: '200' },
    }, d)
    expect(d.deleteInstallments).toHaveBeenCalled()
    expect(d.insertInstallments).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2-5: TDD döngüsü**

- [ ] **Step 6: Commit**

```bash
git add backend/src/expenses backend/tests/expenses/update-protection.test.ts
git commit -m "feat(expenses): protect paid installments from silent changes"
```

---

## Task 6: Bütçe özeti (çift sayım önleme)

**Files:**
- Create: `backend/src/expenses/summary.ts`
- Test: `backend/tests/expenses/summary.test.ts`

**Interfaces:**
- Consumes: `Kurus`, Task 4
- Produces: `getBudgetSummary(params, deps): BudgetSummary`

- [ ] **Step 1: Failing test yaz**

```ts
describe('getBudgetSummary — çift sayım önleme (Review Focus #4)', () => {
  it('toplam harcama ile bu ay ödenecek AYRI alanlar', async () => {
    const d = makeDeps({
      sumExpenses: vi.fn().mockResolvedValue(1_200_000n),
      sumInstallmentsDue: vi.fn().mockResolvedValue(300_000n),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(r.totalSpentKurus).toBe(1_200_000n)
    expect(r.dueThisMonthKurus).toBe(300_000n)
    // Toplam ≠ bu ay (taksitli harcamada)
    expect(r.totalSpentKurus).not.toBe(r.dueThisMonthKurus)
  })

  it('12.000 TL 4 taksit → toplam 12.000, bu ay 3.000', async () => {
    const d = makeDeps({
      sumExpenses: vi.fn().mockResolvedValue(1_200_000n),
      sumInstallmentsDue: vi.fn().mockResolvedValue(300_000n),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)

    expect(formatTl(r.totalSpentKurus)).toBe('12.000,00 TL')
    expect(formatTl(r.dueThisMonthKurus)).toBe('3.000,00 TL')
  })

  it('taraf bazlı kırılım', async () => {
    const d = makeDeps({
      sumExpenses: vi.fn().mockResolvedValue(1_000_000n),
      sumInstallmentsDue: vi.fn().mockResolvedValue(0n),
      sumBySide: vi.fn().mockResolvedValue({ BRIDE: 600_000n, GROOM: 400_000n, SHARED: 0n }),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)
    expect(r.bySide.BRIDE).toBe(600_000n)
    expect(r.bySide.GROOM).toBe(400_000n)
  })

  it('kategori kırılımı', async () => {
    const d = makeDeps({
      sumExpenses: vi.fn().mockResolvedValue(1_000_000n),
      sumInstallmentsDue: vi.fn().mockResolvedValue(0n),
      sumByCategory: vi.fn().mockResolvedValue([
        { categoryId: 'c1', categoryName: 'Gelinlik', totalKurus: 600_000n },
      ]),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)
    expect(r.byCategory[0]?.categoryName).toBe('Gelinlik')
  })

  it('gelecek ayların yükümlülüğü ayrı', async () => {
    const d = makeDeps({
      sumExpenses: vi.fn().mockResolvedValue(1_200_000n),
      sumInstallmentsDue: vi.fn().mockResolvedValue(300_000n),
      sumRemainingCommitment: vi.fn().mockResolvedValue(900_000n),
    })
    const r = await getBudgetSummary({ weddingId: 'w1', userId: 'u1', month: '2026-01' }, d)
    expect(r.remainingCommitmentKurus).toBe(900_000n)
  })
})
```

- [ ] **Step 2-5: TDD döngüsü**

`BudgetSummary`:
```ts
{
  totalSpentKurus: Kurus       // tüm harcamalar (satın alma)
  dueThisMonthKurus: Kurus     // bu ay ödenecek taksitler
  remainingCommitmentKurus: Kurus // gelecek aylar
  bySide: { BRIDE, GROOM, SHARED }
  byCategory: { categoryId, categoryName, totalKurus }[]
  installmentSchedule: { month, totalKurus }[] // aylık takvim
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/expenses/summary.ts backend/tests/expenses/summary.test.ts
git commit -m "feat(expenses): add budget summary with no double-counting"
```

---

## Task 7: Drizzle store

**Files:**
- Create: `backend/src/expenses/store.ts`
- Test: `backend/tests/expenses/store.test.ts`

**Interfaces:**
- Consumes: Task 3 şeması
- Produces: `drizzleExpenseDeps(): ExpenseDeps` — gerçek DB bağlantısı

- [ ] **Step 1: Store yaz**

Tüm sorgular `wedding_id` + `user_id` (üyelik join) ile kapsamlı. `deleted_at IS NULL` filtresi varsayılan.

- [ ] **Step 2: PGlite ile entegrasyon testi**

Gerçek PostgreSQL'de:
- Harcama oluştur → taksitler doğru aylara dağılmış
- Composite FK: yanlış `wedding_id` ile taksit yazılamaz
- Soft delete sonrası listede görünmez
- Özet doğru hesaplanır

- [ ] **Step 3: Commit**

```bash
git add backend/src/expenses/store.ts backend/tests/expenses/store.test.ts
git commit -m "feat(expenses): add drizzle store with wedding scoping"
```

---

## Task 8: HTTP route'ları

**Files:**
- Create: `backend/src/routes/expenses.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/e2e/expenses-routes.test.ts`

**Interfaces:**
- Consumes: Task 4-7
- Produces: `/api/v1/weddings/:weddingId/expenses/*` endpoint'leri

- [ ] **Step 1: Route'ları yaz**

| Method | Path | Açıklama |
|---|---|---|
| GET | `/weddings/:weddingId/expenses` | Liste (filtre: ay, kategori, taraf) |
| POST | `/weddings/:weddingId/expenses` | Oluştur |
| GET | `/weddings/:weddingId/expenses/:expenseId` | Tek |
| PATCH | `/weddings/:weddingId/expenses/:expenseId` | Güncelle |
| DELETE | `/weddings/:weddingId/expenses/:expenseId` | Soft delete |
| GET | `/weddings/:weddingId/budget-summary` | Özet |

Hepsi `requireAuth` + `requireWeddingMember` arkasında.

- [ ] **Step 2: E2E test**

Token yok → 401, üye değil → 404.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/expenses.ts backend/src/app.ts backend/tests/e2e
git commit -m "feat(api): add expense and budget-summary routes"
```

---

## Task 10: Taksit ödeme durumu (plandan sapma — boşluk kapatma)

**Neden eklendi:** Task 5 ödenmiş taksiti *koruyor* ama Aşama 3'te hiçbir görev
bir taksiti ödenmiş *işaretlemiyor*. Yani `status='PAID'` üretimde hiç
oluşamıyor, `paid_at` hiç yazılmıyor ve Task 9'un "Taksit ödendi → `paid_at`
saklanır" kabul maddesi karşılanmıyordu. Bu, planın kendi içinde tutarsızlığı;
sessizce atlanmaz.

**Files:**
- Modify: `backend/src/expenses/service.ts`
- Modify: `backend/src/expenses/store.ts`
- Modify: `backend/src/routes/expenses.ts`
- Test: `backend/tests/expenses/payment.test.ts`

**Interfaces:**
- Consumes: Task 4, 5, 7, 8
- Produces: `setInstallmentPaid`, `PATCH /installments/:installmentId`

- [ ] **Step 1: Failing test yaz**

```ts
describe('taksit ödeme durumu', () => {
  it('PENDING taksit PAID yapılır ve paid_at yazılır', async () => {
    const d = makeDeps()
    const r = await setInstallmentPaid(
      { weddingId: 'w1', userId: 'u1', installmentId: 'i1', paid: true }, d,
    )
    expect(r.status).toBe('PAID')
    expect(r.paidAt).toBeInstanceOf(Date)
    expect(d.markInstallmentPaid).toHaveBeenCalledWith('w1', 'u1', 'i1', true)
  })

  it('PAID taksit geri alınır ve paid_at temizlenir', async () => { ... })

  it('zaten PAID olan taksit tekrar PAID edilirse paid_at DEĞİŞMEZ (idempotent)', async () => { ... })

  it('üye olunmayan taksit null döner (404 için)', async () => { ... })
})
```

- [x] **Step 2: Servis**

`setInstallmentPaid` — idempotent. Zaten istenen durumdaysa mevcut kaydı
döndürür, `paid_at`'i yeniden yazmaz (muhasebe kaydı bozulmasın).

- [x] **Step 3: Store**

`markInstallmentPaid(weddingId, userId, installmentId, paid)` — `installments`
JOIN `wedding_members` ON `userId`. `paid=true` → `status='PAID', paid_at=now()`;
`paid=false` → `status='PENDING', paid_at=NULL`.

- [x] **Step 4: Route**

| Method | Path | Açıklama |
|---|---|---|
| PATCH | `/weddings/:weddingId/installments/:installmentId` | `{ paid: boolean }` |

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(expenses): add installment payment status endpoint"
```

---

## Task 9: Aşama 3 kapanış kontrolü

**Files:**
- Create: `docs/STAGE-3-COMPLETE.md`

- [x] **Step 1: Kabul listesi**

- [x] Para `bigint` kuruş, float yok
- [x] Taksit toplamı = harcama toplamı (kuruş hassasiyetinde)
- [x] Yuvarlama farkı son taksite
- [x] Ay sonu taşması yok (31 Oca → Şub)
- [x] İlk taksit ayı satın alma tarihinden farklı olabilir
- [x] Ödenmiş taksit sessizce değiştirilemez
- [x] Taksit ödendi → `paid_at` saklanır
- [x] Soft delete, listede görünmez
- [x] Özet: toplam ≠ bu ay (çift sayım yok)
- [x] Composite FK yanlış wedding_id'yi reddeder
- [x] Tüm testler geçiyor
- [x] Typecheck temiz

- [x] **Step 2: Sonucu belgele ve commit**

```bash
git add docs/STAGE-3-COMPLETE.md
git commit -m "docs: stage 3 completion record"
```

---

## Sonraki Plan

**Aşama 4 — Davetli ve RSVP** (`stage-4-guests.md`): davetli modeli, davetiye token'ları, public sayfa, RSVP idempotency.

**Aşama 2.5 — Satın alma** bu arada yapılabilir (limitler Aşama 4-6'da anlam kazanacak).

---

## Notlar

**Neden kuruş integer, neden `NUMERIC(12,2)` değil?**
`NUMERIC` doğru ama JS'te `number`'a çevrilince hassasiyet kaybolabilir. `bigint` kuruş, aritmetiği dilin kendi tam sayı tipiyle yapar — hata imkânsız. DB'de `bigint` olarak saklanır.

**Neden soft delete?**
Kota ve raporlar tutarlı kalsın. Kullanıcı yanlışlıkla silerse geri alınabilir. Fiziksel silme yalnızca KVKK talebi veya düğün silindiğinde (CASCADE).

**Taksit değişikliğinde neden reddet, neden otomatik yeniden hesaplama yok?**
Ödenmiş bir taksiti sessizce değiştirmek muhasebeyi bozar. Kullanıcı önce ödemeyi geri almalı, sonra değiştirmeli — bu bilinçli bir sürtünme.
