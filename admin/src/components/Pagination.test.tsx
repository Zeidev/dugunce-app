import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

/**
 * `Pagination` testleri — `nextCursor === null` SÖZLEŞMESİ.
 *
 * Brief §7: "`Page<T>` zarfı `{ items, nextCursor }`. 'Daha fazla' butonu
 * `nextCursor === null` iken **GİZLENMELİ**. `undefined` ile karıştırma."
 *
 * NEDEN KRİTİK: cursor tabanlı sayfalamada son sayfada buton görünmeye
 * devam ederse operatör sonsuza kadar tıklar; her tıklama aynı boş
 * sayfayı getirir. `undefined` kontrolü (`!nextCursor`) burada YETMEZ
 * çünkü sözleşme `null` diyor — `undefined` "alan gelmedi" demektir ve
 * sessiz bir sözleşme ihlalidir.
 */

describe('Pagination', () => {
  it('nextCursor null iken "Daha fazla" GİZLENİR', () => {
    render(<Pagination nextCursor={null} total={12} onLoadMore={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Daha fazla/ })).not.toBeInTheDocument()
  })

  it('nextCursor dolu iken "Daha fazla" GÖRÜNÜR ve tıklanabilir', async () => {
    const user = userEvent.setup()
    const onLoadMore = vi.fn()
    render(<Pagination nextCursor="abc" total={12} onLoadMore={onLoadMore} />)

    await user.click(screen.getByRole('button', { name: /Daha fazla/ }))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('toplam sayıyı gösterir', () => {
    render(<Pagination nextCursor={null} total={12} onLoadMore={vi.fn()} />)
    expect(screen.getByText(/12 kayıt/)).toBeInTheDocument()
  })

  it('yükleniyorken buton devre dışı (çift istek yok)', () => {
    render(<Pagination nextCursor="abc" total={12} loading onLoadMore={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Yükleniyor/ })).toBeDisabled()
  })

  it('tek kayıt varken "kayıt" tekil yazılır', () => {
    render(<Pagination nextCursor={null} total={1} onLoadMore={vi.fn()} />)
    expect(screen.getByText(/1 kayıt/)).toBeInTheDocument()
  })
})
