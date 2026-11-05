import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { AuthProvider } from '../auth-context'
import type { Admin } from '../types'

/**
 * `Layout` testleri — DERLEME KİMLİĞİ.
 *
 * NEDEN: Cloudflare Pages, SPA'yı hiç derlemediği hâlde `/spa/` 200
 * dönüyordu (catch-all kök `index.html`e düşüyordu). "Deploy çalıştı mı?"
 * sorusunu yanıtlamanın hiçbir yolu yoktu: sayfa boş, HTTP 200, konsolda
 * hata yok. Panelin kendi derleme kimliğini göstermesi bu soruyu
 * GÖZLE yanıtlanabilir kılar.
 */

const ADMIN: Admin = {
  id: 'ad1',
  email: 'owner@t.local',
  displayName: 'Test Yönetici',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  lastLoginAt: null,
}

function renderLayout(signOut: () => Promise<void>): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider value={{ admin: ADMIN, signOut }}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<p>içerik</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Layout', () => {
  it('derleme kimliğini gösterir (deploy doğrulaması için)', () => {
    renderLayout(() => Promise.resolve())
    // `__BUILD_ID__` derleme sırasında gömülür; testte 'test'.
    // Görünür olmalı ki operatör "hangi sürüm canlıda" sorusunu
    // tarayıcıdan yanıtlayabilsin.
    expect(screen.getByText(/sürüm/i)).toBeInTheDocument()
  })

  it('menüde dört gezinme bağlantısı vardır', () => {
    renderLayout(() => Promise.resolve())
    const nav = screen.getByRole('navigation', { name: 'Ana menü' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Genel bakış' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kullanıcılar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Düğünler' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Denetim' })).toBeInTheDocument()
  })

  it('çıkış butonu AuthContext.signOut üzerinden gider', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(() => Promise.resolve())
    renderLayout(signOut)
    await user.click(screen.getByRole('button', { name: 'Çıkış' }))
    // NEDEN: `Layout` doğrudan `api.logout()` çağırıp `navigate('/login')`
    // yapsaydı guard `authenticated` kalır ve kullanıcı panele GERİ ATILIR
    // (Task 10'da tarayıcıda ölçüldü). Oturum durumunun tek sahibi guard;
    // çıkış oradan geçmeli.
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
