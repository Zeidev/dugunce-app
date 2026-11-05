import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WeddingDetail } from './WeddingDetail'
import { api, ApiError } from '../api'
import type { WeddingDetail as WeddingDetailType, WeddingRow } from '../types'

/**
 * `WeddingDetail` — PANELİN VARLIK SEBEBİ.
 *
 * Brief §1 ve §6: "Panelin tek gerçek işi premium açmak. `WeddingDetail`
 * sayfasındaki 'Planı değiştir' akışı çalışmazsa panelin hiçbir anlamı
 * yok." Bu yüzden bu dosya Task 11'in EN ÖNEMLİ testidir.
 *
 * SESSİZ HATA YASAK — test edilen dört davranış:
 *  1. Başarılıysa rozet GÜNCELLENİR ve yanıttaki `wedding` kullanılır
 *     (optimistic değil: sunucu farklı bir değer dönerse O görünür).
 *  2. `from === to` → "zaten bu planda" (nazik bilgi, HATA DEĞİL).
 *  3. 403 (CSRF) → "oturum yenilenmeli, tekrar giriş yapın".
 *  4. 401 → oturum düşme akışı (api katmanı `onSessionExpired` yayar;
 *     burada yalnız kullanıcıya gösterilen mesaj kontrol edilir).
 */

const WEDDING: WeddingRow = {
  id: 'w1',
  coupleNames: 'Ayşe & Mehmet',
  weddingDate: '2026-09-12T19:00:00.000Z',
  plan: 'FREE',
  guestCount: 120,
  memberCount: 2,
  createdAt: '2026-08-01T10:00:00.000Z',
}

const DETAIL: WeddingDetailType = {
  wedding: WEDDING,
  members: [
    {
      userId: 'u1',
      displayName: 'Ayşe Yılmaz',
      email: 'ayse@t.local',
      role: 'OWNER',
      joinedAt: '2026-08-01T10:00:00.000Z',
    },
    {
      userId: 'u2',
      displayName: 'Mehmet Demir',
      email: 'mehmet@t.local',
      role: 'PARTNER',
      joinedAt: '2026-08-02T10:00:00.000Z',
    },
  ],
  expenseCount: 7,
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/weddings/w1']}>
      <Routes>
        <Route path="/weddings/:id" element={<WeddingDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

let detailSpy: ReturnType<typeof vi.spyOn>
let setPlanSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  detailSpy = vi.spyOn(api, 'wedding').mockResolvedValue(DETAIL)
  setPlanSpy = vi.spyOn(api, 'setPlan')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WeddingDetail — yükleme ve içerik', () => {
  it('yüklenirken iskelet gösterir, sonra veriyi basar', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…')

    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })
    expect(screen.getByText('ayse@t.local')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('plan rozetini METİNLE gösterir (renk körlüğü)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })
    expect(screen.getByText('FREE')).toBeInTheDocument()
  })

  it('hata durumunda "yüklenemedi + tekrar dene" gösterir, boş liste DEMEZ', async () => {
    detailSpy.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Sunucu hatası'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('yüklenemedi')
    expect(screen.queryByText(/Kayıt yok/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})

describe('WeddingDetail — plan değiştirme (PANELİN VARLIK SEBEBİ)', () => {
  it('başarılı değişimde rozet GÜNCELLENİR — yanıttaki wedding kullanılır', async () => {
    const user = userEvent.setup()
    // SUNUCU farklı bir şey döner (memberCount 3): optimistic güncelleme
    // yapan bir uygulama 2 gösterip yalan söylerdi. Bu test tam olarak
    // "yanıttaki wedding kullanılmalı" kuralını çiviler.
    setPlanSpy.mockResolvedValueOnce({ ...WEDDING, plan: 'PREMIUM', memberCount: 3 })
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'PREMIUM yap' }))

    expect(setPlanSpy).toHaveBeenCalledWith('w1', 'PREMIUM')
    // Rozet DEĞİŞTİ.
    await waitFor(() => {
      expect(screen.getByText('PREMIUM')).toBeInTheDocument()
    })
    expect(screen.queryByText('FREE')).not.toBeInTheDocument()
    // Yanıttaki alan kullanıldı (optimistic değil): sunucu memberCount=3
    // dedi, ekranda 3 yazıyor — yerel kopya 2'de kalmadı.
    expect(screen.getByText(/3 üye/)).toBeInTheDocument()
    // Başarı geri bildirimi.
    expect(screen.getByRole('status')).toHaveTextContent('PREMIUM')
  })

  it('FREE planına geri döndürülebilir', async () => {
    const user = userEvent.setup()
    detailSpy.mockResolvedValue({ ...DETAIL, wedding: { ...WEDDING, plan: 'PREMIUM' } })
    setPlanSpy.mockResolvedValueOnce({ ...WEDDING, plan: 'FREE' })
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'FREE yap' }))

    await waitFor(() => {
      expect(screen.getByText('FREE')).toBeInTheDocument()
    })
  })

  it('from === to → "zaten bu planda" bilgisi, HATA DEĞİL', async () => {
    const user = userEvent.setup()
    // Backend kısa devre yapar ve audit YAZMAZ; panel bunu hata gibi
    // göstermemeli. `setPlan` yine çağrılır (panel "değiştir" dedi) ama
    // dönen plan aynıdır.
    setPlanSpy.mockResolvedValueOnce({ ...WEDDING, plan: 'FREE' })
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'PREMIUM yap' }))

    // "zaten bu planda" — ne `role="alert"` (hata) ne de başarı tonu.
    await waitFor(() => {
      expect(screen.getByText(/zaten bu planda/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('403 → "oturum yenilenmeli, tekrar giriş yapın" mesajı', async () => {
    const user = userEvent.setup()
    setPlanSpy.mockRejectedValueOnce(
      new ApiError(403, 'CSRF_INVALID', 'CSRF doğrulaması başarısız'),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'PREMIUM yap' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/tekrar giriş yapın/i)
    // Rozet DEĞİŞMEDİ: başarısız istekte plan güncellenmemeli.
    expect(screen.getByText('FREE')).toBeInTheDocument()
  })

  it('401 → oturum mesajı gösterir (guard yönlendirmeyi üstlenir)', async () => {
    const user = userEvent.setup()
    setPlanSpy.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Oturum gerekli'))
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'PREMIUM yap' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/oturum/i)
  })

  it('dialog Vazgeç ile kapanır ve istek ATILMAZ', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(setPlanSpy).not.toHaveBeenCalled()
  })

  it('404 (düğün silinmiş) → açıklayıcı mesaj', async () => {
    const user = userEvent.setup()
    setPlanSpy.mockRejectedValueOnce(
      new ApiError(404, 'WEDDING_NOT_FOUND', 'Düğün bulunamadı'),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })

    await user.click(screen.getByRole('button', { name: 'Planı değiştir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'PREMIUM yap' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/bulunamadı/i)
  })
})
