/**
 * Admin deposu (Drizzle) ve beyaz liste görünümleri — GERÇEK Drizzle + PGlite.
 *
 * NEDEN ham SQL değil: bu dosya store'un ÜRETTİĞİ SQL'i çalıştırır. Beyaz
 * liste dönüşümü ya da `touchSession`'ın `lastUsedAt` yazımı kaldırılırsa
 * testler kırmızıya döner. Ham SQL ile "şema doğru" kanıtlanır ama
 * "store doğru yazıyor" kanıtlanmaz.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import {
  toAdminView,
  toUserView,
  toWeddingView,
  toAuditView,
} from '../../src/admin/view.js'
import { drizzleAdminDeps } from '../../src/admin/store.js'
import { SESSION_MAX_MS } from '../../src/admin/session.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let store: ReturnType<typeof drizzleAdminDeps>

/** Testler arasında e-posta çakışmasın diye artan sayaç. */
let seq = 0
function nextEmail(prefix: string): string {
  seq += 1
  return `${prefix}${seq}@t.local`
}

async function insertAdmin(email: string): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO admin_accounts (email, password_hash, display_name)
     VALUES ($1, '$argon2id$v=19$m=19456,t=2,p=1$tuz$hash', 'Test Admin') RETURNING id`,
    [email],
  )
  return r.rows[0]!.id
}

async function insertUser(email: string): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ($1, 'Test Kullanıcı') RETURNING id`,
    [email],
  )
  return r.rows[0]!.id
}

