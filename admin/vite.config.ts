import { defineConfig, type Plugin } from 'vite'
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
  plugins: [react(), spaTrailingSlash()],
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

/**
 * `/spa` → `/spa/` yönlendirmesi — YALNIZ geliştirme sunucusunda.
 *
 * SORUN (tarayıcıda ÖLÇÜLDÜ): React Router `basename="/spa"` + `/` rotası
 * için `href="/spa"` üretiyor (sondaki eğik çizgi YOK). Kullanıcı menüde
 * "Genel bakış"a tıklayınca adres çubuğu `/spa` oluyor; sayfayı
 * yenilediğinde Vite şu DÜZ METNİ döndürüyor:
 *
 *   "The server is configured with a public base URL of /spa/ —
 *    did you mean to visit /spa/ instead?"
 *
 * Yani oturum geçerli olsa bile panel BEYAZ EKRANA düşüyor. Üretimde
 * Cloudflare Pages bu durumda 308 veriyor (bkz. `_redirects` içindeki
 * `/auth → /auth/` notu), bu yüzden hata yalnız geliştirmede görünüyordu.
 *
 * NEDEN PLUGIN, NEDEN `_redirects`'e KURAL DEĞİL: üretim tarafı zaten
 * doğru. Buradaki amaç geliştirmeyi üretimle AYNI davranışa getirmek —
 * aksi hâlde "bende çalışıyor" tuzağı doğar.
 *
 * `historyApiFallback` KULLANILMADI: Vite'ın SPA geri dönüşü `/spa`yı
 * `/spa/`ya çevirmiyor, yalnız uzantısız yolları index.html'e düşürüyor;
 * `base` ile çakışınca yine 404 veriyor.
 */
/**
 * İsteğin yolunu `unknown` üzerinden okur.
 *
 * NEDEN BÖYLE: `admin/` projesinde `@types/node` YOK; Vite'ın
 * `IncomingMessage` tipi `http.IncomingMessage`'a dayanıyor ve `url`
 * alanı çözümlenemiyor (`tsc`: "Property 'url' does not exist").
 * `@types/node` eklemek tek satırlık bir iş için 2 MB'lık bir bağımlılık
 * getirir. `in` ile daraltma aynı güvenliği `as`/`any` OLMADAN verir.
 */
function readRequestUrl(req: unknown): string | null {
  if (typeof req !== 'object' || req === null) return null
  if (!('url' in req)) return null
  const value: unknown = req.url
  return typeof value === 'string' ? value : null
}

function spaTrailingSlash(): Plugin {
  return {
    name: 'spa-trailing-slash',
    // Yalnız `serve` (dev) aşamasında devreye girer; build'i etkilemez.
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Sorgu dizesini koru: `/spa?x=1` → `/spa/?x=1`.
        const url = readRequestUrl(req)
        if (url === null) {
          next()
          return
        }
        if (url === '/spa' || url.startsWith('/spa?')) {
          const query = url.slice('/spa'.length)
          res.writeHead(308, { Location: `/spa/${query}` })
          res.end()
          return
        }
        next()
      })
    },
  }
}

