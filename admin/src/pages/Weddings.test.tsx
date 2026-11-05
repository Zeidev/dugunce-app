import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Weddings } from './Weddings'
import { api, ApiError } from '../api'
import type { Page, WeddingRow } from '../types'

/**
 * `Weddings` testleri — liste + plan filtresi + arama + sayfalama.
 *
 * Spec §9.1: "Plan filtresi (Tümü/Free/Premium) + tablo (çift, tarih,
 * plan, davetli, oluşturma). Plan rozeti TIKLANABİLİR DEĞİL —
 * değişiklik detayda."
 *
 * NEDEN ROZET TIKLANAMAZ: yanlış satırda tek tıkla plan değiştirmek
 * çok kolay bir hata olurdu; değişiklik onay dialog'lu detay sayfasında.
 */

const PREMIUM_ROW: WeddingRow = {
  id: 'w1',
  coupleNames: 'Ayşe & Mehmet',
  weddingDate: '2026-09-12T19:00:00.000Z',
  plan: 'PREMIUM',
  guestCount: 120,
  memberCount: 2,
  createdAt: '2026-08-01T10:00:00.000Z',
}

const FREE_ROW: WeddingRow = {
  id: 'w2',
  coupleNames: 'Zeynep & Can',
  weddingDate: '2026-10-03T18:00:00.000Z',
  plan: 'FREE',
  guestCount: 80,
  memberCount: 2,
  createdAt: '2026-08-02T10:00:00.000Z',
}

const PAGE: Page<WeddingRow> = { items: [PREMIUM_ROW, FREE_ROW], nextCursor: null }

function renderPage(): void {
  render(
    <MemoryRouter>
      <Weddings />
    </MemoryRouter>,
  )
}

let weddingsSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  weddingsSpy = vi.spyOn(api, 'weddings').mockResolvedValue(PAGE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Weddings — liste', () => {
  it('satırları plan rozetiyle gösterir', async () => {
    renderPage()
    await screen.findByText('Ayşe & Mehmet')
    expect(screen.getByText('PREMIUM')).toBeInTheDocument()
    expect(screen.getByText('FREE')).toBeInTheDocument()
    expect(screen.getByText('Zeynep & Can')).toBeInTheDocument()
  })

  it('nextCursor null ise "Daha fazla" GİZLİ', async () => {
    renderPage()
    await screen.findByText('Ayşe & Mehmet')
    expect(screen.queryByRole('button', { name: /Daha fazla/ })).not.toBeInTheDocument()
  })

  it('detay bağlantısı satırdan verilir', async () => {
    renderPage()
    await screen.findByText('Ayşe & Mehmet')
    const link = screen.getByRole('link', { name: 'Ayşe & Mehmet' })
    expect(link).toHaveAttribute('href', '/weddings/w1')
  })

  it('boş liste "kayıt yok" der', async () => {
    weddingsSpy.mockResolvedValue({ items: [], nextCursor: null })
    renderPage()
    expect(await screen.findByText(/Kayıt yok/)).toBeInTheDocument()
  })

  it('hata durumunda "yüklenemedi + tekrar dene"', async () => {
    weddingsSpy.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Sunucu hatası'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/yüklenemedi/i)
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})

describe('Weddings — plan filtresi', () => {
  it('PREMIUM filtresi sunucuya plan=PREMIUM gönderir', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ayşe & Mehmet')

    await user.click(screen.getByRole('button', { name: 'Premium' }))

    await waitFor(() => {
      expect(weddingsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ plan: 'PREMIUM' }))
    })
  })

  it('"Tümü" plan parametresini GÖNDERMEZ (boş string değil)', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ayşe & Mehmet')

    await user.click(screen.getByRole('button', { name: 'Premium' }))
    await waitFor(() => {
      expect(weddingsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ plan: 'PREMIUM' }))
    })

    await user.click(screen.getByRole('button', { name: 'Tümü' }))
    await waitFor(() => {
      // `plan: ''` göndermek backend'de `INVALID_PLAN` 400 üretir.
      expect(weddingsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ plan: undefined }))
    })
  })

  it('filtre değişince cursor SIFIRLANIR', async () => {
    const user = userEvent.setup()
    weddingsSpy.mockResolvedValue({ items: [PREMIUM_ROW], nextCursor: 'c2' })
    renderPage()
    await screen.findByText('Ayşe & Mehmet')

    await user.click(screen.getByRole('button', { name: /Daha fazla/ }))
    await user.click(screen.getByRole('button', { name: 'Free' }))

    await waitFor(() => {
      expect(weddingsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ plan: 'FREE', cursor: undefined }),
      )
    })
  })
})
