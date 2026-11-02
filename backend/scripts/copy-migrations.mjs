/**
 * Migration SQL'lerini dist/ içine kopyalar.
 *
 * Neden: `migrate-cli.js` derlenmiş JS olarak çalışır ama migration
 * dosyaları `.sql` — TypeScript derleyicisi onları taşımaz. Kopyalanmazsa
 * üretimde "migrations folder not found" hatası alınır.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'src/db/migrations')
const dest = join(root, 'dist/db/migrations')

if (!existsSync(src)) {
  console.error(`❌ migration klasörü yok: ${src}`)
  process.exit(1)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log(`✅ migration SQL'leri kopyalandı → dist/db/migrations`)
