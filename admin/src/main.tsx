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
