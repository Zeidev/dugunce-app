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

/**
 * Derleme kimliği — `vite.config.ts` içindeki `define` ile gömülür.
 *
 * NEDEN: yayındaki panelin hangi commit'ten derlendiği GÖRÜNSÜN. Cloudflare
 * Pages SPA'yı derlemediğinde `/spa/` yine 200 dönüyordu (catch-all kök
 * `index.html`e düşüyordu) ve "deploy oldu mu?" sorusunun yanıtı yoktu.
 * Bu değer altbilgide yazılır.
 *
 * `dev` = yerel geliştirme (Cloudflare'de `CF_PAGES_COMMIT_SHA` tanımlıdır).
 */
declare const __BUILD_ID__: string
