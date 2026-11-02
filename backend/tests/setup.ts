import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Test ortamı kurulumu.
 *
 * .env.test varsa yüklenir; yoksa güvenli test varsayılanları kullanılır.
 *
 * KRİTİK: Vitest her test dosyası için bu dosyayı yeniden çalıştırır.
 * Bu yüzden `DATABASE_URL`'in bizim placeholder'ımız mı yoksa gerçek bir
 * değer mi olduğunu ayırt etmek için ayrı bir işaret kullanılır.
 */

/**
 * Yer tutucu bağlantı — GERÇEK bir DB'ye işaret ETMEZ.
 *
 * DİKKAT: Bu string CI'daki `DATABASE_URL` ile AYNI OLMAMALI.
 * Önceden ikisi de `postgres://test:test@localhost:5432/dugunce_test`
 * idi; sonuç: CI'da gerçek PostgreSQL varken bile "DB yok" sayılıyor,
 * DB testleri sessizce atlanıyordu (ve bir test gerçek bağlantı
 * denediğinde kırılıyordu).
 *
 * Artık ayırt edilebilir bir yer tutucu kullanılıyor.
 */
const PLACEHOLDER_DB = 'postgres://placeholder:placeholder@127.0.0.1:1/none'
const FLAG = '__DUGUNCE_TEST_DB_AVAILABLE__'

const envTestPath = resolve(process.cwd(), '.env.test')
if (existsSync(envTestPath)) {
  config({ path: envTestPath, override: false })
}

process.env['NODE_ENV'] ??= 'test'
process.env['JWT_SECRET'] ??= 'test-only-secret-that-is-at-least-32-chars-long'

// İlk çalıştırmada karar ver, sonraki dosyalarda koru
if (process.env[FLAG] === undefined) {
  const realDb = process.env['DATABASE_URL']

  if (realDb && realDb !== PLACEHOLDER_DB) {
    // Gerçek DATABASE_URL verilmiş (CI veya .env.test)
    process.env[FLAG] = 'true'
  } else {
    // Gerçek DB yok — placeholder koy, testler atlanacak
    process.env['DATABASE_URL'] = PLACEHOLDER_DB
    process.env[FLAG] = 'false'
  }
}

/** Testlerin kullanacağı bayrak. */
export const testDbAvailable = process.env[FLAG] === 'true'
