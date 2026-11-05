import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { api, ApiError } from '../api'
import type { Overview } from '../types'

/**
 * `Dashboard` testleri — spec §9.1: "4 `StatCard` + 'Son işlemler'
 * tablosu (20 satır)".
 *
 * NEDEN: panelin açılış ekranı. Sayaçlar yanlış etiketle gösterilirse
 * operatör "kullanıcı" sanıp düğün sayısını okur ve raporlama bozulur.
 * Ayrıca üç durum (yükleniyor / veri / hata) KARIŞMAMALI.
 */

const OVERVIEW: Overview = {
  users: { total: 42, newLast7Days: 5 },
  weddings: { total: 38, active: 36, premium: 3, free: 35 },
  guests: { total: 620, attending: 410, declined: 90, pending: 120 },
  recentAudit: [
    {
      id: 'a1',
      actorType: 'ADMIN',
      actorId: 'ad1',
      action: 'WEDDING_PLAN_CHANGED',
      targetType: 'WEDDING',
      targetId: 'w1',
      metadata: { from: 'FREE', to: 'PREMIUM' },
      ip: '127.0.0.1',
      createdAt: '2026-11-05T19:15:00.000Z',
    },
  ],
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
}

let overviewSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  overviewSpy = vi.spyOn(api, 'overview').mockResolvedValue(OVERVIEW)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Dashboard', () => {
  it('yüklenirken iskelet gösterir', () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…')
  })

  it('dört StatCard render eder — GERÇEK sayılarla', async () => {
    renderPage()
    await screen.findByText('42')

    // Dört kart, dört ayrı etiket.
    expect(screen.getByText('Kullanıcı')).toBeInTheDocument()
    expect(screen.getByText('Düğün')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('Davetli')).toBeInTheDocument()

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // 620 → binlik ayırıcı yok, ama 1250 olsa "1.250" olurdu.
    expect(screen.getByText('620')).toBeInTheDocument()
  })

  it('kullanıcı kartında son 7 gün deltasını gösterir', async () => {
    renderPage()
    await screen.findByText('42')
    expect(screen.getByText(/\+5/)).toBeInTheDocument()
  })

  it('premium kartında ORAN gösterir', async () => {
    renderPage()
    await screen.findByText('3')
    // 3 / 38 = %7,9 — tam sayıya yuvarlanırsa %8 olurdu ama tek haneli
    // oranlar %0 görünmesin diye bir ondalık tutuluyor.
    expect(screen.getByText(/%7[.,]9/)).toBeInTheDocument()
  })

  it('düğün kartında aktif sayısını gösterir', async () => {
    renderPage()
    await screen.findByText('38')
    expect(screen.getByText(/36 aktif/)).toBeInTheDocument()
  })

  it('son işlemler tablosunu render eder', async () => {
    renderPage()
    await screen.findByText('Son işlemler')
    expect(screen.getByText('WEDDING_PLAN_CHANGED')).toBeInTheDocument()
    expect(screen.getByText('WEDDING')).toBeInTheDocument()
  })

  it('denetim kaydı boşsa "kayıt yok" der', async () => {
    overviewSpy.mockResolvedValue({ ...OVERVIEW, recentAudit: [] })
    renderPage()
    await screen.findByText('Son işlemler')
    expect(screen.getByText(/Kayıt yok/)).toBeInTheDocument()
  })

  it('hata durumunda "tekrar dene" sunar, sıfır sayaç GÖSTERMEZ', async () => {
    overviewSpy.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Sunucu hatası'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/yüklenemedi/i)
    // Sıfır göstermek "hiç kullanıcı yok" dedirtir — yanlış bilgi.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('tekrar dene yeniden istek atar', async () => {
    overviewSpy.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Sunucu hatası'))
    renderPage()
    await screen.findByRole('alert')

    overviewSpy.mockResolvedValueOnce(OVERVIEW)
    screen.getByRole('button', { name: 'Tekrar dene' }).click()
    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(overviewSpy).toHaveBeenCalledTimes(2)
  })
})
