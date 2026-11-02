/**
 * CI teşhis: gerçek PostgreSQL'e bağlanabiliyor muyuz?
 *
 * Yalnızca hata ayıklama için — CI'da testlerden önce çalışır.
 */
import postgres from 'postgres'

const url = process.env['DATABASE_URL']
if (!url) {
  console.error('❌ DATABASE_URL tanımlı değil')
  process.exit(1)
}

const host = url.replace(/.*@/, '').split('/')[0]
console.log('host:', host)

const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} })

try {
  const r = await sql`SELECT current_database() AS db`
  console.log('✅ bağlandı, db:', r[0].db)

  const t = await sql`
    SELECT count(*)::int AS c FROM information_schema.tables
    WHERE table_schema = 'public'
  `
  console.log('tablo sayısı:', t[0].c)

  const enc = await sql`SHOW server_encoding`
  console.log('encoding:', enc[0].server_encoding)
} catch (e) {
  console.error('❌ BAĞLANAMADI:', e.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
