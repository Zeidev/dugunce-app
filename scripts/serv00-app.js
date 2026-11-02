/**
 * serv00 / Phusion Passenger giriş noktası.
 *
 * Bu dosya `~/domains/DOMAIN/public_nodejs/app.js` olarak kopyalanır.
 *
 * DOĞRULANMIŞ DAVRANIŞ (2026-11-02, canlı sunucuda test edildi):
 *
 * 1. Passenger `app.js`'i `require()` ile yükler → dosya COMMONJS olmalı.
 *    ESM yazılırsa "Cannot use import statement outside a module" verir.
 *    `dist/server.js` ESM olduğu için dinamik `import()` kullanılır.
 *
 * 2. `.env` backend/ içinde. Passenger çalışma dizini `public_nodejs/`
 *    olduğu için dotenv onu bulamaz → yol AÇIKÇA verilir.
 *
 * 3. `listen()` çağrısı Passenger tarafından yakalanır; gerçek port
 *    açılmaz. Manuel `node app.js` çalıştırınca `EPERM` vermesi
 *    NORMALDİR — Passenger altında çalışır.
 *
 * 4. `dotenv` backend/node_modules içinde; bu dosya bir üst dizinde
 *    olduğu için `require('dotenv')` çözülmez → tam yol kullanılır.
 */

const path = require('node:path')

const backend = path.join(__dirname, 'backend')

// .env'i backend/ içinden oku
require(path.join(backend, 'node_modules', 'dotenv')).config({
  path: path.join(backend, '.env'),
})

// ESM uygulamayı dinamik import ile başlat.
// Passenger `require()` yaptığı için import() bir Promise döner ve
// Passenger bunu beklemez — hata olursa log'a yazılır.
import(path.join(backend, 'dist', 'server.js')).catch((err) => {
  console.error('[app.js] uygulama başlatılamadı:', err)
  throw err
})
