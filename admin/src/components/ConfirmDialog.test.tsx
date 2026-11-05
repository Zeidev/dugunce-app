import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * `ConfirmDialog` testleri — GERÇEK ODAK TUZAĞI.
 *
 * Brief §5: `Esc` kapatır, `Tab`/`Shift+Tab` dialog içinde DÖNER,
 * açılınca odak ilk butona gider, kapanınca odak ÇAĞIRANA döner,
 * `role="dialog"` + `aria-modal` + `aria-labelledby`.
 *
 * NEDEN: plan değiştirme geri alınabilir ama ÖNEMLİ bir işlem. Odak
 * tuzağı olmayan bir dialog'da klavye kullanıcısı `Tab` ile arkadaki
 * "Çıkış" butonuna kaçar, `Enter`'a basar ve panelden atılır. Bu yüzden
 * davranış test edilir, yorumla geçiştirilmez.
 */

/** Açan butonu + dialog'u birlikte kuran gerçekçi sarmalayıcı. */
function Harness({ onConfirm }: { onConfirm?: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Planı değiştir
      </button>
      <button type="button">Arka plan butonu</button>
      {open && (
        <ConfirmDialog
          title="Planı değiştir"
          description="Düğün PREMIUM plana geçirilecek."
          confirmLabel="PREMIUM yap"
          cancelLabel="Vazgeç"
          onConfirm={() => {
            onConfirm?.()
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}

describe('ConfirmDialog', () => {
  it('role="dialog" + aria-modal + aria-labelledby taşır', () => {
    render(<Harness />)
    return userEvent.click(screen.getByRole('button', { name: 'Planı değiştir' })).then(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      const labelledBy = dialog.getAttribute('aria-labelledby')
      expect(labelledBy).not.toBeNull()
      const title = document.getElementById(labelledBy ?? '')
      expect(title?.textContent).toBe('Planı değiştir')
    })
  })

  it('açılınca odak İLK butona gider', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    // İlk odaklanabilir öğe "Vazgeç" — yıkıcı işlemde varsayılan odak
    // ONAY butonunda olmamalı (yanlışlıkla Enter'a basan onaylamasın).
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toHaveFocus()
  })

  it('Esc dialogu kapatır ve odak ÇAĞIRANA döner', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Planı değiştir' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Odak geri dönmezse klavye kullanıcısı sayfanın BAŞINA düşer ve
    // nerede olduğunu kaybeder (WCAG 2.4.3 odak sırası).
    expect(opener).toHaveFocus()
  })

  it('Tab dialog içinde DÖNER, arka plana kaçmaz', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))

    const cancel = screen.getByRole('button', { name: 'Vazgeç' })
    const confirm = screen.getByRole('button', { name: 'PREMIUM yap' })

    expect(cancel).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    // Son elemandan sonra tekrar İLK elemana döner — "Arka plan butonu"na
    // veya adres çubuğuna kaçmaz.
    await user.tab()
    expect(cancel).toHaveFocus()
  })

  it('Shift+Tab dialog içinde GERİYE döner', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))

    const cancel = screen.getByRole('button', { name: 'Vazgeç' })
    const confirm = screen.getByRole('button', { name: 'PREMIUM yap' })

    expect(cancel).toHaveFocus()
    // İlk elemandan geriye: SON elemana sarar.
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
  })

  it('onay butonu onConfirm çağırır ve dialog kapanır', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(screen.getByRole('button', { name: 'PREMIUM yap' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('meşgulken onay butonu devre dışı kalır (çift gönderim yok)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Planı değiştir"
        description="Sürüyor"
        confirmLabel="PREMIUM yap"
        cancelLabel="Vazgeç"
        busy
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    )
    const confirm = screen.getByRole('button', { name: 'PREMIUM yap' })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
