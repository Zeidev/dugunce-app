import { defineConfig } from 'vitest/config'

/**
 * Vitest yapılandırması — `vite.config.ts`'ten AYRI.
 *
 * NEDEN AYRI DOSYA: `vite.config.ts` yayın yapılandırmasıdır ve
 * `scripts/check-admin.mjs` onu desen eşleşmesiyle doğrular (`base`,
 * `outDir`, `emptyOutDir`). Test ayarlarını oraya karıştırmak, üretim
 * yapılandırmasını test aracına bağımlı hâle getirir; ayrıca `defineConfig`'i
 * `vitest/config`'ten almak Vite'ın kendi tiplerini gölgeler.
 *
 * `environment: 'jsdom'`: `api.ts` `sessionStorage` ve `Response`/`Headers`
 * gibi tarayıcı API'lerine dokunuyor. Node ortamında `sessionStorage` yoktur
 * ve testler daha kurulumda patlardı.
 *
 * `include` DAR: yalnız `src/**\/*.test.ts`. Geniş desen (`**\/*.test.*`)
 * `node_modules` altındaki paket testlerini de toplar ve süreyi dakikalara
 * çıkarır.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `toBeInTheDocument` / `toHaveFocus` gibi eşleştiriciler burada
    // yüklenir. `setupFiles` olmadan bileşen testleri ilk `expect`'te
    // "is not a function" ile patlar.
    setupFiles: ['src/test-setup.ts'],
    // Ağa ÇIKILMAZ: testler `fetch`'i stub'lar. `restoreMocks` her testten
    // sonra global stub'ları temizler; unutulursa bir sonraki test sahte
    // fetch ile sessizce "geçer".
    restoreMocks: true,
    clearMocks: true,
  },
})
