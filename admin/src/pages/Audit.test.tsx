import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Audit } from './Audit'
import { api, ApiError } from '../api'
import type { AuditRow, Page } from '../types'

/**
 * `Audit` testleri — SALT OKUMA denetim kaydı + aksiyon filtresi.
 *
 * Brief tablosu: `createdAt`, `action`, `actorType`, `targetType`, `ip`.
 * Spec §9.1: "aksiyon filtresi + tablo (zaman, aktör, aksiyon, hedef, IP)".
 *
 * NEDEN `ip` gösterilir: bir hesabın ele geçirilip geçirilmediğini
 * anlamanın ilk yolu farklı IP'lerden gelen oturumlardır. `metadata`
 * yazılır ama JSON'u HAM basmak okunamaz — kısa tutulur.
 */

const ROW: AuditRow = {
  id: 'a1',
  actorType: 'ADMIN',
  actorId: 'ad1',
  action: 'WEDDING_PLAN_CHANGED',
  targetType: 'WEDDING',
  targetId: 'w1',
  metadata: { from: 'FREE', to: 'PREMIUM' },
  ip: '203.0.113.7',
  createdAt: '2026-11-05T19:15:00.000Z',
}

const PAGE: Page<AuditRow> = { items: [ROW], nextCursor: null }

function renderPage(): void {
  render(
    <MemoryRouter>
      <Audit />
    </MemoryRouter>,
  )
}

let auditSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  auditSpy = vi.spyOn(api, 'audit').mockResolvedValue(PAGE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Audit', () => {
  it('kayıtları gösterir — aksiyon, aktör tipi, hedef tipi, IP', async () => {
    renderPage()
    await screen.findByText('WEDDING_PLAN_CHANGED')
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getByText('WEDDING')).toBeInTheDocument()
    expect(screen.getByText('203.0.113.7')).toBeInTheDocument()
  })

  it('yüklenirken iskelet gösterir', () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor…')
  })

  it('ip null ise "—" yazar, boş hücre BIRAKMAZ', async () => {
    auditSpy.mockResolvedValue({ items: [{ ...ROW, ip: null }], nextCursor: null })
    renderPage()
    await screen.findByText('WEDDING_PLAN_CHANGED')
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('aksiyon filtresi sunucuya action gönderir', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('WEDDING_PLAN_CHANGED')

    await user.click(screen.getByRole('button', { name: 'Plan değişikliği' }))

    await waitFor(() => {
      expect(auditSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'WEDDING_PLAN_CHANGED' }),
      )
    })
  })

  it('"Tümü" aksiyon parametresini GÖNDERMEZ', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('WEDDING_PLAN_CHANGED')

    await user.click(screen.getByRole('button', { name: 'Plan değişikliği' }))
    await waitFor(() => {
      expect(auditSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'WEDDING_PLAN_CHANGED' }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Tümü' }))
    await waitFor(() => {
      expect(auditSpy).toHaveBeenLastCalledWith(expect.objectContaining({ action: undefined }))
    })
  })

  it('nextCursor null ise "Daha fazla" GİZLİ', async () => {
    renderPage()
    await screen.findByText('WEDDING_PLAN_CHANGED')
    expect(screen.queryByRole('button', { name: /Daha fazla/ })).not.toBeInTheDocument()
  })

  it('boş liste "kayıt yok" der', async () => {
    auditSpy.mockResolvedValue({ items: [], nextCursor: null })
    renderPage()
    expect(await screen.findByText(/Kayıt yok/)).toBeInTheDocument()
  })

  it('hata durumunda "yüklenemedi + tekrar dene"', async () => {
    auditSpy.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Sunucu hatası'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/yüklenemedi/i)
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
