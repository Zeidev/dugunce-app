import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/app.css'

/**
 * Giriş noktası.
 *
 * NEDEN TOKENLAR ÖNCE: `app.css` tokenları kullanır. Ters sırada yüklenirse
 * ilk boyamada değişkenler tanımsız kalır ve bir an renksiz içerik görünür.
 *
 * NEDEN `StrictMode`: geliştirmede effect'ler iki kez çalışır; çift istek
 * veya yarım kalmış temizlik hataları burada yakalanır. Üretim derlemesinde
 * etkisi yoktur.
 */

/**
 * SPA kökünü `/spa/` biçimine sabitler.
 *
 * SORUN (tarayıcıda ÖLÇÜLDÜ): React Router `basename="/spa"` + `/` rotası
 * için `href="/spa"` üretiyor — SONDAKİ EĞİK ÇİZGİ YOK. Menüde "Genel
 * bakış"a tıklayan kullanıcının adres çubuğu `/spa` oluyor ve sayfayı
 * yenilediğinde:
 *   - Vite geliştirme sunucusu "public base URL of /spa/ — did you mean
 *     /spa/?" düz metnini döndürüyor (beyaz ekran),
 *   - üretimde aynı davranışı Cloudflare Pages'in 308'ine bırakmak
 *     gerekiyor (bkz. `_redirects` içindeki `/auth → /auth/` notu).
 *
 * ÇÖZÜM: React Router MOUNT EDİLMEDEN ÖNCE yolu `/spa/` yap. Böylece
 * yenileme her iki ortamda da doğru kabuğu bulur. Bu düzeltme olmadan
 * "sayfayı yenile" adımı, oturum geçerli olsa bile paneli kaybettiriyordu.
 *
 * `replaceState` KULLANILIR, `location.replace` DEĞİL: ikincisi tam sayfa
 * yeniden yüklemesi yapar ve uygulamayı iki kez başlatır.
 */
function normalizeSpaRoot(): void {
  // Depo `/spa/` altında yayınlandığı için yol her zaman `/spa` ile başlar.
  if (window.location.pathname === '/spa') {
    window.history.replaceState(
      window.history.state,
      '',
      `/spa/${window.location.search}${window.location.hash}`,
    )
  }
}

normalizeSpaRoot()

const container = document.getElementById('root')

if (container === null) {
  // Sessizce boş sayfa bırakmak yerine görünür hata: index.html'deki
  // `#root` silinirse sorun tarayıcı konsolunda hemen anlaşılır.
  throw new Error('index.html içinde #root bulunamadı')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
