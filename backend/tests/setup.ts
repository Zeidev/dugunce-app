import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Test ortamı kurulumu.
 *
 * .env.test varsa yüklenir; yoksa CI'daki ortam değişkenleri kullanılır.
 * Veritabanına bağlı testler, DATABASE_URL yoksa `describe.skipIf` ile atlanır.
 */
const envTestPath = resolve(process.cwd(), '.env.test')
if (existsSync(envTestPath)) {
  config({ path: envTestPath, override: false })
}

// Test için güvenli varsayılanlar (gerçek secret değil, sadece test)
process.env.NODE_ENV ??= 'test'
process.env.JWT_SECRET ??= 'test-only-secret-that-is-at-least-32-chars-long'
process.env.DATABASE_URL ??= ''
