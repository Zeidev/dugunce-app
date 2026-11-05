import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast } from './Toast'

/**
 * `Toast` testleri — spec §9.1: "Sağ altta, 4 sn, başarı/hata".
 *
 * NEDEN 4 SN TEST EDİLİR: plan değiştirme sonrası geri bildirim budur.
 * Kendiliğinden kaybolmazsa ekranda kalıcı bir kutu olur; çok erken
 * kaybolursa (ör. 1 sn) operatör okumadan gider ve "değişti mi?" diye
 * tekrar dener.
 *
 * NEDEN `role="status"` / `role="alert"`: başarı sessizce duyurulursa
 * ekran okuyucu kullanıcısı planın değiştiğini HİÇ öğrenmez.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('başarı mesajını role="status" ile duyurur', () => {
    render(<Toast kind="success" message="Plan PREMIUM olarak güncellendi" onClose={vi.fn()} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Plan PREMIUM olarak güncellendi')
  })

  it('hata mesajını role="alert" ile duyurur', () => {
    render(<Toast kind="error" message="Plan değiştirilemedi" onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Plan değiştirilemedi')
  })

  it('4 saniye sonra kendiliğinden kapanır', async () => {
    const onClose = vi.fn()
    render(<Toast kind="success" message="Kaydedildi" onClose={onClose} />)

    await act(async () => {
      vi.advanceTimersByTime(3999)
    })
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('kapatma butonu hemen kapatır', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    render(<Toast kind="success" message="Kaydedildi" onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Bildirimi kapat' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
