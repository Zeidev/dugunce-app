import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchInput } from './SearchInput'

/**
 * `SearchInput` testleri — 300 ms debounce + TEMİZLERKEN BEKLEMEME.
 *
 * Brief §8: "Debounce'lu arama test edilebilir olmalı: `vi.useFakeTimers()`.
 * Aramayı temizlerken 300 ms BEKLEMEMELİ — boş sorgu hemen gitmeli."
 *
 * NEDEN TEMİZLEME ANINDA: operatör aramayı silip listeyi hemen geri
 * istiyor. 300 ms beklemek "boş liste" hissi verir ve kullanıcı butona
 * ikinci kez basar; ayrıca silme sırasında ekranda eski filtreli liste
 * kalır. Boş sorgu filtreyi KALDIRIR, yani geciktirmenin bir faydası yok.
 *
 * NEDEN FAKE TIMERS: gerçek 300 ms beklemek testi yavaşlatır ve CI'da
 * zamanlamaya bağlı KIRMIZI üretir (`setTimeout` 299 ms'de tetiklenebilir).
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * `userEvent` + fake timers: `advanceTimers` seçeneği verilmezse
 * user-event kendi iç gecikmelerinde takılır ve `await` sonsuza kadar
 * bekler (ölçüldü: test zaman aşımına düşüyor).
 */
function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

describe('SearchInput', () => {
  it('yazdıktan 300 ms SONRA onChange çağırır', async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<SearchInput label="Ara" value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Ara'), 'ayşe')

    // Henüz 300 ms dolmadı — istek ATILMAZ.
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledWith('ayşe')
  })

  it('hızlı yazımda ARA değerleri değil, SON değeri gönderir', async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<SearchInput label="Ara" value="" onChange={onChange} />)

    const input = screen.getByLabelText('Ara')
    await user.type(input, 'a')
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    await user.type(input, 'y')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Yalnız bir çağrı: "a" için istek atılsaydı iki kez çağrılırdı.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('ay')
  })

  it('TEMİZLERKEN 300 ms BEKLEMEZ — boş sorgu hemen gider', async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<SearchInput label="Ara" value="ayşe" onChange={onChange} />)

    const input = screen.getByLabelText('Ara')
    await user.clear(input)

    // Zaman İLERLETİLMEDEN çağrı gelmeli.
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('temizleme butonu alanı boşaltır', async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<SearchInput label="Ara" value="ayşe" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Aramayı temizle' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('boşken temizleme butonu GÖRÜNMEZ', () => {
    render(<SearchInput label="Ara" value="" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Aramayı temizle' })).not.toBeInTheDocument()
  })

  it('Ctrl+K arama alanına odaklar', async () => {
    const user = setupUser()
    render(
      <div>
        <SearchInput label="Ara" value="" onChange={vi.fn()} />
        <button type="button">başka</button>
      </div>,
    )
    // Spec §9.1 "⌘K arama" — klavye kısayolu.
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByLabelText('Ara')).toHaveFocus()
  })

  it('görünür etiket taşır (aria-label değil <label>)', () => {
    render(<SearchInput label="Kullanıcı ara" value="" onChange={vi.fn()} />)
    // Ekran okuyucu VE gözle gören kullanıcı aynı metni görür.
    expect(screen.getByText('Kullanıcı ara')).toBeInTheDocument()
  })
})
