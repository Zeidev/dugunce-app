import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Users } from './pages/Users'
import { UserDetail } from './pages/UserDetail'
import { Weddings } from './pages/Weddings'
import { WeddingDetail } from './pages/WeddingDetail'
import { Audit } from './pages/Audit'
import { api, ApiError, clearCsrfToken, onSessionExpired } from './api'
import { AuthProvider } from './auth-context'
import type { Admin } from './types'

/**
 * Uygulama kökü — yönlendirme + OTURUM KAPISI.
 *
 * NEDEN `basename="/spa"`: `vite.config.ts` içindeki `base: '/spa/'` sadece
 * varlık (JS/CSS) yollarını düzeltir. React Router kendi başına URL'nin
 * tamamına bakar; basename verilmezse `/spa/users` adresi `/users` rotasıyla
 * eşleşmez ve panel boş açılır. Bu, Cloudflare Pages'te derin bağlantı
 * verildiğinde ortaya çıkan en sinsi hatadır.
 *
 * `/login` rotası Layout'un DIŞINDA: giriş ekranı menü göstermez.
 */
export function App(): React.JSX.Element {
  return (
    <BrowserRouter basename="/spa">
      <AuthGate />
    </BrowserRouter>
  )
}

/**
 * Oturum durumu — guard'ın karar verebilmesi için üç ayrı hâl.
 *
 * NEDEN `boolean` YETMEZ: "henüz bilmiyoruz" (yükleniyor) ile "oturum yok"
 * (401) AYRI şeyler. İkisini birleştirmek, `me()` dönerken login'e
 * yönlendirmeye ve geçerli oturumu olan kullanıcının her sayfa
 * yenilemesinde giriş ekranına atılmasına yol açar. Bu, brief'in açıkça
 * uyardığı klasik hata.
 */
type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; admin: Admin }
  /** 401 — oturum gerçekten yok. Login'e yönlendirilir. */
  | { status: 'anonymous' }
  /**
   * 401 DIŞI hata (ağ, 500, CORS). Login'e ATILMAZ: oturum geçerli
   * olabilir, sadece sunucuya ulaşılamıyor. Hata + "tekrar dene" gösterilir.
   */
  | { status: 'error'; message: string }

/**
 * Oturum kapısı — tüm rotaları sarar.
 *
 * AKIŞ:
 *   loading  → tam ekran "yükleniyor" (yönlendirme YOK)
 *   error    → hata + "tekrar dene" (yönlendirme YOK)
 *   anonymous→ `/login?returnTo=<bulunulan yol>`
 *   authenticated → normal rotalar
 */
