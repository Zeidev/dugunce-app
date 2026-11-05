import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Admin SPA — mevcut Cloudflare Pages projesinin `/spa/` yolunda yayınlanır.
 *
 * NEDEN `base: '/spa/'`: Vite varsayılan olarak varlıkları kökten ister
 * (`/assets/index-abc.js`). `/spa/users` gibi derin bir bağlantıda bu istek
 * köke gider, dosya bulunamaz ve panel bembeyaz açılır. `base` bunu
 * `/spa/assets/...` yapar.
 *
 * NEDEN `outDir` doğrudan `frontend/public/spa`: ayrı bir kopyalama adımı
 * CI'da unutulur ve eski derleme yayında kalır. Çıktı doğrudan Pages'in
 * yayınladığı dizine yazılır. Bu dizin `.gitignore`'da — commit edilmez.
 */
export default defineConfig({
  base: '/spa/',
  plugins: [react()],
  build: {
    outDir: '../frontend/public/spa',
    // Her derlemede temizle: eski hash'li varlıklar birikirse Pages
    // yüklemesi şişer ve yanlış sürüm servis edilebilir.
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    // Geliştirme sırasında API'ye aynı kökenden gidiyormuş gibi davran:
    // çerezler (a_session / a_csrf) SameSite kurallarına takılmasın.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
