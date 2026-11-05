import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserDetail } from './UserDetail'
import { api, ApiError } from '../api'
import type { UserDetail as UserDetailType } from '../types'

/**
 * `UserDetail` testleri — kullanıcı + düğünleri + askıya al/aktifleştir.
 *
 * `PATCH /users/:id` YALNIZ `{status}` kabul eder (başka anahtar 400).
 * Bu yüzden panel `api.setUserStatus(id, status)` kullanır — gövdeyi
 * elle kurmaz.
 *
 * KRİTİK DAVRANIŞ: askıya alma YIKICI bir eylemdir; onay dialog'u
 * ister (spec §9.1 "Yıkıcı/önemli eylemde onay dialog'u") ve sonuç
 * SUNUCUDAN gelen `user` ile yazılır.
 */

const DETAIL: UserDetailType = {
  user: {
    id: 'u1',
    email: 'ayse@t.local',
    displayName: 'Ayşe Yılmaz',
    status: 'ACTIVE',
    createdAt: '2026-08-01T10:00:00.000Z',
    weddingCount: 1,
  },
  weddings: [
    {
      id: 'w1',
      coupleNames: 'Ayşe & Mehmet',
      weddingDate: '2026-09-12T19:00:00.000Z',
      plan: 'PREMIUM',
      guestCount: 120,
      memberCount: 2,
      createdAt: '2026-08-01T10:00:00.000Z',
    },
  ],
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/users/u1']}>
      <Routes>
        <Route path="/users/:id" element={<UserDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

let userSpy: ReturnType<typeof vi.spyOn>
let statusSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  userSpy = vi.spyOn(api, 'user').mockResolvedValue(DETAIL)
  statusSpy = vi.spyOn(api, 'setUserStatus')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UserDetail', () => {
  it('kullanıcıyı ve düğünlerini gösterir', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })
    expect(screen.getByText('ayse@t.local')).toBeInTheDocument()
    expect(screen.getByText('Ayşe & Mehmet')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('yüklenirken iskelet gösterir', () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…')
  })

  it('404 → açıklayıcı hata + tekrar dene', async () => {
    userSpy.mockRejectedValueOnce(new ApiError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/bulunamadı/i)
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('askıya al onay İSTER ve onaylanınca PATCH atar', async () => {
    const user = userEvent.setup()
    statusSpy.mockResolvedValueOnce({ ...DETAIL.user, status: 'SUSPENDED' })
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })

    await user.click(screen.getByRole('button', { name: 'Askıya al' }))
    const dialog = screen.getByRole('dialog')
    // Onay metni eylemi ADIYLA söyler.
    expect(within(dialog).getByText(/askıya alınacak/i)).toBeInTheDocument()

    // Onay butonu eylemi AÇIKÇA onaylar: tetikleyici "Askıya al" ile
    // aynı ada sahip olsaydı ekran okuyucu iki özdeş buton duyardı
    // (tarayıcıda ölçüldü).
    await user.click(within(dialog).getByRole('button', { name: 'Evet, askıya al' }))
    expect(statusSpy).toHaveBeenCalledWith('u1', 'SUSPENDED')
  })

  it('askıya alma sonrası rozet SUNUCU yanıtıyla SUSPENDED olur', async () => {
    const user = userEvent.setup()
    statusSpy.mockResolvedValueOnce({ ...DETAIL.user, status: 'SUSPENDED' })
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })

    await user.click(screen.getByRole('button', { name: 'Askıya al' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Evet, askıya al' }),
    )

    expect(await screen.findByText('SUSPENDED')).toBeInTheDocument()
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
  })

  it('askıya alınmış kullanıcıda buton "Aktifleştir" olur', async () => {
    const user = userEvent.setup()
    userSpy.mockResolvedValue({ ...DETAIL, user: { ...DETAIL.user, status: 'SUSPENDED' } })
    statusSpy.mockResolvedValueOnce({ ...DETAIL.user, status: 'ACTIVE' })
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })

    await user.click(screen.getByRole('button', { name: 'Aktifleştir' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Evet, aktifleştir' }),
    )
    expect(statusSpy).toHaveBeenCalledWith('u1', 'ACTIVE')
    expect(await screen.findByText('ACTIVE')).toBeInTheDocument()
  })

  it('dialog açıkken eylem adı TEK butonda geçer (erişilebilir ad çakışması yok)', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })

    await user.click(screen.getByRole('button', { name: 'Askıya al' }))

    /*
      REGRESYON (tarayıcıda ÖLÇÜLDÜ): ilk sürümde dialog onay butonu da
      "Askıya al" yazıyordu. O hâlde `getByRole('button', { name: 'Askıya
      al' })` İKİ eşleşme döndürüyordu — yani ekran okuyucu kullanıcısı
      Tab ile gezerken iki özdeş buton duyuyor ve hangisinin onay
      olduğunu bilemiyordu. Bu test o durumu çiviliyor.
    */
    expect(screen.getAllByRole('button', { name: 'Askıya al' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Evet, askıya al' })).toBeInTheDocument()
  })

  it('Vazgeç istek ATMADAN kapatır', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })

    await user.click(screen.getByRole('button', { name: 'Askıya al' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('403 → "tekrar giriş yapın" mesajı, rozet DEĞİŞMEZ', async () => {
    const user = userEvent.setup()
    statusSpy.mockRejectedValueOnce(new ApiError(403, 'CSRF_INVALID', 'CSRF doğrulaması başarısız'))
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })

    await user.click(screen.getByRole('button', { name: 'Askıya al' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Evet, askıya al' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/tekrar giriş yapın/i)
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })
})