function AuthGate(): React.JSX.Element {
  const [session, setSession] = useState<SessionState>({ status: 'loading' })
  const location = useLocation()
  const navigate = useNavigate()

  /**
   * `me()` çağrısının en son sürümünü tutar.
   *
   * NEDEN `useCallback` + elle tetikleme: `loadSession` hem ilk açılışta
   * hem "tekrar dene" butonunda çalışmalı. `useEffect` bağımlılığına
   * yazmak yeterli olurdu ama "tekrar dene" butonu effect'i yeniden
   * çalıştıramaz; bu yüzden fonksiyon doğrudan çağrılabilir olmalı.
   */
  const loadSession = useCallback(async (): Promise<void> => {
    setSession({ status: 'loading' })
    try {
      const admin = await api.me()
      setSession({ status: 'authenticated', admin })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // TEK yönlendirme nedeni: sunucu "oturum yok" dedi.
        setSession({ status: 'anonymous' })
        return
      }
      // Ağ hatası / 5xx / CORS: oturum geçerli olabilir. Login'e atmak
      // kullanıcıyı gereksiz yere dışarıda bırakır ve ağ düzeldiğinde
      // yeniden giriş yapmasını gerektirirdi.
      const message =
        err instanceof ApiError
          ? err.message
          : 'Oturum bilgisi alınamadı. Lütfen tekrar deneyin.'
      setSession({ status: 'error', message })
    }
  }, [])

  // İlk açılışta oturumu doğrula. Bağımlılık BOŞ: bu yalnız bir kez
  // çalışmalı. Rota değişiminde tekrar çalışsaydı her gezinme bir `me()`
  // isteği üretirdi.
  useEffect(() => {
    void loadSession()
  }, [loadSession])

  /**
   * Çıkış — oturum durumunun TEK sahibi burasıdır.
   *
   * SIRA:
   *   1. `api.logout()` sunucudaki oturum satırını siler. Hata alsa bile
   *      (403 bayat CSRF, ağ yok) kullanıcı çıkmış sayılır; neden konsola
   *      yazılır.
   *   2. `clearCsrfToken()` — `api.logout()` bunu `finally` içinde kendisi
   *      de yapar, istek hiç başlamadıysa buradaki çağrı garanti eder.
   *   3. Durum `anonymous` → guard `/login`e yönlendirir.
   *
   * NEDEN BURADA: `Layout` doğrudan `navigate('/login')` yapsaydı guard
   * hâlâ `authenticated` kalırdı ve `/login` rotasındaki
   * `<Navigate to="/" replace />` kullanıcıyı panele geri atardı
   * (tarayıcıda ölçüldü).
   */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout()
    } catch (err) {
      // 403 CSRF_INVALID beklenen bir durum: sayfa uzun süre açık kaldıysa
      // sessionStorage'daki token bayatlamış olabilir. Kullanıcı yine de
      // çıkmalı — ama nedenini log'da bırakıyoruz.
      const reason = err instanceof ApiError ? `${err.status} ${err.code}` : String(err)
      console.warn(`Çıkış isteği başarısız (${reason}); yerel oturum yine de temizlendi.`)
    } finally {
      clearCsrfToken()
      setSession({ status: 'anonymous' })
    }
  }, [])

  /**
   * 401 "oturum düştü" olayı — herhangi bir uç 401 döndürdüğünde
   * (oturum süresi doldu, hesap silindi) oturum durumu anonimleşir.
   *
   * NEDEN GEREKLİ: kullanıcı panelde gezinirken oturum 30 dakika boşta
   * kalıp ölebilir. O anda bir istek 401 alır; guard'ın bunu bilmesi
   * gerekir, aksi hâlde sayfa boş tablolarla açık kalır.
   */
  useEffect(() => {
    return onSessionExpired(() => {
      setSession({ status: 'anonymous' })
    })
  }, [])

  // --- Yükleniyor: yönlendirme YOK, yalnız bekleme göstergesi -------------
  if (session.status === 'loading') {
    return (
      <div className="guard-state" role="status" aria-live="polite">
        <div className="guard-state__box">
          <span className="spinner" aria-hidden="true" />
          <p className="guard-state__text">Oturum kontrol ediliyor…</p>
        </div>
      </div>
    )
  }

  // --- 401 dışı hata: login'e ATMA, "tekrar dene" sun --------------------
  if (session.status === 'error') {
    return (
      <div className="guard-state" role="alert">
        <div className="guard-state__box">
          <h1 className="guard-state__title">Panele ulaşılamadı</h1>
          <p className="guard-state__text">{session.message}</p>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => {
              void loadSession()
            }}
          >
            Tekrar dene
          </button>
        </div>
      </div>
    )
  }

  // --- Anonim: yalnız login rotası --------------------------------------
  if (session.status === 'anonymous') {
    // `/login` DIŞINDA bir yoldaysak login'e `returnTo` ile yönlendirilir.
    //
    // NEDEN TEK YER (declarative `<Navigate>`), NEDEN AYRICA `useEffect`
    // DEĞİL: ilk sürümde hem buradaki `*` → `/login` `Navigate`'i hem de
    // bir `useEffect` içindeki `navigate('/login?returnTo=…')` vardı.
    // İkisi aynı anda çalışıp YARIŞIYORDU ve `Navigate` kazandığı için
    // `returnTo` KAYBOLUYORDU (tarayıcıda ölçüldü: `/spa/login`, sorgu
    // parametresi yok). Tek kaynak: aşağıdaki `<Navigate>`.
    //
    // `returnTo` basename'e GÖRELİdir (`location.pathname` basename'i
    // React Router tarafından zaten çıkarılmış gelir) ve `navigate`
    // basename'i geri ekler.
    if (location.pathname !== '/login') {
      const returnTo = `${location.pathname}${location.search}`
      return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
    }

    return (
      <Login
        onSuccess={(returnTo) => {
          // Giriş başarılı: oturumu yeniden çek (admin bilgisi ve
          // tazelenmiş CSRF token'ı için) ve hedef sayfaya git.
          void loadSession()
          navigate(returnTo, { replace: true })
        }}
      />
    )
  }

  // --- Oturum var: panel rotaları ---------------------------------------
  return <PanelRoutes admin={session.admin} signOut={signOut} />
}

interface PanelRoutesProps {
  admin: Admin
  signOut: () => Promise<void>
}

/**
 * Panel rota tablosu + oturum sağlayıcısı — AYRI bileşen.
 *
 * NEDEN AYRI: `Layout` `useAuth()` çağırıyor ve sağlayıcı olmadan hata
 * fırlatır. Rota tablosunu (derin bağlantı!) test etmek için
 * `MemoryRouter` ile sarmalarken sağlayıcıyı da kurmak gerekiyor. Bu
 * bileşen ikisini bir arada sunduğu için test, `AuthGate`'in oturum
 * akışını taklit etmek zorunda kalmıyor — sınanan şey GERÇEK rota
 * tablosu oluyor.
 *
 * NEDEN `admin`/`signOut` PROP: sağlayıcı değerini `AuthGate` üretiyor;
 * burada yeniden üretmek oturum durumunun iki sahibi olması demekti.
 */
export function PanelRoutes({ admin, signOut }: PanelRoutesProps): React.JSX.Element {
  return (
    <AuthProvider value={{ admin, signOut }}>
      <Routes>
        {/* `/login`'e doğrudan gelen oturumlu kullanıcı panele döner. */}
        <Route path="/login" element={<Navigate to="/" replace />} />

        {/*
          ROTALAR `Layout` İÇİNDE: menü, üst çubuk ve içerik tek kabuk.
          `Layout` `Outlet` ile alt rotayı basıyor; düz rota tanımlamak
          her sayfada kabuğu tekrar etmek demek olurdu.

          DİKKAT — DERİN BAĞLANTI: `/spa/weddings/<uuid>` doğrudan
          açıldığında bu tablo eşleşmeli. `basename="/spa"` sayesinde
          React Router `/spa` önekini çıkarıp `/weddings/<uuid>` ile
          karşılaştırır. `_redirects` içindeki `/spa/* /spa/ 200` kuralı
          sunucu tarafında index.html'i döndürür; ikisi birlikte
          yenilemede 404'ü engeller.
        */}
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="weddings" element={<Weddings />} />
          <Route path="weddings/:id" element={<WeddingDetail />} />
          <Route path="audit" element={<Audit />} />

          {/*
            Bilinmeyen yol: sessiz beyaz ekran yerine genel bakışa dön.
            NEDEN `<Navigate>`: 404 sayfası yazmak v1'de gereksiz; ama
            boş ekran bırakmak "panel bozuldu" izlenimi verir.
          */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
