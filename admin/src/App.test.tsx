import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PanelRoutes } from './App'
import { api } from './api'
import type { Admin } from './types'

/**
 * ROTA TABLOSU — DERİN BAĞLANTI.
 *
 * Brief §9: "`/spa/weddings/<uuid>` doğrudan açıldığında çalışmalı
 * (yenilemede 404 yok)."
 *
 * NEDEN BU TEST: derin bağlantı hatası yalnız GERÇEK tarayıcıda
 * yenileme yapınca görünür. `check-admin.mjs` yalnız `basename="/spa"`
 * varlığını kontrol ediyor; ROTA TABLOSUNDA `weddings/:id` eksik
 * olursa script yeşil kalır ama sayfa 404 verir. Task 10'da tam bu
 * sınıf bir hata tarayıcıda bulunmuştu.
 *
 * `PanelRoutes` doğrudan çiziliyor (AuthGate taklit EDİLMİYOR): sınanan
 * şey gerçek rota tablosu + gerçek `Layout` + gerçek sayfa.
 */

const ADMIN: Admin = {
  id: 'ad1',
  email: 'owner@t.local',
  displayName: 'Test Yönetici',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  lastLoginAt: null,
}

const WEDDING = {
  id: 'w1',
  coupleNames: 'Ayşe & Mehmet',
  weddingDate: '2026-09-12T19:00:00.000Z',
  plan: 'FREE',
  guestCount: 120,
  memberCount: 2,
  createdAt: '2026-08-01T10:00:00.000Z',
}

const USER = {
  id: 'u1',
  email: 'ayse@t.local',
  displayName: 'Ayşe Yılmaz',
  status: 'ACTIVE',
  createdAt: '2026-08-01T10:00:00.000Z',
  weddingCount: 1,
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PanelRoutes admin={ADMIN} signOut={() => Promise.resolve()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.spyOn(api, 'overview').mockResolvedValue({
    users: { total: 1, newLast7Days: 1 },
    weddings: { total: 1, active: 1, premium: 0, free: 1 },
    guests: { total: 10, attending: 5, declined: 2, pending: 3 },
    recentAudit: [],
  })
  vi.spyOn(api, 'users').mockResolvedValue({ items: [USER], nextCursor: null })
  vi.spyOn(api, 'user').mockResolvedValue({ user: USER, weddings: [WEDDING] })
  vi.spyOn(api, 'weddings').mockResolvedValue({ items: [WEDDING], nextCursor: null })
  vi.spyOn(api, 'wedding').mockResolvedValue({ wedding: WEDDING, members: [], expenseCount: 3 })
  vi.spyOn(api, 'audit').mockResolvedValue({ items: [], nextCursor: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PanelRoutes — derin bağlantı', () => {
  it('/weddings/w1 düğün detayını çizer (404 yok)', async () => {
    renderAt('/weddings/w1')
    expect(await screen.findByRole('heading', { name: 'Ayşe & Mehmet' })).toBeInTheDocument()
    // "Planı değiştir" — sayfanın varlık sebebi burada olmalı.
    expect(screen.getByRole('button', { name: 'Planı değiştir' })).toBeInTheDocument()
  })

  it('/users/u1 kullanıcı detayını çizer', async () => {
    renderAt('/users/u1')
    expect(await screen.findByRole('heading', { name: 'Ayşe Yılmaz' })).toBeInTheDocument()
  })

  it('/weddings listeyi çizer', async () => {
    renderAt('/weddings')
    expect(await screen.findByRole('heading', { name: 'Düğünler' })).toBeInTheDocument()
  })

  it('/users listeyi çizer', async () => {
    renderAt('/users')
    expect(await screen.findByRole('heading', { name: 'Kullanıcılar' })).toBeInTheDocument()
  })

  it('/audit denetim sayfasını çizer', async () => {
    renderAt('/audit')
    expect(await screen.findByRole('heading', { name: 'Denetim' })).toBeInTheDocument()
  })

  it('/ dashboard çizer', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Genel bakış' })).toBeInTheDocument()
  })

  it('bilinmeyen yol genel bakışa döner (boş ekran yok)', async () => {
    renderAt('/boyle-bir-sayfa-yok')
    expect(await screen.findByRole('heading', { name: 'Genel bakış' })).toBeInTheDocument()
  })

  it('menüde dört gezinme bağlantısı vardır', async () => {
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Ana menü' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Genel bakış' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kullanıcılar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Düğünler' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Denetim' })).toBeInTheDocument()
  })
})
