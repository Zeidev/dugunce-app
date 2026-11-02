import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { loadEnv } from '../config/env.js'
import * as schema from './schema.js'

/**
 * PostgreSQL bağlantısı ve Drizzle örneği.
 *
 * `postgres` sürücüsü saf JavaScript'tir — serv00'da (FreeBSD) native
 * derleme gerektirmez. Bu bilinçli bir seçimdir (bkz. plan Aşama 1a).
 *
 * Bağlantı tembel (lazy) kurulur: modül import edildiğinde değil, ilk
 * sorguda. Böylece `/health` DB olmadan da çalışır.
 */
let _client: postgres.Sql | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

function getClient(): postgres.Sql {
  if (_client) return _client

  const env = loadEnv()
  _client = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // NOT: notice'ları sustur — log gürültüsü olmasın
    onnotice: () => {},
  })
  return _client
}

export function getDb() {
  if (_db) return _db
  _db = drizzle(getClient(), { schema })
  return _db
}

/** Ham SQL — migration ve testler için. */
export function getSql(): postgres.Sql {
  return getClient()
}

/**
 * Bağlantıyı kapatır (test ve graceful shutdown için).
 */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 })
    _client = null
    _db = null
  }
}

/**
 * Veritabanının erişilebilir olduğunu doğrular.
 * `/health/deep` ve testler için — `/health` bunu KULLANMAZ.
 */
export async function pingDb(): Promise<boolean> {
  try {
    const sql = getClient()
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
