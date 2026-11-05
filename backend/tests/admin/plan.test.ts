/**
 * `setWeddingPlan` — premium aktivasyonu (spec §6.4).
 *
 * Bu testler servisi SAHTE bağımlılıklarla çalıştırır: DB yok. Amaç
 * "hangi yamayı yazıyoruz, hangi audit'i yazıyoruz, hangi durumda HİÇ
 * yazmıyoruz" sorusunu kanıtlamak. Store'un gerçekten yazdığı ayrı
 * dosyada (`store.test.ts`) kanıtlanıyor.
 *
 * NEDEN ÖNEMLİ: bu repoda `plan = 'PREMIUM'` yazan BAŞKA bir kod yolu
 * yoktu; 9 kilitli şablon ve davetiye metni düzenleme bu alana bağlı.
 * Buradaki bir hata "premium hiç açılmıyor" demektir.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Mock } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import { setWeddingPlan } from '../../src/admin/service.js'
import type { WeddingPlanDeps } from '../../src/admin/service.js'
import type { WeddingView } from '../../src/admin/view.js'
import { drizzleAdminDeps } from '../../src/admin/store.js'

/** Sabit "şimdi" yerine gerçek saat kullanılıyor: servis imzası `now` almıyor. */
function weddingView(overrides: Partial<WeddingView> = {}): WeddingView {
  return {
    id: 'w1',
    coupleNames: 'Elif & Mert',
    weddingDate: new Date('2027-06-12T15:00:00.000Z'),
    plan: 'FREE',
    guestCount: 12,
    memberCount: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

/**
 * Sahte bağımlılıklar — mock fonksiyonları `.mock` ile incelenebilsin.
 *
 * DİKKAT: yalnız ÜÇ metot var (`writeAudit`, `findWeddingById`,
 * `updateWeddingPlan`) ve DÖNÜŞTE `as` KAÇIŞI YOK. `WeddingPlanDeps` dar
 * bir arayüz olduğu için bu nesne ona YAPISAL olarak uyuyor. Arayüz bir
 * gün `AdminDeps`'e genişletilirse bu dosya DERLENMEZ ve daraltmanın
 * bozulduğu hemen görülür — `as` kalsaydı aynı hata sessizce yutulurdu.
 */
type Deps = WeddingPlanDeps & {
  findWeddingById: Mock
  updateWeddingPlan: Mock
  writeAudit: Mock
}

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    writeAudit: vi.fn().mockResolvedValue(undefined),
    findWeddingById: vi.fn().mockResolvedValue(weddingView()),
    updateWeddingPlan: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('setWeddingPlan', () => {
  it('FREE -> PREMIUM purchasedAt doldurur, platform ADMIN olur', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    expect(d.updateWeddingPlan).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        plan: 'PREMIUM',
        purchasePlatform: 'ADMIN',
        purchaseToken: null,
      }),
    )
    expect(d.updateWeddingPlan.mock.calls[0]![1].purchasedAt).toBeInstanceOf(Date)
  })

  it('PREMIUM -> FREE purchasedAt temizler', async () => {
    const d = makeDeps({
      findWeddingById: vi.fn().mockResolvedValue(weddingView({ plan: 'PREMIUM' })),
    })
    await setWeddingPlan({ weddingId: 'w1', plan: 'FREE', actorId: 'a1' }, d)
    expect(d.updateWeddingPlan).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        plan: 'FREE',
        purchasedAt: null,
        purchasePlatform: null,
        purchaseToken: null,
      }),
    )
  })

  it('gecersiz plan reddedilir', async () => {
    const d = makeDeps()
    await expect(
      setWeddingPlan({ weddingId: 'w1', plan: 'VIP' as never, actorId: 'a1' }, d),
    ).rejects.toThrow()
    expect(d.updateWeddingPlan).not.toHaveBeenCalled()
  })

  it('gecersiz plan HICBIR yazma yapmaz (audit dahil)', async () => {
    const d = makeDeps()
    await expect(
      setWeddingPlan({ weddingId: 'w1', plan: 'premium' as never, actorId: 'a1' }, d),
    ).rejects.toThrow()
    // Küçük harfli 'premium' de reddedilir: DB'deki değer BÜYÜK harf ve
    // mobil uygulama `plan === 'PREMIUM'` karşılaştırması yapıyor.
    expect(d.findWeddingById).not.toHaveBeenCalled()
    expect(d.updateWeddingPlan).not.toHaveBeenCalled()
    expect(d.writeAudit).not.toHaveBeenCalled()
  })

  it('dugun yoksa null doner, yazma yok', async () => {
    const d = makeDeps({ findWeddingById: vi.fn().mockResolvedValue(null) })
    const r = await setWeddingPlan({ weddingId: 'yok', plan: 'PREMIUM', actorId: 'a1' }, d)
    expect(r).toBeNull()
    expect(d.updateWeddingPlan).not.toHaveBeenCalled()
    expect(d.writeAudit).not.toHaveBeenCalled()
  })

  it('her degisiklik audit e yazilir (from/to ile)', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1', ip: '1.2.3.4' }, d)
    expect(d.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WEDDING_PLAN_CHANGED',
        actorType: 'ADMIN',
        actorId: 'a1',
        targetType: 'WEDDING',
        targetId: 'w1',
        metadata: { from: 'FREE', to: 'PREMIUM' },
        ip: '1.2.3.4',
      }),
    )
  })

  it('audit metadata parola/token ICERMEZ (Review Focus #4)', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    const meta = JSON.stringify(d.writeAudit.mock.calls[0]![0].metadata)
    expect(meta).not.toMatch(/argon2|password|token|secret/i)
  })

  it('metadata yalniz from/to tasir (fazladan alan yok)', async () => {
    const d = makeDeps({
      findWeddingById: vi.fn().mockResolvedValue(weddingView({ plan: 'PREMIUM' })),
    })
    await setWeddingPlan({ weddingId: 'w1', plan: 'FREE', actorId: 'a1' }, d)
    const entry = d.writeAudit.mock.calls[0]![0]
    expect(Object.keys(entry.metadata).sort()).toEqual(['from', 'to'])
    // `from` DB'deki GERÇEK plan olmalı — sabit 'FREE' değil.
    expect(entry.metadata).toEqual({ from: 'PREMIUM', to: 'FREE' })
  })

  it('ip verilmezse audit te ip alani bulunmaz', async () => {
    const d = makeDeps()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    const entry = d.writeAudit.mock.calls[0]![0]
    expect(entry.ip).toBeUndefined()
  })

  it('guncel dugun gorunumu doner (yeni plan ile)', async () => {
    const d = makeDeps()
    const r = await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    expect(r).not.toBeNull()
    expect(r!.id).toBe('w1')
    expect(r!.plan).toBe('PREMIUM')
    // Sayımlar korunur: plan değişikliği davetli/üye sayısını sıfırlamaz.
    expect(r!.guestCount).toBe(12)
    expect(r!.memberCount).toBe(2)
    expect(r!.coupleNames).toBe('Elif & Mert')
  })

  it('FREE -> PREMIUM gecisinde purchasedAt SIMDI olur', async () => {
    const d = makeDeps({
      findWeddingById: vi.fn().mockResolvedValue(weddingView({ plan: 'FREE' })),
    })
    const before = Date.now()
    await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    const at = d.updateWeddingPlan.mock.calls[0]![1].purchasedAt as Date
    expect(at.getTime()).toBeGreaterThanOrEqual(before)
    expect(at.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('AYNI plana tekrar gecis HICBIR SEY yazmaz (verilis tarihi korunur)', async () => {
    // NEDEN: ikinci kez "PREMIUM" demek purchasedAt'i eziyordu — ilk
    // veriliş tarihi kayboluyordu. Ayrıca {PREMIUM->PREMIUM} gibi
    // anlamsız bir denetim kaydı ekliyordu.
    const d = makeDeps({
      findWeddingById: vi.fn().mockResolvedValue(weddingView({ plan: 'PREMIUM' })),
    })
    const r = await setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d)
    expect(d.updateWeddingPlan).not.toHaveBeenCalled()
    expect(d.writeAudit).not.toHaveBeenCalled()
    expect(r!.plan).toBe('PREMIUM')
  })

  it('yazma BASARISIZ olursa audit YAZILMAZ (olmayan degisiklik kaydi yok)', async () => {
    const d = makeDeps({
      updateWeddingPlan: vi.fn().mockRejectedValue(new Error('db down')),
    })
    await expect(
      setWeddingPlan({ weddingId: 'w1', plan: 'PREMIUM', actorId: 'a1' }, d),
    ).rejects.toThrow('db down')
    expect(d.writeAudit).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Uçtan uca — GERÇEK Drizzle + PGlite
// ---------------------------------------------------------------------------

/**
 * NEDEN AYRICA: yukarıdaki testler servisin HANGİ yamayı geçtiğini
 * kanıtlıyor, ama "DB'de gerçekten premium oluyor mu" sorusunu değil.
 * Bu depoda `plan = 'PREMIUM'` yazan tek yol bu servis; store'un
 * `updateWeddingPlan`'ı ileride değişirse (ör. bir sütun unutulursa)
 * yukarıdaki mock testleri yine yeşil kalırdı.
 */
describe('setWeddingPlan — gerçek DB', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

  let pg: PGlite
  let store: ReturnType<typeof drizzleAdminDeps>

  beforeAll(async () => {
    pg = new PGlite()
    for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
      for (const st of sql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)) {
        await pg.exec(st)
      }
    }
    const db = drizzle(pg, { schema })
    store = drizzleAdminDeps(db as unknown as Parameters<typeof drizzleAdminDeps>[0])
  }, 120_000)

  afterAll(async () => {
    await pg?.close()
  })

  async function insertWedding(coupleNames: string): Promise<string> {
    const r = await pg.query<{ id: string }>(
      `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1, '2027-06-12T15:00:00Z') RETURNING id`,
      [coupleNames],
    )
    return r.rows[0]!.id
  }

  async function insertAdmin(email: string): Promise<string> {
    const r = await pg.query<{ id: string }>(
      `INSERT INTO admin_accounts (email, password_hash, display_name)
       VALUES ($1, '$argon2id$v=19$m=19456,t=2,p=1$tuz$hash', 'Test Admin') RETURNING id`,
      [email],
    )
    return r.rows[0]!.id
  }

  async function readPlanRow(id: string) {
    const r = await pg.query<{
      plan: string
      purchased_at: string | null
      purchase_platform: string | null
      purchase_token: string | null
    }>(
      `SELECT plan, purchased_at, purchase_platform, purchase_token FROM weddings WHERE id = $1`,
      [id],
    )
    return r.rows[0]!
  }

  it('FREE dugun PREMIUM olur — DB satiri ve audit kaydi birlikte', async () => {
    const wid = await insertWedding('Uctan Uca A & B')
    const adminId = await insertAdmin('plan-e2e-1@t.local')

    // Başlangıç gerçekten FREE mi?
    expect((await readPlanRow(wid)).plan).toBe('FREE')

    const view = await setWeddingPlan(
      { weddingId: wid, plan: 'PREMIUM', actorId: adminId, ip: '10.0.0.7' },
      store,
    )

    const row = await readPlanRow(wid)
    expect(row.plan).toBe('PREMIUM')
    expect(row.purchase_platform).toBe('ADMIN')
    expect(row.purchase_token).toBeNull()
    expect(row.purchased_at).not.toBeNull()

    // Dönüş görünümü DB ile tutarlı.
    expect(view).not.toBeNull()
    expect(view!.plan).toBe('PREMIUM')
    expect(view!.id).toBe(wid)

    const audit = await pg.query<{
      action: string
      actor_type: string
      actor_id: string
      target_type: string
      target_id: string
      metadata: unknown
      ip: string
    }>(
      `SELECT action, actor_type, actor_id, target_type, target_id, metadata, ip
         FROM audit_logs WHERE action = 'WEDDING_PLAN_CHANGED' AND target_id = $1`,
      [wid],
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0]!.actor_type).toBe('ADMIN')
    expect(audit.rows[0]!.actor_id).toBe(adminId)
    expect(audit.rows[0]!.target_type).toBe('WEDDING')
    expect(audit.rows[0]!.metadata).toEqual({ from: 'FREE', to: 'PREMIUM' })
    expect(audit.rows[0]!.ip).toBe('10.0.0.7')
  })

  it('PREMIUM dugun FREE ye doner — satin alma alanlari TEMIZLENIR', async () => {
    const wid = await insertWedding('Uctan Uca C & D')
    const adminId = await insertAdmin('plan-e2e-2@t.local')

    await setWeddingPlan(
      { weddingId: wid, plan: 'PREMIUM', actorId: adminId },
      store,
    )
    expect((await readPlanRow(wid)).plan).toBe('PREMIUM')

    await setWeddingPlan(
      { weddingId: wid, plan: 'FREE', actorId: adminId },
      store,
    )

    const row = await readPlanRow(wid)
    expect(row.plan).toBe('FREE')
    // ÜÇÜ DE temizlenmeli: `purchasedAt` kalsaydı geri alınan düğün
    // yeniden premium açıldığında eski tarihle raporlanırdı.
    expect(row.purchased_at).toBeNull()
    expect(row.purchase_platform).toBeNull()
    expect(row.purchase_token).toBeNull()

    const audit = await pg.query<{ metadata: unknown }>(
      `SELECT metadata FROM audit_logs
        WHERE action = 'WEDDING_PLAN_CHANGED' AND target_id = $1
        ORDER BY created_at ASC`,
      [wid],
    )
    expect(audit.rows.map((r) => r.metadata)).toEqual([
      { from: 'FREE', to: 'PREMIUM' },
      { from: 'PREMIUM', to: 'FREE' },
    ])
  })

  it('olmayan dugun: null doner, audit YAZILMAZ, satir olusmaz', async () => {
    const adminId = await insertAdmin('plan-e2e-3@t.local')
    const before = await pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_logs WHERE action = 'WEDDING_PLAN_CHANGED'`,
    )

    const view = await setWeddingPlan(
      {
        weddingId: '00000000-0000-0000-0000-000000000000',
        plan: 'PREMIUM',
        actorId: adminId,
      },
      store,
    )

    expect(view).toBeNull()
    const after = await pg.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM audit_logs WHERE action = 'WEDDING_PLAN_CHANGED'`,
    )
    expect(after.rows[0]!.c).toBe(before.rows[0]!.c)
  })

  it('gecersiz plan DB ye ULASMAZ', async () => {
    const wid = await insertWedding('Uctan Uca E & F')
    const adminId = await insertAdmin('plan-e2e-4@t.local')

    await expect(
      setWeddingPlan(
        { weddingId: wid, plan: 'VIP' as never, actorId: adminId },
        store,
      ),
    ).rejects.toThrow()

    expect((await readPlanRow(wid)).plan).toBe('FREE')
  })
})
