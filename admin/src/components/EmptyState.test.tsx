import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'

/**
 * `EmptyState` + `Skeleton` testleri.
 *
 * NEDEN İKİSİ BİRLİKTE: spec §9.1 "Boş liste 'kayıt yok' der, hata
 * 'yüklenemedi + tekrar dene' der — ikisi KARIŞMAZ" ve "Skeleton —
 * yükleme sırasında kart/satır iskeleti, 'boş ekran' yok". Aynı ekranda
 * üç durum (yükleniyor / boş / hata) birbirine karışırsa operatör boş
 * listeyi "veri yok" sanıp yanlış karar verir.
 */

describe('EmptyState', () => {
  it('başlık ve açıklama gösterir', () => {
    render(<EmptyState title="Kayıt yok" description="Arama kriterlerini değiştirin." />)
    expect(screen.getByText('Kayıt yok')).toBeInTheDocument()
    expect(screen.getByText('Arama kriterlerini değiştirin.')).toBeInTheDocument()
  })

  it('aksiyon verilirse butonu çalışır', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyState title="Yüklenemedi" actionLabel="Tekrar dene" onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('Skeleton', () => {
  it('yükleme göstergesi olarak duyurulur', () => {
    render(<Skeleton />)
    // `role="status"` + `aria-busy`: ekran okuyucu "hâlâ yükleniyor" der.
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Yükleniyor…')
  })

  it('satır sayısı verilebilir (tablo iskeleti)', () => {
    render(<Skeleton rows={5} />)
    expect(document.querySelectorAll('.skeleton__row')).toHaveLength(5)
  })

  it('dekoratif çubuklar ekran okuyucudan gizlenir', () => {
    render(<Skeleton rows={2} />)
    // Görsel çubuklar anlamsız; yalnız tek bir metin duyurulmalı.
    const bars = document.querySelectorAll('.skeleton__bar')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) expect(bar).toHaveAttribute('aria-hidden', 'true')
  })
})
