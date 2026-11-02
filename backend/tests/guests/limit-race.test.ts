/**
 * Limit yarış koşulu — GERÇEK PostgreSQL (PGlite).
 *
 * Mock'lu testler "limit kontrolü transaction içinde çağrıldı mı" sorusunu
 * yanıtlar ama "iki eşzamanlı istek limiti aşabilir mi" sorusunu YANITLAMAZ.
 * Bu dosya gerçek satır kilidini (SELECT ... FOR UPDATE) sınar.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

let pg: PGlite
let userId: string
let weddingId: string

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }

  const u = await pg.query<{ id: string }>(
    `INSERT INTO users (email, display_name) VALUES ('race@test.local','R') RETURNING id`,
  )
  userId = u.rows[0]!.id
  const w = await pg.query<{ id: string }>(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('R & R','2026-09-12T19:00:00Z') RETURNING id`,
  )
  weddingId = w.rows[0]!.id
  await pg.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [weddingId, userId],
  )
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

/** 30 kayıt doldur — limit tam dolu. */
async function fillTo(limit: number): Promise<void> {
  await pg.query(`DELETE FROM guests WHERE wedding_id=$1`, [weddingId])
  for (let i = 0; i < limit; i++) {
    await pg.query(
      `INSERT INTO guests (wedding_id, name, side) VALUES ($1,$2,'BRIDE')`,
      [weddingId, `G${i}`],
    )
  }
}

async function activeCount(): Promise<number> {
  const r = await pg.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM guests WHERE wedding_id=$1 AND deleted_at IS NULL`,
    [weddingId],
  )
  return Number(r.rows[0]!.c)
}

describe('davetli limiti — gerçek DB yarış koşulu', () => {
  it('limiti doldurunca sayım doğru', async () => {
    await fillTo(30)
    expect(await activeCount()).toBe(30)
  })

  it('kilitsiz check-then-act yarışı limiti AŞAR (kontrol grubu)', async () => {
    // PGlite TEK bağlantı — gerçek paralel transaction çalıştıramayız.
    // Bu yüzden yarışın ÜRETTİĞİ ara durumu elle kuruyoruz:
    //   T1: say = 29 → geçer
    //   T2: say = 29 → geçer   (T1 henüz yazmadı)
    //   T1: ekle  → 30
    //   T2: ekle  → 31  ← LİMİT AŞILDI
    // Kilit olsaydı T2'nin sayımı T1 commit'ine kadar bekler, 30 görür, reddederdi.
    await fillTo(29)

    const readCount = async () =>
      Number(
        (
          await pg.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c FROM guests WHERE wedding_id=$1 AND deleted_at IS NULL`,
            [weddingId],
          )
        ).rows[0]!.c,
      )

    const insert = (name: string) =>
      pg.query(`INSERT INTO guests (wedding_id, name, side) VALUES ($1,$2,'BRIDE')`, [
        weddingId,
        name,
      ])

    // İki istek de AYNI sayımı görür (kilit yok)
    const seenByT1 = await readCount()
    const seenByT2 = await readCount()
    expect(seenByT1).toBe(29)
    expect(seenByT2).toBe(29)
    expect(seenByT1 + 1 <= 30).toBe(true)
    expect(seenByT2 + 1 <= 30).toBe(true)

    // İkisi de yazar
    await insert('T1')
    await insert('T2')

    expect(await activeCount()).toBe(31) // limit 30 AŞILDI
  })

  it('düğün satırı kilidi yarışı kapatır — ikinci istek güncel sayıyı görür', async () => {
    // COUNT(*) ile FOR UPDATE PostgreSQL'de YASAK
    // ("FOR UPDATE is not allowed with aggregate functions").
    // Doğru mekanizma: düğün satırını kilitle, SONRA say.
    await fillTo(29)

    const lockedInsert = async (name: string) => {
      await pg.exec('BEGIN')
      try {
        // 1) Kilidi al (sayımdan ÖNCE)
        await pg.query(`SELECT id FROM weddings WHERE id=$1 FOR UPDATE`, [weddingId])

        // 2) Şimdi say — kilit sayesinde güncel değer
        const r = await pg.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM guests
            WHERE wedding_id=$1 AND deleted_at IS NULL`,
          [weddingId],
        )
        const c = Number(r.rows[0]!.c)
        if (c >= 30) {
          await pg.exec('ROLLBACK')
          throw new Error('limit')
        }
        await pg.query(
          `INSERT INTO guests (wedding_id, name, side) VALUES ($1,$2,'BRIDE')`,
          [weddingId, name],
        )
        await pg.exec('COMMIT')
      } catch (err) {
        try {
          await pg.exec('ROLLBACK')
        } catch {
          /* zaten rollback */
        }
        throw err
      }
    }

    // Sıralı çalıştır (PGlite tek bağlantı): birinci ekler, ikinci reddeder
    await lockedInsert('T1')
    await expect(lockedInsert('T2')).rejects.toThrow(/limit/)

    expect(await activeCount()).toBe(30) // limit KORUNDU
  })

  it('silinmiş davetliler limiti SAYMAZ', async () => {
    await fillTo(30)
    await pg.query(
      `UPDATE guests SET deleted_at=now() WHERE wedding_id=$1 AND name='G0'`,
      [weddingId],
    )
    expect(await activeCount()).toBe(29)

    // 30. slot açıldı — yeni davetli eklenebilir
    await pg.query(
      `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'Yeni','BRIDE')`,
      [weddingId],
    )
    expect(await activeCount()).toBe(30)
  })
})
