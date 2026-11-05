/**
 * Vite ortam tipleri.
 *
 * NEDEN GEREKLİ: `api.ts` `import.meta.env.PROD` okuyor. Bu alan Vite'ın
 * `vite/client` tiplerinde tanımlı; tsconfig'e `types` olarak eklenmezse
 * `tsc --noEmit` "Property 'env' does not exist on type 'ImportMeta'"
 * verir ve `npm run build` kırılır.
 *
 * NEDEN tsconfig'e `types: ["vite/client"]` YAZILMADI: `check-admin.mjs`
 * tsconfig'i okuyup katılık bayraklarını doğruluyor; `types` dizisi
 * eklemek o dosyayı değiştirmek demek. Ayrı bir bildirim dosyası
 * (`/// <reference ... />`) aynı etkiyi yapar ve yapılandırmayı
 * olduğu gibi bırakır.
 */

/// <reference types="vite/client" />
