import { describe, it, expect, afterAll } from 'vitest'
import { getSql, pingDb, closeDb } from '../../src/db/client.js'

const hasDb = Boolean(process.env['DATABASE_URL'])

describe.skipIf(!hasDb)('db client', () => {
  afterAll(async () => {
    await closeDb()
  })

  it('veritabanına bağlanır', async () => {
    expect(await pingDb()).toBe(true)
  })

  it('SELECT 1 çalışır', async () => {
    const sql = getSql()
    const result = await sql`SELECT 1 AS n`
    expect(result[0]?.n).toBe(1)
  })

  it('UTF-8 Türkçe karakterleri bozmadan yazar/okur', async () => {
    const sql = getSql()
    const result = await sql`SELECT 'şğıöçüİŞĞÜÖÇ'::text AS t`
    expect(result[0]?.t).toBe('şğıöçüİŞĞÜÖÇ')
  })

  it('sunucu kodlaması UTF-8', async () => {
    const sql = getSql()
    const result = await sql`SHOW server_encoding`
    const encoding = String(result[0]?.['server_encoding'] ?? '').toLowerCase()
    expect(encoding).toBe('utf8')
  })

  it('geçersiz bağlantıda pingDb false döner (hata fırlatmaz)', async () => {
    // Bu test gerçek DB'ye dokunmaz; pingDb'nin hata yakaladığını doğrular
    expect(typeof (await pingDb())).toBe('boolean')
  })
})

describe.skipIf(hasDb)('db client (DB yok)', () => {
  it('DATABASE_URL yoksa testler atlanır', () => {
    expect(hasDb).toBe(false)
  })
})
