import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from '../config/env.js'
import { getDb, closeDb } from './client.js'
import { logger } from '../lib/logger.js'

/**
 * Migration CLI — ÜRETİM için.
 *
 * `scripts/migrate.ts` geliştirme içindir ve `tsx` gerektirir. Üretimde
 * `npm ci --omit=dev` çalıştığı için `tsx` yoktur; bu dosya derlenmiş
 * JS olarak (`dist/db/migrate-cli.js`) çalışır.
 *
 * Kullanım:
 *   node dist/db/migrate-cli.js
 */

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface SafeTargetInput {
  nodeEnv: string
  databaseUrl: string
  force: boolean
}

/**
 * Üretim veritabanına yanlışlıkla migration çalıştırmayı engeller.
 *
 * `--force` olmadan prod hedefi reddedilir.
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

async function main(): Promise<void> {
  const env = loadEnv()
  const force = process.argv.includes('--force')

  assertSafeTarget({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    force,
  })

  // Migration klasörü: dist/db/ → dist/db/migrations
  // `scripts/copy-migrations.mjs` build sırasında SQL'leri buraya kopyalar,
  // böylece üretimde `src/` dizinine ihtiyaç kalmaz.
  const fromDist = resolve(__dirname, 'migrations')
  const fromSrc = resolve(__dirname, '../../src/db/migrations')
  const migrationsFolder = existsSync(fromDist) ? fromDist : fromSrc

  logger.info({ folder: migrationsFolder }, 'migration başlıyor')

  const db = getDb()
  await migrate(db, { migrationsFolder })

  logger.info('migration tamamlandı')
  await closeDb()
}

// Doğrudan çalıştırıldıysa main() çağır (import edildiğinde çağırma)
const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch(async (err: unknown) => {
      logger.error({ err }, 'migration hatası')
      await closeDb().catch(() => {})
      process.exit(1)
    })
}
