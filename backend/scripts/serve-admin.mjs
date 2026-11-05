// GEÇİCİ doğrulama aracı — COMMIT EDİLMEZ.
//
// Minimal admin dev sunucusu: yalnız `/api/v1/admin` router'ını kurar.
// `createApp()` TÜM uygulamayı kurar ve `BREVO_API_KEY` + `JWT_SECRET` +
// `DATABASE_URL` ister; sadece paneli denemek için gereksiz ve engelleyici.
//
// Kullanım: cd backend && npx tsx scripts/serve-admin.mjs
import express from 'express'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../src/db/schema.js'
import { createAdminRouter } from '../src/routes/admin.js'
import { drizzleAdminPanelDeps } from '../src/admin/panel-store.js'
import { drizzleCreateAdminDeps } from '../src/admin/provision-store.js'
import { createAdminAccount } from '../src/admin/service.js'

// NEDEN `fileURLToPath`: depo yolu Türkçe karakter içeriyor
// (`Masaüstü`). `URL.pathname` bunu `%C3%BC` olarak yüzde-kodlar ve
// `readdirSync` ENOENT verir — ölçüldü.
const MIG = fileURLToPath(new URL('../src/db/migrations', import.meta.url))
const pg = new PGlite()
for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
  for (const st of readFileSync(join(MIG, f), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await pg.exec(st)
  }
}
const db = drizzle(pg, { schema })

await createAdminAccount(
  { email: 'owner@t.local', displayName: 'Test Yönetici', password: 'cok-guclu-BIR-parola-123' },
  drizzleCreateAdminDeps(db),
)

// Panelin göstereceği birkaç gerçek satır — dashboard sayaçları sıfır olmasın.
await pg.query(
  `INSERT INTO users (email, display_name) VALUES
   ('ayse@t.local', 'Ayşe Yılmaz'),
   ('mehmet@t.local', 'Mehmet Demir'),
   ('zeynep@t.local', 'Zeynep Kaya')`,
)
await pg.query(
  `INSERT INTO weddings (couple_names, wedding_date, plan) VALUES
   ('Ayşe & Mehmet', '2026-09-12T19:00:00Z', 'PREMIUM'),
   ('Zeynep & Can', '2026-10-03T18:00:00Z', 'FREE')`,
)

const app = express()
// BigInt JSON'da patlar — app.ts'teki replacer ile aynı.
app.set('json replacer', (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
app.use(express.json())
app.use(
  '/api/v1/admin',
  createAdminRouter({ store: drizzleAdminPanelDeps(db), rateLimit: false }),
)
// Merkezi hata yakalayıcı: `{error:{code,message}}` sözleşmesi. `createApp()`
// kullanılmadığı için burada elle bağlanır — yoksa 401/423 gövdesiz dönerdi.
app.use((err, _req, res, _next) => {
  const status = typeof err?.statusCode === 'number' ? err.statusCode : 500
  res.status(status).json({
    error: { code: err?.code ?? 'INTERNAL', message: err?.message ?? 'Beklenmeyen hata' },
  })
})

app.listen(3000, () => console.log('admin dev server: http://localhost:3000'))
