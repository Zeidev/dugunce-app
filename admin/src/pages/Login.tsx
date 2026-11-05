import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { loginErrorMessage } from './login-messages'

/**
 * Giriş ekranı — menü GÖSTERMEZ (Layout dışında render edilir).
 *
 * ÜÇ KURAL:
 *
 * 1. `autocomplete` DOĞRU olmalı (`email` / `current-password`). Yanlış
 *    değer parola yöneticisinin formu tanımamasına ve tarayıcının parolayı
 *    yanlış alana doldurmasına yol açar — operatörün her girişte elle
 *    yazması demek.
 * 2. Hata SATIR İÇİ gösterilir, `alert()` YOK: modal uyarı formu kapatır,
 *    kullanıcı hangi alanın sorunlu olduğunu göremez ve `check-admin.mjs`
 *    `alert(` çağrısını zaten yasaklıyor.
 * 3. Enter ile gönderim çalışır: `<form onSubmit>` kullanılır, butona
 *    `onClick` bağlanmaz. `onClick` yalnız olsaydı Enter hiçbir şey
 *    yapmazdı (operatörün ilk deneyeceği şey).
 */

/**
 * Yönlendirme sonrası dönülecek yolu taşıyan state.
 *
 * NEDEN `location.state` DEĞİL DE `returnTo` SORGU PARAMETRESİ: guard
 * yönlendirirken `state` ile taşımak da çalışırdı, ama sayfa yenilenirse
 * state kaybolur ve kullanıcı `/`e düşer. Sorgu parametresi yenilemeye
 * dayanır ve paylaşılabilir.
 */
const RETURN_TO_PARAM = 'returnTo'

/**
 * Yalnız SPA İÇİ göreli yolları kabul eder.
 *
 * GÜVENLİK: `returnTo` doğrulanmazsa `?returnTo=https://kotu-site.example`
 * ile açık yönlendirme (open redirect) oluşur; saldırgan panelin gerçek
 * giriş adresini kullanarak kullanıcıyı kendi sitesine gönderir.
 * `//` ile başlayan değerler de protokol-göreli mutlak URL'dir — reddedilir.
 */
export function safeReturnTo(raw: string | null): string {
  if (raw === null) return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//')) return '/'
  return raw
}

interface LoginProps {
  /**
   * Giriş başarılı olduğunda çağrılır.
   *
   * NEDEN PROP: `App.tsx` oturum durumunu tutuyor; giriş sonrası admin
   * bilgisini yeniden çekmek yerine doğrudan iletiyoruz. Ayrıca testte
   * yönlendirme davranışını gözlemlemek kolaylaşıyor.
   */
  onSuccess: (returnTo: string) => void
}

export function Login({ onSuccess }: LoginProps): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const params = new URLSearchParams(location.search)
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM))

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    // Form submit'in sayfayı yenilemesini engeller — SPA'da tam sayfa
    // yenileme tüm oturum durumunu sıfırlar.
    event.preventDefault()

    if (submitting) return

    // Boş alanları sunucuya göndermeden yakala: gereksiz bir 400 turu ve
    // hız sınırı kotası harcamak anlamsız.
    if (email.trim() === '' || password === '') {
      setError('E-posta ve parola gerekli.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await api.login(email.trim(), password)
      onSuccess(returnTo)
    } catch (err) {
      // 423 / 403 / 401 / 429 / ağ hatası AYRI metinler alır
      // (`login-messages.ts`); burada tek bir "giriş başarısız" demek
      // operatöre ne yapacağını söylemez.
      setError(loginErrorMessage(err))
      // Parolayı TEMİZLE, e-postayı BIRAK: parola yanlışsa kullanıcı
      // e-postasını yeniden yazmak zorunda kalmasın. Parolayı bırakmak
      // ise yanlış değerin tekrar gönderilmesine ve kilit sayacının
      // gereksiz artmasına yol açardı.
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Oturum zaten geçerliyse giriş ekranını göstermenin anlamı yok.
   * Guard bunu `App.tsx`'te de kontrol ediyor; buradaki kontrol
   * `/spa/login` adresine doğrudan gelen kullanıcı içindir.
   */
  function handleAlreadyLoggedIn(): void {
    navigate(returnTo, { replace: true })
  }

  return (
    <div className="login-shell">
      <main className="login-card" aria-labelledby="login-title">
        <div className="login-card__brand">
          Düğünce
          <span className="login-card__brand-sub">Admin</span>
        </div>

        <h1 className="login-card__title" id="login-title">
          Yönetim paneline giriş
        </h1>
        <p className="login-card__hint">
          Bu alan yalnızca yetkili personel içindir.
        </p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              E-posta
            </label>
            <input
              className="field__input"
              id="login-email"
              name="email"
              type="email"
              // Parola yöneticisi ve tarayıcı otomatik doldurması bu
              // değere göre çalışır; değiştirilmemeli.
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              // Hata varken alan odaklanınca mesaj kalksın: kullanıcı
              // düzeltmeye başladığında eski hata kafasını karıştırmasın.
              onFocus={() => setError(null)}
              disabled={submitting}
              aria-describedby={error !== null ? 'login-error' : undefined}
              aria-invalid={error !== null}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Parola
            </label>
            <input
              className="field__input"
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onFocus={() => setError(null)}
              disabled={submitting}
              aria-describedby={error !== null ? 'login-error' : undefined}
              aria-invalid={error !== null}
            />
          </div>

          {/*
            HATA — satır içi, `role="alert"` ile ekran okuyucuya anında
            duyurulur. `aria-live="assertive"` yerine `role="alert"`
            yeterli (ikisi aynı davranışı verir, `role` daha yaygın).
          */}
          {error !== null && (
            <p className="form-error" id="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn btn--primary login-form__submit"
            type="submit"
            // Yükleme sırasında çift gönderim engellenir; `aria-busy`
            // ekran okuyucuya "işlem sürüyor" der.
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>

        {/*
          Oturum zaten açıksa hızlı çıkış yolu. Gizli bir "devam et"
          butonu koymak yerine bağlantı: giriş ekranına gelen kullanıcı
          ya giriş yapacak ya da panele dönecek.
        */}
        <button
          type="button"
          className="btn btn--ghost login-card__back"
          onClick={handleAlreadyLoggedIn}
        >
          Panele dön
        </button>
      </main>
    </div>
  )
}
