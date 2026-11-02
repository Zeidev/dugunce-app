import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadEnv } from '../src/config/env.js'
import { getDb, getSql, closeDb } from '../src/db/client.js'
import { logger } from '../src/lib/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface MigrationOptions {
  force?: boolean
}

export interface SafeTargetInput {
  nodeEnv: string
  databaseUrl: string
  force: boolean
}

/**
 * Yanlış veritabanına migration çalıştırmayı engeller.
 *
 * İki koruma:
 * 1. NODE_ENV=production ise `force` gerekir.
 * 2. Bağlantı dizesinde "prod" geçiyorsa (NODE_ENV ne olursa olsun) `force` gerekir.
 *
 * Bu, Review Focus #2'yi kapatır: staging/prod karışması veri kaybına yol açmasın.
 */
export function assertSafeTarget(input: SafeTargetInput): void {
  const { nodeEnv, databaseUrl, force } = input

  const looksLikeProd =
    nodeEnv === 'production' || /[_-]prod|production/i.test(databaseUrl)

  if (looksLikeProd && !force) {
    throw new Error(
      'GÜVENLİK: Üretim (prod) veritabanı hedefi algılandı. ' +
        'Devam etmek için --force bayrağını kullanın.\n' +
        `  NODE_ENV=${nodeEnv}\n` +
        '  (Bağlantı dizesi güvenlik gereği gösterilmiyor.)',
    )
  }
}

/**
 * Migration'ları çalıştırır.
 *
 * Idempotent: Drizzle kendi migration tablosunu tutar, tekrar çalıştırma
 * zarar vermez.
 */
export async function runMigrations(options: MigrationOptions = {}): Promise<void> {
  const env = loadEnv()

  assertSafeTarget({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    force: options.force ?? false,
  })

  const migrationsFolder = resolve(__dirname, '../src/db/migrations')

  logger.info({ folder: migrationsFolder }, 'migration başlıyor')

  try {
    await migrate(getDb(), { migrationsFolder })
    logger.info('migration tamamlandı')
  } catch (err) {
    logger.error({ err }, 'migration başarısız')
    throw err
  }
}

// --- CLI giriş noktası ---
const isCli =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(__filename)

if (isCli) {
  const force = process.argv.includes('--force')

  runMigrations({ force })
    .then(async () => {
      await closeDb()
      process.exit(0)
    })
    .catch(async (err: unknown) => {
      logger.error({ err }, 'migration hatası')
      await closeDb()
      process.exit(1)
    })
}

// getSql kullanılmıyorsa uyarı vermesin diye referans
void getSql
