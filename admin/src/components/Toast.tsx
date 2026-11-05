import { useEffect } from 'react'

/**
 * `Toast` — sağ altta, 4 sn, başarı/hata (spec §9.1).
 *
 * NEDEN: plan değiştirme gibi işlemlerden sonra geri bildirim şart.
 * Satır içi hata (`.form-error`) formlar için doğru; ama düğün detayında
 * form yok — kullanıcı bir butona basıyor ve sonucu görmeli.
 *
 * ERİŞİLEBİLİRLİK AYRIMI:
 *  - başarı → `role="status"` (kibar: ekran okuyucu sıraya koyar)
 *  - hata   → `role="alert"` (assertive: hemen duyurulur)
 * İkisini de `alert` yapmak, başarılı bir işlemde ekran okuyucuyu
 * keserdi.
 *
 * NEDEN KENDİLİĞİNDEN KAPANIR: kalıcı bir bildirim kutusu ekranın
 * sağ altını sürekli işgal eder ve sonraki bildirimi gizler.
 */

interface ToastProps {
  kind: 'success' | 'error'
  message: string
  /** Kapanma nedeni çağıranın umurunda değil; yalnız "kaldır" der. */
  onClose: () => void
}

/** Görünme süresi — spec §9.1 "4 sn". */
export const TOAST_DURATION_MS = 4000

export function Toast({ kind, message, onClose }: ToastProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onClose, TOAST_DURATION_MS)
    // Süre dolmadan sökülürse (yeni bildirim geldi) zamanlayıcı iptal
    // edilir; aksi hâlde eski `onClose` yeni bildirimi kapatırdı.
    return () => clearTimeout(timer)
    // `onClose` bağımlılıkta: çağıran her render'da yeni fonksiyon
    // üretirse zamanlayıcı sıfırlanır ve bildirim asla kapanmaz. Bu
    // yüzden sayfalar `onClose`'u `useCallback` ile sabitler.
  }, [onClose])

  return (
    <div className={`toast toast--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={onClose}
        aria-label="Bildirimi kapat"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
