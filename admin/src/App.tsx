import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

/**
 * Uygulama kökü — yalnız YÖNLENDİRME iskeleti.
 *
 * NEDEN `basename="/spa"`: `vite.config.ts` içindeki `base: '/spa/'` sadece
 * varlık (JS/CSS) yollarını düzeltir. React Router kendi başına URL'nin
 * tamamına bakar; basename verilmezse `/spa/users` adresi `/users` rotasıyla
 * eşleşmez ve panel boş açılır. Bu, Cloudflare Pages'te derin bağlantı
 * verildiğinde ortaya çıkan en sinsi hatadır.
 *
 * Login sayfası ve auth guard Task 10'da gelir — bu görevde YAZILMAZ.
 * Guard eklenene kadar Layout doğrudan render edilir.
 */
export function App(): React.JSX.Element {
  return (
    <BrowserRouter basename="/spa">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPlaceholder />} />
          {/*
            Task 10: `/login` rotası buraya, Layout'un DIŞINA eklenecek
            (giriş ekranı menü göstermez). Guard eklendiğinde oturumsuz
            kullanıcı buraya yönlendirilecek.
          */}
          {/* Bilinmeyen yol: sessiz beyaz ekran yerine genel bakışa dön. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

/**
 * Geçici "Genel bakış" yer tutucusu — Task 11'de gerçek dashboard ile
 * değiştirilecek. Burada olmasının nedeni, iskeletin boş bir sayfa değil
 * GERÇEKTEN render eden bir uygulama olduğunu doğrulamak.
 */
function OverviewPlaceholder(): React.JSX.Element {
  return (
    <section>
      <div className="stat-grid">
        <article className="stat">
          <div className="stat__label">Kullanıcı</div>
          <div className="stat__value">—</div>
          <div className="stat__delta">Task 11'de bağlanacak</div>
        </article>
        <article className="stat">
          <div className="stat__label">Düğün</div>
          <div className="stat__value">—</div>
          <div className="stat__delta">Task 11'de bağlanacak</div>
        </article>
        <article className="stat">
          <div className="stat__label">Premium</div>
          <div className="stat__value">—</div>
          <div className="stat__delta">Task 11'de bağlanacak</div>
        </article>
        <article className="stat">
          <div className="stat__label">Davetli</div>
          <div className="stat__value">—</div>
          <div className="stat__delta">Task 11'de bağlanacak</div>
        </article>
      </div>
    </section>
  )
}
