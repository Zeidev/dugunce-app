import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Users } from './Users'
import { api, ApiError } from '../api'
import type { Page, UserRow } from '../types'

/**
 * `Users` testleri — liste + arama + sayfalama.
 *
 * Brief §7 ve §8'in sayfa düzeyindeki karşılığı:
 *  - `nextCursor === null` iken "Daha fazla" GİZLENİR,
 *  - arama 300 ms debounce'lu, TEMİZLERKEN anında,
 *  - boş / hata / yükleniyor durumları KARIŞMAZ.
 */

const ROW: UserRow = {
  id: 'u1',
  email: 'ayse@t.local',
  displayName: 'Ayşe Yılmaz',
  status: 'ACTIVE',
  createdAt: '2026-08-01T10:00:00.000Z',
  weddingCount: 2,
}

const PAGE_ONE: Page<UserRow> = { items: [ROW], nextCursor: 'cursor-2' }
const PAGE_TWO: Page<UserRow> = {
  items: [
    {
      id: 'u2',
      email: 'mehmet@t.local',
      displayName: 'Mehmet Demir',
      status: 'SUSPENDED',
      createdAt: '2026-08-02T10:00:00.000Z',
      weddingCount: 0,
    },
  ],
  nextCursor: null,
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <Users />
    </MemoryRouter>,
  )
}

let usersSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  usersSpy = vi.spyOn(api, 'users').mockResolvedValue(PAGE_ONE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Users — liste', () => {
  it('yüklenirken iskelet gösterir', () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…')
  })

  it('satırları ve rozet metnini gösterir', async () => {
    renderPage()
    await screen.findByText('ayse@t.local')
    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
    // Durum METİNLE (renk körlüğü).
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('nextCursor dolu iken "Daha fazla" görünür', async () => {
    renderPage()
    await screen.findByText('ayse@t.local')
    expect(screen.getByRole('button', { name: /Daha fazla/ })).toBeInTheDocument()
  })

  it('"Daha fazla" sonraki sayfayı EKLER ve cursor null olunca butonu GİZLER', async () => {
    const user = userEvent.setup()
    usersSpy.mockResolvedValueOnce(PAGE_ONE).mockResolvedValueOnce(PAGE_TWO)
    renderPage()
    await screen.findByText('ayse@t.local')

    await user.click(screen.getByRole('button', { name: /Daha fazla/ }))

    await screen.findByText('mehmet@t.local')
    // İlk sayfa KAYBOLMAZ (cursor sayfalaması ekler, değiştirmez).
    expect(screen.getByText('ayse@t.local')).toBeInTheDocument()
    // Son sayfa: buton gizli.
    expect(screen.queryByRole('button', { name: /Daha fazla/ })).not.toBeInTheDocument()
  })

  it('boş liste "kayıt yok" der', async () => {
    usersSpy.mockResolvedValue({ items: [], nextCursor: null })
    renderPage()
    expect(await screen.findByText(/Kayıt yok/)).toBeInTheDocument()
  })

  it('hata durumunda "yüklenemedi + tekrar dene" gösterir, boş liste DEMEZ', async () => {
    usersSpy.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Sunucu hatası'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/yüklenemedi/i)
    expect(screen.queryByText(/Kayıt yok/)).not.toBeInTheDocument()
  })
})

describe('Users — arama', () => {
  it('300 ms sonra sunucuya q ile gider', async () => {
    vi.useFakeTimers()
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderPage()
      await vi.advanceTimersByTimeAsync(0)
      await screen.findByText('ayse@t.local')

      await user.type(screen.getByLabelText('Kullanıcı ara'), 'ayşe')
      // Henüz gitmedi.
      expect(usersSpy).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(300)
      await waitFor(() => {
        expect(usersSpy).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ayşe' }))
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('arama TEMİZLENİNCE cursor SIFIRLANIR (eski sayfa karışmaz)', async () => {
    const user = userEvent.setup()
    usersSpy.mockResolvedValue(PAGE_ONE)
    renderPage()
    await screen.findByText('ayse@t.local')

    await user.click(screen.getByRole('button', { name: /Daha fazla/ }))
    await user.type(screen.getByLabelText('Kullanıcı ara'), 'a')
    await waitFor(() => {
      // Yeni arama ilk sayfadan başlar: cursor GÖNDERİLMEZ.
      expect(usersSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'a', cursor: undefined }),
      )
    })
  })
})
