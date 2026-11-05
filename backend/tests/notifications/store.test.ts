import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '../../src/db/schema.js'
import { drizzleDeviceTokenDeps } from '../../src/notifications/store.js'

/**
 * Token deposu — gerçek Postgres (PGlite) üzerinde.
 *
 * NEDEN MOCK DEĞİL: `onConflictDoUpdate` ve JOIN davranışı SQL'e ait.
 * Sahte bir depo bu davranışı taklit eder ve üretimdeki farkı gizler.
 */

const MIG = join(process.cwd(), 'src/db/migrations')

/**
 * TÜM migration'lar sırayla uygulanır.
 *
 * NEDEN TEK TEK SEÇMİYORUZ: `weddings` 0001'de, `users` 0000'da
 * oluşturuluyor; yalnız birkaç dosya uygulamak "relation does not exist"
 * verir (ölçüldü). Gerçek şema sırası neyse test de onu izlemeli.
 */
async function setup() {
  const pg = new PGlite()
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim()
      if (trimmed !== '') await pg.exec(trimmed)
    }
  }
  return {
    pg,
    deps: drizzleDeviceTokenDeps(
      drizzle(pg, { schema }) as unknown as Parameters<typeof drizzleDeviceTokenDeps>[0],
    ),
  }
}

async function makeUser(pg: PGlite, email: string): Promise<string> {
  await pg.query(`INSERT INTO users (email, display_name) VALUES ($1,'X')`, [email])
  const r = await pg.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email])
  const id = r.rows[0]?.id
  if (id === undefined) throw new Error('kullanıcı oluşmadı')
  return id
}

describe('device token store', () => {
  it('upsert: aynı token ikinci kez yazılınca SAHİBİ değişir', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    const b = await makeUser(pg, 'b@t.local')

    await deps.upsertDeviceToken({ userId: a, token: 'tok1', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: b, token: 'tok1', platform: 'ANDROID' })

    // Cihaz el değiştirdi: eski sahibe bildirim GİTMEMELİ.
    expect(await deps.listTokensForUser(a)).toHaveLength(0)
    const bTokens = await deps.listTokensForUser(b)
    expect(bTokens).toHaveLength(1)
    expect(bTokens[0]?.token).toBe('tok1')
  })

  it('bir kullanıcının İKİ cihazı birlikte durur', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 'tel', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: a, token: 'tablet', platform: 'ANDROID' })

    // Tek sütunlu model bunu EZERDİ; ayrı tablonun varlık sebebi bu.
    expect(await deps.listTokensForUser(a)).toHaveLength(2)
  })

  it('deleteDeviceToken yalnız o tokenı siler', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 't1', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: a, token: 't2', platform: 'ANDROID' })

    // Sahiplik kontrolü: doğru kullanıcı → silinir.
    const deleted = await deps.deleteDeviceToken('t1', a)
    expect(deleted).toBe(true)

    const left = await deps.listTokensForUser(a)
    expect(left.map((r) => r.token)).toEqual(['t2'])
  })

  it('deleteDeviceToken BAŞKA kullanıcının tokenını SİLMEZ (güvenlik)', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    const b = await makeUser(pg, 'b@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 'a-tok', platform: 'ANDROID' })

    // `b` kullanıcısı `a`nın token'ını silmeye çalışıyor.
    const deleted = await deps.deleteDeviceToken('a-tok', b)
    expect(deleted).toBe(false)

    // Token HÂLÂ orada — sahibi bildirim almaya devam etmeli.
    expect(await deps.listTokensForUser(a)).toHaveLength(1)
  })

  it('deleteAllForUser çıkışta hepsini siler', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    await deps.upsertDeviceToken({ userId: a, token: 't1', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: a, token: 't2', platform: 'ANDROID' })

    await deps.deleteAllForUser(a)

    expect(await deps.listTokensForUser(a)).toHaveLength(0)
  })

  it('listTokensForWeddingMembers göndereni HARİÇ tutar', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    const b = await makeUser(pg, 'b@t.local')
    await pg.query(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & B', now())`)
    const w = await pg.query<{ id: string }>(`SELECT id FROM weddings LIMIT 1`)
    const wid = w.rows[0]?.id
    if (wid === undefined) throw new Error('düğün oluşmadı')

    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER'), ($1,$3,'CO_OWNER')`,
      [wid, a, b],
    )
    await deps.upsertDeviceToken({ userId: a, token: 'ta', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: b, token: 'tb', platform: 'ANDROID' })

    // Kendi yaptığı işlemin bildirimini almamalı.
    const tokens = await deps.listTokensForWeddingMembers(wid, a)
    expect(tokens.map((t) => t.token)).toEqual(['tb'])
  })

  it('excludeUserId null ise tüm üyelerin tokenları gelir', async () => {
    const { pg, deps } = await setup()
    const a = await makeUser(pg, 'a@t.local')
    const b = await makeUser(pg, 'b@t.local')
    await pg.query(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('A & B', now())`)
    const w = await pg.query<{ id: string }>(`SELECT id FROM weddings LIMIT 1`)
    const wid = w.rows[0]?.id
    if (wid === undefined) throw new Error('düğün oluşmadı')
    await pg.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER'), ($1,$3,'CO_OWNER')`,
      [wid, a, b],
    )
    await deps.upsertDeviceToken({ userId: a, token: 'ta', platform: 'ANDROID' })
    await deps.upsertDeviceToken({ userId: b, token: 'tb', platform: 'ANDROID' })

    const tokens = await deps.listTokensForWeddingMembers(wid, null)
    expect(tokens.map((t) => t.token).sort()).toEqual(['ta', 'tb'])
  })

  it('üyesi olmayan düğünde boş liste döner', async () => {
    const { pg, deps } = await setup()
    await pg.query(`INSERT INTO weddings (couple_names, wedding_date) VALUES ('X & Y', now())`)
    const w = await pg.query<{ id: string }>(`SELECT id FROM weddings LIMIT 1`)
    const wid = w.rows[0]?.id
    if (wid === undefined) throw new Error('düğün oluşmadı')

    expect(await deps.listTokensForWeddingMembers(wid, null)).toEqual([])
  })
})
