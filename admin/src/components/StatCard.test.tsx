import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

/**
 * `StatCard` testleri — spec §9.1: büyük sayı (serif 32px), etiket
 * (uppercase 11px `--muted`), alt satır delta.
 *
 * NEDEN: dashboard'ın tek işi sayı göstermek. Etiket ile sayı
 * karışırsa ("Premium" 3 mü, 3 "Kullanıcı" mı) operatör yanlış okur.
 */

describe('StatCard', () => {
  it('etiketi ve sayıyı ayrı ayrı gösterir', () => {
    render(<StatCard label="Kullanıcı" value={42} delta="+5 / 7g" />)
    expect(screen.getByText('Kullanıcı')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('+5 / 7g')).toBeInTheDocument()
  })

  it('delta verilmezse alt satır boş kalmaz, gizlenir', () => {
    render(<StatCard label="Davetli" value={620} />)
    expect(screen.getByText('620')).toBeInTheDocument()
    // Görünmeyen boş bir satır yerine hiç satır olmaması gerekir.
    expect(document.querySelector('.stat__delta')).toBeNull()
  })

  it('sayıyı tr-TR binlik ayırıcıyla yazar', () => {
    render(<StatCard label="Davetli" value={12500} />)
    // 12500 → "12.500": operatör 5 hane saymak zorunda kalmasın.
    expect(screen.getByText('12.500')).toBeInTheDocument()
  })

  it('sıfırı tire ile GİZLEMEZ — gerçek sıfır görünür', () => {
    // "—" göstermek sıfır ile "veri yok"u karıştırırdı; dashboard'da
    // gerçek sıfır operatöre bilgi verir.
    render(<StatCard label="Premium" value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
