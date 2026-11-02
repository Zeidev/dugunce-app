import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit yapılandırması.
 *
 * NOT: Bu dosya `src/config/env.ts`'i import ETMEZ — drizzle-kit kendi
 * modül çözümleyicisini kullanır ve ESM `.js` uzantılı import'ları çözemez.
 * Bu yüzden DATABASE_URL doğrudan process.env'den okunur (yalnızca migration
 * üretimi için gerekir, çalışma zamanı doğrulaması `loadEnv` ile yapılır).
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://placeholder:placeholder@localhost:5432/placeholder',
  },
  verbose: true,
  strict: true,
})
