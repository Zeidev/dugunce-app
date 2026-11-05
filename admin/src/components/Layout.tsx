import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth-context'

/**
 * Panelin dış kabuğu: sol menü + üst çubuk + içerik.
 *
 * NEDEN BURADA: Task 11'deki sayfalar (kullanıcılar, düğünler, denetim)
 * aynı kabuğu paylaşır. Kabuk `App.tsx` içinde tanımlansaydı her rota
 * için tekrar eder, menü aktifliği üç yerde ayrı ayrı hesaplanırdı.
 */

interface NavItem {
  to: string
  label: string
}

/**
 * Menü sırası işe göre: önce genel bakış (durum), sonra varlıklar
 * (kullanıcı/düğün), en sonda denetim (nadiren bakılır).
 *
 * NEDEN `end` YALNIZ "/" İÇİN: `/` öneki diğer tüm yolların önekidir;
 * `end` verilmezse "Genel bakış" her sayfada aktif görünür.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Genel bakış' },
  { to: '/users', label: 'Kullanıcılar' },
  { to: '/weddings', label: 'Düğünler' },
  { to: '/audit', label: 'Denetim' },
]

export function Layout(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const { admin, signOut } = useAuth()

  /**
   * Çıkış — gerçek iş `AuthContext.signOut`'ta.
   *
   * NEDEN BURADA `api.logout()` ÇAĞRILMIYOR: ilk sürüm öyle yapıyordu ve
   * guard'ın oturum durumu `authenticated` kaldığı için `/login`
   * rotasındaki `<Navigate to="/" replace />` kullanıcıyı PANELE GERİ
   * ATIYORDU (tarayıcıda ölçüldü). Oturum durumunun tek sahibi guard;
   * çıkış da oradan geçer. Buradaki buton yalnız niyeti iletir.
   */
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout(): Promise<void> {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await signOut()
    } finally {
      // Bileşen büyük olasılıkla sökülür (guard anonimleşince login
      // render edilir); `finally` yine de durumu tutarlı bırakır.
      setLoggingOut(false)
    }
  }

  // Üst çubuk başlığı rota tablosundan türetilir — sayfa başlığını her
  // sayfa kendisi yazsaydı menüyle başlık zamanla ayrışırdı.
  // `noUncheckedIndexedAccess` açık olduğu için `find` sonucu undefined
  // olabilir; eşleşme yoksa nötr başlık gösterilir.
  const active = NAV_ITEMS.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )
  const title = active?.label ?? 'Yönetim'

  // Esc ile menüyü kapat (spec §9.1 etkileşim kuralı: "Esc dialog kapatır").
  // Mobilde menü içerik overlay'ini örttüğü için kapatma yolu klavyeden de
  // erişilebilir olmalı — aksi hâlde menü "hapsedici" olur.
  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  // Rota değişince menü kapanır. Yalnız NavLink onClick'ine güvenmek
  // yetmez: tarayıcı geri/ileri tuşuyla da rota değişir ve menü açık kalır.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="app-shell">
      <aside
        className={menuOpen ? 'sidebar is-open' : 'sidebar'}
        // `aria-hidden` BİLİNÇLİ OLARAK YOK. İlk sürümde `aria-hidden={!menuOpen}`
        // vardı; masaüstünde menü her zaman görünür olduğu için bu, menüyü
        // ekran okuyucudan tamamen gizliyordu (gerçek hata). Mobilde kapalı
        // menü zaten `display: none` — bu da erişilebilirlik ağacından
        // çıkarır. Yani ayrıca `aria-hidden` gerekmiyor, zarar veriyor.
        id="admin-sidebar"
      >
        <div className="sidebar__brand">
          <span>
            Düğünce
            <span className="sidebar__brand-sub">Admin</span>
          </span>
          {/*
            Mobil kapatma butonu. NEDEN GEREKLİ: menü mobilde sabit
            overlay olarak açılıyor ve üst çubuktaki hamburger butonunun
            ÜZERİNİ örtüyor — buton olmadan kullanıcı menüyü kapatamıyordu
            (ekran görüntüsünde doğrulandı). Masaüstünde gizli, çünkü
            orada menü zaten kalıcı ve hamburger yok.
          */}
          <button
            type="button"
            className="sidebar__close"
            aria-label="Menüyü kapat"
            onClick={() => setMenuOpen(false)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Ana menü">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              // Tıklamada mobil menü kapanır: aksi hâlde yeni sayfa açılır
              // ama menü açık kalır ve içeriği örter.
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                isActive ? 'sidebar__link is-active' : 'sidebar__link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-toggle"
            // aria-expanded + aria-controls: ekran okuyucu menünün açık
            // olup olmadığını ve hangi bölgeyi yönettiğini bilsin.
            aria-expanded={menuOpen}
            aria-controls="admin-sidebar"
            aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>

          <h1 className="topbar__title">{title}</h1>

          {/*
            ÇIKIŞ — gerçek. `api.logout()` → CSRF temizliği → `/login`.
            Hata olsa bile kullanıcı çıkarılır (yukarıdaki `handleLogout`).
          */}
          <span className="topbar__user" title={admin.email}>
            {admin.displayName}
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              void handleLogout()
            }}
            disabled={loggingOut}
            aria-busy={loggingOut}
          >
            {loggingOut ? 'Çıkılıyor…' : 'Çıkış'}
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
