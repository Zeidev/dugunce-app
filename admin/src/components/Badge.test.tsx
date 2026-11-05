import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

/**
 * `Badge` testleri — RENK KÖRLÜĞÜ SÖZLEŞMESİ.
 *
 * Spec §9.1: "`Badge` — `PREMIUM` altın, `FREE` gri, `ACTIVE` yeşil,
 * `SUSPENDED` kırmızı — **metin her zaman yazılır**, renk tek başına
 * anlatmaz."
 *
 * NEDEN BU TESTLER VAR: rozet tek başına renkle anlatılırsa renk körü
 * bir operatör `PREMIUM` ile `FREE`yi AYIRT EDEMEZ ve yanlış düğüne
 * premium açar. Bu bir estetik değil, işlev hatasıdır.
 */

describe('Badge', () => {
  it('PREMIUM metnini HER ZAMAN görünür yazar', () => {
    render(<Badge kind="plan" value="PREMIUM" />)
    expect(screen.getByText('PREMIUM')).toBeInTheDocument()
  })

  it('FREE metnini HER ZAMAN görünür yazar', () => {
    render(<Badge kind="plan" value="FREE" />)
    expect(screen.getByText('FREE')).toBeInTheDocument()
  })

  it('ACTIVE ve SUSPENDED metinleri görünür yazar', () => {
    render(
      <>
        <Badge kind="status" value="ACTIVE" />
        <Badge kind="status" value="SUSPENDED" />
      </>,
    )
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByText('SUSPENDED')).toBeInTheDocument()
  })

  it('PREMIUM ile FREE farklı sınıf taşır (renk ayrımı korunur)', () => {
    const { rerender } = render(<Badge kind="plan" value="PREMIUM" />)
    expect(screen.getByText('PREMIUM').className).toContain('badge--premium')

    rerender(<Badge kind="plan" value="FREE" />)
    expect(screen.getByText('FREE').className).toContain('badge--free')
  })

  it('bilinmeyen değeri UYDURMAZ, ham değeri gösterir', () => {
    // Backend yeni bir plan eklerse (ör. PRO) rozet sessizce boş
    // kalmamalı; operatör ne olduğunu okumalı.
    render(<Badge kind="plan" value="PRO" />)
    expect(screen.getByText('PRO')).toBeInTheDocument()
  })
})
