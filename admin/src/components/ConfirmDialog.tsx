import { useCallback, useEffect, useId, useRef } from 'react'

/**
 * `ConfirmDialog` — geri alınabilir ama ÖNEMLİ işlemler için onay
 * (spec §9.1). Panelde tek kullanımı plan değiştirme.
 *
 * GERÇEK ODAK TUZAĞI — brief §5:
 *  - `Esc` kapatır
 *  - `Tab` / `Shift+Tab` dialog İÇİNDE döner (arka plana kaçmaz)
 *  - açılınca odak İLK butona gider
 *  - kapanınca odak ÇAĞIRANA döner
 *  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
 *
 * NEDEN BU KADAR ÖNEMLİ: odak tuzağı olmayan bir dialog'da klavye
 * kullanıcısı `Tab` ile arkadaki "Çıkış" butonuna kaçar; `Enter`'a
 * basınca panelden atılır ve yaptığı işi kaybeder. `aria-modal` tek
 * başına bunu ENGELLEMEZ — yalnız ekran okuyucuya bildirir, tarayıcının
 * odak sırasını değiştirmez. Bu yüzden `keydown` ile elle sarılır.
 *
 * NEDEN İLK ODAK "VAZGEÇ": yıkıcı/önemli işlemde varsayılan odak onay
 * butonunda olursa, dialog açılır açılmaz `Enter`'a basan kullanıcı
 * farkında olmadan planı değiştirir. Vazgeç güvenli varsayılandır.
 */

interface ConfirmDialogProps {
  title: string
  description: string
  /** Onay butonunun metni — eylemi ADIYLA söyler ("PREMIUM yap"). */
  confirmLabel: string
  cancelLabel: string
  /** İstek sürüyor: iki buton da kilitlenir (çift gönderim yok). */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Dialog içindeki odaklanabilir öğeler.
 *
 * NEDEN SABİT SEÇİCİ: `:not([disabled])` ile devre dışı butonlar
 * dışarıda kalır — aksi hâlde `Tab` görünmez bir hedefe "odaklanır" ve
 * tuş hiçbir şey yapmıyormuş gibi görünür.
 */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  /**
   * Açan öğe — kapanınca odağın döneceği yer.
   *
   * NEDEN `useRef` + ilk render'da yakalama: dialog açıldığında
   * `document.activeElement` hâlâ çağıran butondur (React, dialog'u
   * render ederken odağı değiştirmez). Sonraki render'larda okumak
   * yanlış öğeyi yakalardı.
   */
  const openerRef = useRef<Element | null>(null)
  if (openerRef.current === null && typeof document !== 'undefined') {
    openerRef.current = document.activeElement
  }

  /** Dialog içindeki odaklanabilir öğeler — DOM'dan, sırayla. */
  const focusables = useCallback((): HTMLElement[] => {
    const root = dialogRef.current
    if (root === null) return []
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  }, [])

  // Açılışta odak ilk butona (Vazgeç) gider.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Kapanınca odak çağırana döner.
  useEffect(() => {
    const opener = openerRef.current
    return () => {
      // `HTMLElement` kontrolü: opener bir SVG öğesi veya `body` olabilir;
      // `focus` her elemanda yok. Sessizce atlamak, çökmekten iyidir.
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus()
      }
    }
  }, [])

  // `Esc` kapatır — odak nerede olursa olsun çalışsın diye `document`
  // üzerinde dinlenir (dialog içindeki bir input da Esc alabilmeli).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  /**
   * `Tab` / `Shift+Tab` sarmalaması.
   *
   * NEDEN `preventDefault`: tarayıcının varsayılan `Tab` davranışı
   * odağı dialog'un DIŞINA taşır. Yalnız "son elemandan sonra ilkine
   * odakla" demek yetmez; varsayılan da çalışırsa odak iki kez ilerler.
   *
   * NEDEN SON ELEMANDA DA KONTROL: tek odaklanabilir öğe varsa (ör.
   * yalnız onay butonu) `Tab` yine de dialog'da kalmalı.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') return

    const items = focusables()
    if (items.length === 0) {
      event.preventDefault()
      return
    }

    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) return

    const active = document.activeElement
    const atFirst = active === first
    const atLast = active === last

    if (event.shiftKey) {
      if (atFirst || !dialogRef.current?.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (atLast || !dialogRef.current?.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    /*
      Karartma katmanı: tıklama ile kapanmaz. Yanlışlıkla dışarı tıklamak
      "plan değişti mi?" belirsizliği yaratır; kapatma yolu bilinçli
      olmalı (Vazgeç / Esc).
    */
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        <p className="dialog__desc" id={descriptionId}>
          {description}
        </p>

        <div className="dialog__actions">
          <button
            type="button"
            className="btn"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