async function insertWedding(coupleNames: string): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ($1, '2026-09-12T19:00:00Z') RETURNING id`,
    [coupleNames],
  )
  return r.rows[0]!.id
}

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
  const db = drizzle(pg, { schema })
  store = drizzleAdminDeps(db as unknown as Parameters<typeof drizzleAdminDeps>[0])
}, 120_000)

afterAll(async () => {
  await pg?.close()
})

// ---------------------------------------------------------------------------
// Beyaz liste görünümleri
// ---------------------------------------------------------------------------

describe('beyaz liste görünümleri', () => {
  it('admin görünümü parola hash i İÇERMEZ', () => {
    const v = toAdminView({
      id: 'a1',
      email: 'o@t.local',
      displayName: 'O',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      lastLoginAt: null,
      passwordHash: '$argon2id$gizli',
      totpSecret: 'GIZLI',
      recoveryCodes: ['x'],
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    expect(JSON.stringify(v)).not.toContain('argon2')
    expect(JSON.stringify(v)).not.toContain('GIZLI')
    expect(Object.keys(v).sort()).toEqual([
      'displayName',
      'email',
      'id',
      'lastLoginAt',
      'role',
      'status',
    ])
  })

  it('kullanıcı görünümü tam olarak beklenen anahtarları taşır', () => {
    const v = toUserView({
      id: 'u1',
      email: 'u@t.local',
      displayName: 'U',
      status: 'ACTIVE',
      createdAt: new Date(),
      weddingCount: 2,
      // Satırda olabilecek ama görünümde ASLA olmaması gerekenler:
      passwordHash: '$argon2id$gizli',
      emailVerifiedAt: new Date(),
      updatedAt: new Date(),
    } as never)

    expect(Object.keys(v).sort()).toEqual([
      'createdAt',
      'displayName',
      'email',
      'id',
      'status',
      'weddingCount',
    ])
    expect(JSON.stringify(v)).not.toContain('argon2')
  })

  it('düğün görünümü purchaseToken İÇERMEZ', () => {
    const v = toWeddingView({
      id: 'w1',
      coupleNames: 'A & B',
      weddingDate: new Date(),
      plan: 'FREE',
      guestCount: 3,
      memberCount: 1,
      createdAt: new Date(),
      purchaseToken: 'PLAY-RECEIPT-SECRET',
      purchasePlatform: 'PLAY',
      purchaseDate: new Date(),
      status: 'ACTIVE',
      timezone: 'Europe/Istanbul',
    } as never)

    expect(JSON.stringify(v)).not.toContain('PLAY-RECEIPT-SECRET')
    expect(Object.keys(v).sort()).toEqual([
      'coupleNames',
      'createdAt',
      'guestCount',
      'id',
      'memberCount',
      'plan',
      'weddingDate',
    ])
  })

  it('audit görünümü tam olarak beklenen anahtarları taşır', () => {
    const v = toAuditView({
      id: 'l1',
      actorType: 'ADMIN',
      actorId: 'a1',
      action: 'ADMIN_LOGIN',
      targetType: null,
      targetId: null,
      metadata: { reason: 'OK' },
      ip: '1.2.3.4',
      createdAt: new Date(),
    } as never)

    expect(Object.keys(v).sort()).toEqual([
      'action',
      'actorId',
      'actorType',
      'createdAt',
      'id',
      'ip',
      'metadata',
      'targetId',
      'targetType',
    ])
  })

  it('görünümler satırı YAYMAZ — bilinmeyen yeni sütun sızmaz', () => {
    // `...row` yayılsaydı bu alan sessizce yanıta girerdi. Görünümler
    // alan alan kurulduğu için yeni bir sütun eklemek sızıntı üretmez.
    const v = toAdminView({
      id: 'a1',
      email: 'o@t.local',
      displayName: 'O',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      lastLoginAt: null,
      passwordHash: 'h',
      gelecekteEklenecekGizliAlan: 'SIZMAMALI',
    } as never)

    expect(JSON.stringify(v)).not.toContain('SIZMAMALI')
    expect(Object.keys(v)).not.toContain('gelecekteEklenecekGizliAlan')
  })
})

// ---------------------------------------------------------------------------
// drizzleAdminDeps — hesaplar
// ---------------------------------------------------------------------------

describe('drizzleAdminDeps — hesaplar', () => {
  it('findAdminByEmail kaydı döner', async () => {
    const email = nextEmail('bul')
    const id = await insertAdmin(email)

    const row = await store.findAdminByEmail(email)
    expect(row).not.toBeNull()
    expect(row!.id).toBe(id)
    expect(row!.email).toBe(email)
    // `loginAdmin` parola doğrulaması için hash'i İSTER — servis içi satır.
    expect(row!.passwordHash).toContain('$argon2id$')
    expect(row!.lockoutCount).toBe(0)
  })

  it('findAdminByEmail bilinmeyen e-postada null döner', async () => {
    expect(await store.findAdminByEmail('yok@t.local')).toBeNull()
  })

  it('findAdminByEmail büyük harf/boşluk toleranslı (simetri)', async () => {
    // loginAdmin e-postayı normalize edip çağırıyor; store da normalize
    // etmezse CLI/route gibi başka çağıranlar sessizce "hesap yok" alır.
    const email = nextEmail('norm')
    await insertAdmin(email)
    const row = await store.findAdminByEmail(`  ${email.toUpperCase()}  `)
    expect(row?.email).toBe(email)
  })

  it('findAdminById kaydı döner, bilinmeyen id null', async () => {
    const id = await insertAdmin(nextEmail('byid'))
    const row = await store.findAdminById(id)
    expect(row?.id).toBe(id)
    expect(await store.findAdminById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// drizzleAdminDeps — kilit ve giriş sayacı
// ---------------------------------------------------------------------------

describe('drizzleAdminDeps — kilit sayacı', () => {
  it('recordFailedAttempt sayacı ve kilidi yazar', async () => {
    const id = await insertAdmin(nextEmail('fail'))
    const lockedUntil = new Date(Date.now() + 15 * 60_000)

    await store.recordFailedAttempt(id, { failedAttempts: 5, lockedUntil, lockoutCount: 1 })

    const row = await store.findAdminById(id)
    expect(row!.failedAttempts).toBe(5)
    expect(row!.lockedUntil?.getTime()).toBe(lockedUntil.getTime())
  })

  it('recordFailedAttempt lockoutCount u PERSİST EDER (üstel kilit)', async () => {
    // Bu alan düşerse kilit süresi sonsuza kadar 15 dk kalır ve
    // DoS koruması sessizce kaybolur (Task 3 kararı).
    const id = await insertAdmin(nextEmail('lockout'))

    await store.recordFailedAttempt(id, {
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 30 * 60_000),
      lockoutCount: 3,
    })

    const r = await pg.query<{ lockout_count: number }>(
      `SELECT lockout_count FROM admin_accounts WHERE id = $1`,
      [id],
    )
    expect(r.rows[0]!.lockout_count).toBe(3)
  })

  it('lockoutCount verilmezse MEVCUT değer korunur', async () => {
    // `loginAdmin` var olmayan hesap için `recordFailedAttempt`'i
    // lockoutCount OLMADAN çağırıyor (zamanlama simetrisi). Store bu
    // çağrıda alanı sıfırlarsa saldırgan üstel cezayı silebilirdi.
    const id = await insertAdmin(nextEmail('keep'))
    await store.recordFailedAttempt(id, {
      failedAttempts: 5,
      lockedUntil: null,
      lockoutCount: 2,
    })

    await store.recordFailedAttempt(id, { failedAttempts: 1, lockedUntil: null })

    const r = await pg.query<{ lockout_count: number }>(
      `SELECT lockout_count FROM admin_accounts WHERE id = $1`,
      [id],
    )
    expect(r.rows[0]!.lockout_count).toBe(2)
  })

  it('recordSuccess sayacı, kilidi ve lockoutCount u sıfırlar, lastLoginAt yazar', async () => {
    const id = await insertAdmin(nextEmail('success'))
    await store.recordFailedAttempt(id, {
      failedAttempts: 4,
      lockedUntil: new Date(Date.now() + 60_000),
      lockoutCount: 2,
    })

    await store.recordSuccess(id)

    const row = await store.findAdminById(id)
    expect(row!.failedAttempts).toBe(0)
    expect(row!.lockedUntil).toBeNull()
    expect(row!.lastLoginAt).toBeInstanceOf(Date)
    expect(row!.lockoutCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// drizzleAdminDeps — oturumlar
// ---------------------------------------------------------------------------

describe('drizzleAdminDeps — oturumlar', () => {
  it('createSession satırı yazar, HAM token değil hash saklanır', async () => {
    const adminId = await insertAdmin(nextEmail('sess'))
    const expiresAt = new Date(Date.now() + SESSION_MAX_MS)
    const sessionHash = 'create-session-hash'

    const created = await store.createSession({
      adminId,
      sessionHash,
      csrfHash: 'create-session-csrf',
      ip: '10.0.0.1',
      userAgent: 'vitest',
      expiresAt,
    })

    expect(created.id).toBeTruthy()

    const raw = await pg.query<{ session_hash: string; ip: string; user_agent: string }>(
      `SELECT session_hash, ip, user_agent FROM admin_sessions WHERE id = $1`,
      [created.id],
    )
    expect(raw.rows[0]!.session_hash).toBe(sessionHash)
    expect(raw.rows[0]!.ip).toBe('10.0.0.1')
    expect(raw.rows[0]!.user_agent).toBe('vitest')

    const found = await store.findSessionByHash(sessionHash)
    expect(found!.id).toBe(created.id)
    expect(found!.adminId).toBe(adminId)
    expect(found!.expiresAt.getTime()).toBe(expiresAt.getTime())
  })

  it('findSessionByHash HAM token ile eşleşmez (yalnız hash)', async () => {
    const adminId = await insertAdmin(nextEmail('raw'))
    await store.createSession({
      adminId,
      sessionHash: 'only-hash-stored',
      csrfHash: 'c',
      expiresAt: new Date(Date.now() + 60_000),
    })

    expect(await store.findSessionByHash('only-hash-stored')).not.toBeNull()
    expect(await store.findSessionByHash('ham-token-degeri')).toBeNull()
  })

  it('touchSession lastUsedAt ı ŞİMDİ yazar (boşta kalma penceresi tazelenir)', async () => {
    // SÖZLEŞME: middleware `touchSession(id, session.expiresAt)` çağırır;
    // ikinci argüman MUTLAK TAVANDIR, kaydırılmış bir değer değil.
    // Store yalnız `expiresAt` yazarsa boşta kalma penceresi hiç
    // tazelenmez ve oturum 30. dakikada ölür (8 saat değil).
    const adminId = await insertAdmin(nextEmail('touch'))
    const cap = new Date(Date.now() + SESSION_MAX_MS)
    const stale = new Date(Date.now() - 20 * 60_000)

    const s = await store.createSession({
      adminId,
      sessionHash: 'touch-hash',
      csrfHash: 'c',
      expiresAt: cap,
    })
    await pg.query(`UPDATE admin_sessions SET last_used_at = $1 WHERE id = $2`, [stale, s.id])

    const before = Date.now()
    await store.touchSession(s.id, cap)
    const after = Date.now()

    const row = await store.findSessionByHash('touch-hash')
    expect(row!.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before - 1)
    expect(row!.lastUsedAt.getTime()).toBeLessThanOrEqual(after + 1)
    // Mutlak tavan KAYMAZ — ileri taşınsaydı oturum sınırsız yenilenirdi.
    expect(row!.expiresAt.getTime()).toBe(cap.getTime())
  })

  it('deleteSession satırı siler', async () => {
    const adminId = await insertAdmin(nextEmail('del'))
    const s = await store.createSession({
      adminId,
      sessionHash: 'del-hash',
      csrfHash: 'c',
      expiresAt: new Date(Date.now() + 60_000),
    })

    await store.deleteSession(s.id)

    expect(await store.findSessionByHash('del-hash')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// drizzleAdminDeps — audit
// ---------------------------------------------------------------------------

describe('drizzleAdminDeps — audit', () => {
  it('writeAudit kaydı ekler', async () => {
    await store.writeAudit({
      action: 'ADMIN_LOGIN',
      actorType: 'ADMIN',
      actorId: null,
      targetType: 'WEDDING',
      targetId: null,
      metadata: { from: 'FREE', to: 'PREMIUM' },
      ip: '1.2.3.4',
    })

    const r = await pg.query<{ action: string; metadata: unknown; ip: string }>(
      `SELECT action, metadata, ip FROM audit_logs WHERE action = 'ADMIN_LOGIN' ORDER BY created_at DESC LIMIT 1`,
    )
    expect(r.rows[0]!.action).toBe('ADMIN_LOGIN')
    expect(r.rows[0]!.metadata).toEqual({ from: 'FREE', to: 'PREMIUM' })
    expect(r.rows[0]!.ip).toBe('1.2.3.4')
  })

  it('opsiyonel alanlar null yazılır (undefined kolon değil)', async () => {
    await store.writeAudit({ action: 'ADMIN_LOGOUT', actorType: 'ADMIN', actorId: null })

    const r = await pg.query<{ target_type: string | null; metadata: unknown; ip: string | null }>(
      `SELECT target_type, metadata, ip FROM audit_logs WHERE action = 'ADMIN_LOGOUT' LIMIT 1`,
    )
    expect(r.rows[0]!.target_type).toBeNull()
    expect(r.rows[0]!.metadata).toBeNull()
    expect(r.rows[0]!.ip).toBeNull()
  })

  it('silme/güncelleme fonksiyonu YOK — tablo değiştirilemez', () => {
    const deps = drizzleAdminDeps(pg as never) as unknown as Record<string, unknown>
    expect(deps).not.toHaveProperty('deleteAudit')
    expect(deps).not.toHaveProperty('updateAudit')
  })

  it('listAuditLogs en yeniden eskiye döner ve action ile filtrelenir', async () => {
    const page = await store.listAuditLogs({ action: 'ADMIN_LOGIN', limit: 10 })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((x) => x.action === 'ADMIN_LOGIN')).toBe(true)

    const all = await store.listAuditLogs({ limit: 10 })
    const dates = all.items.map((x) => x.createdAt.getTime())
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
  })
})

// ---------------------------------------------------------------------------
// drizzleAdminDeps — kullanıcı ve düğün listeleri
// ---------------------------------------------------------------------------

describe('drizzleAdminDeps — listeler', () => {
  it('listUsers weddingCount ile döner (beyaz liste)', async () => {
    const email = nextEmail('listu')
    const userId = await insertUser(email)
    const w1 = await insertWedding('Liste A & B')
    await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [
      w1,
      userId,
    ])

    const page = await store.listUsers({ q: email, limit: 10 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.id).toBe(userId)
    expect(page.items[0]!.weddingCount).toBe(1)
    expect(Object.keys(page.items[0]!).sort()).toEqual([
      'createdAt',
      'displayName',
      'email',
      'id',
      'status',
      'weddingCount',
    ])
  })

  it('listUsers cursor ile sayfalar (kararlı sıralama)', async () => {
    const a = await insertUser(nextEmail('page'))
    const b = await insertUser(nextEmail('page'))
    const c = await insertUser(nextEmail('page'))

    const first = await store.listUsers({ q: 'page', limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()

    const second = await store.listUsers({ q: 'page', limit: 2, cursor: first.nextCursor! })
    const ids = [...first.items, ...second.items].map((x) => x.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.sort()).toEqual([a, b, c].sort())
    expect(second.nextCursor).toBeNull()
  })

  it('listUsers düğünü OLMAYAN kullanıcıyı da döner (weddingCount = 0)', async () => {
    // İç join kullanılsaydı hiç düğünü olmayan kullanıcılar listeden
    // tamamen DÜŞERDİ — panelde en çok incelenmesi gereken grup onlar.
    const email = nextEmail('nowedding')
    const id = await insertUser(email)

    const page = await store.listUsers({ q: email, limit: 10 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.id).toBe(id)
    expect(page.items[0]!.weddingCount).toBe(0)
  })

  it('listUsers aramasında % ve _ KAÇIRILIR (joker değil)', async () => {
    // Kaçırılmasaydı `q=%` tüm kullanıcıları döndürürdü: arama değil,
    // tam tablo taraması. Panelde bu, sayfalama tavanını da boşa çıkarır.
    const all = await store.listUsers({ limit: 100 })
    const wildcard = await store.listUsers({ q: '%', limit: 100 })
    expect(wildcard.items).toHaveLength(0)
    expect(all.items.length).toBeGreaterThan(0)
  })

  it('listUsers geçersiz cursor u sessizce yok sayar', async () => {
    const page = await store.listUsers({ cursor: 'uuid-degil', limit: 5 })
    expect(page.items.length).toBeGreaterThan(0)
  })

  it('listWeddings davetli ve üye sayılarını döner', async () => {
    const wid = await insertWedding('Sayım A & B')
    const uid = await insertUser(nextEmail('count'))
    await pg.query(`INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`, [
      wid,
      uid,
    ])
    await pg.query(
      `INSERT INTO guests (wedding_id, name) VALUES ($1,'G1'), ($1,'G2'), ($1,'G3')`,
      [wid],
    )
    // Silinmiş davetli sayılmamalı.
    await pg.query(
      `INSERT INTO guests (wedding_id, name, deleted_at) VALUES ($1,'G4', now())`,
      [wid],
    )

    const page = await store.listWeddings({ q: 'Sayım', limit: 10 })
    const w = page.items.find((x) => x.id === wid)!
    expect(w.guestCount).toBe(3)
    expect(w.memberCount).toBe(1)
    expect(Object.keys(w).sort()).toEqual([
      'coupleNames',
      'createdAt',
      'guestCount',
      'id',
      'memberCount',
      'plan',
      'weddingDate',
    ])
  })

  it('listWeddings plan filtresi uygular', async () => {
    const premium = await insertWedding('Premium A & B')
    await pg.query(`UPDATE weddings SET plan = 'PREMIUM' WHERE id = $1`, [premium])

    const page = await store.listWeddings({ plan: 'PREMIUM', limit: 100 })
    expect(page.items.every((x) => x.plan === 'PREMIUM')).toBe(true)
    expect(page.items.some((x) => x.id === premium)).toBe(true)
  })

  it('findWeddingById kaydı döner, bilinmeyen id null', async () => {
    const wid = await insertWedding('Detay A & B')
    const w = await store.findWeddingById(wid)
    expect(w!.id).toBe(wid)
    expect(await store.findWeddingById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('updateWeddingPlan plan ve satın alma alanlarını yazar', async () => {
    const wid = await insertWedding('Plan A & B')
    const at = new Date()

    await store.updateWeddingPlan(wid, {
      plan: 'PREMIUM',
      purchasedAt: at,
      purchasePlatform: 'ADMIN',
      purchaseToken: null,
    })

    const r = await pg.query<{
      plan: string
      purchased_at: string | null
      purchase_platform: string | null
      purchase_token: string | null
    }>(
      `SELECT plan, purchased_at, purchase_platform, purchase_token FROM weddings WHERE id = $1`,
      [wid],
    )
    expect(r.rows[0]!.plan).toBe('PREMIUM')
    expect(r.rows[0]!.purchase_platform).toBe('ADMIN')
    expect(r.rows[0]!.purchase_token).toBeNull()
    expect(new Date(r.rows[0]!.purchased_at!).getTime()).toBe(at.getTime())
  })
})

// ---------------------------------------------------------------------------
// drizzleAdminDeps — genel bakış sayıları (Task 7 tüketir)
// ---------------------------------------------------------------------------

describe('drizzleAdminDeps — overview sayıları', () => {
  it('countUsers toplamı verir', async () => {
    const direct = await pg.query<{ c: number }>(`SELECT count(*)::int AS c FROM users`)
    expect(await store.countUsers()).toBe(direct.rows[0]!.c)
  })

  it('countUsersSince yalnız eşikten sonra açılanları sayar', async () => {
    const all = await store.countUsers()
    expect(await store.countUsersSince(new Date(Date.now() + 60_000))).toBe(0)
    expect(await store.countUsersSince(new Date(Date.now() - 60 * 60_000))).toBe(all)
  })

  it('countWeddings plan ve duruma göre sayar', async () => {
    const total = await store.countWeddings()
    const premium = await store.countWeddings({ plan: 'PREMIUM' })
    const free = await store.countWeddings({ plan: 'FREE' })
    const active = await store.countWeddings({ status: 'ACTIVE' })

    expect(total).toBeGreaterThan(0)
    expect(premium).toBeGreaterThan(0)
    expect(premium + free).toBe(total)
    expect(active).toBeLessThanOrEqual(total)
  })

  it('countGuests silinmişleri saymaz, RSVP dağılımı toplamı aşmaz', async () => {
    const g = await store.countGuests()
    expect(g.total).toBeGreaterThan(0)
    expect(g.attending + g.declined + g.pending).toBeLessThanOrEqual(g.total)

    const direct = await pg.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM guests WHERE deleted_at IS NULL`,
    )
    expect(g.total).toBe(direct.rows[0]!.c)
  })
})
