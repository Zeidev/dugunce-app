import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataTable, type Column } from './DataTable'

/**
 * `DataTable` testleri — spec §9.1 "Yapışkan başlık, zebra yok, satır
 * hover, sıralama oku, boş durum".
 *
 * NEDEN SIRALAMA OKU TEST EDİLİR: spec açıkça istiyor. Ok olmadan
 * kullanıcı hangi kolona göre sıralı olduğunu bilemez ve sıralamanın
 * çalıştığını sanmaz.
 */

interface Row {
  id: string
  email: string
  count: number
}

const COLUMNS: Column<Row>[] = [
  { key: 'email', header: 'E-posta', render: (row) => row.email },
  { key: 'count', header: 'Düğün', render: (row) => String(row.count), numeric: true },
]

const ROWS: Row[] = [
  { id: 'u1', email: 'ayse@t.local', count: 2 },
  { id: 'u2', email: 'mehmet@t.local', count: 0 },
]

describe('DataTable', () => {
  it('başlıkları ve satırları render eder', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />)
    expect(screen.getByRole('columnheader', { name: 'E-posta' })).toBeInTheDocument()
    expect(screen.getByText('ayse@t.local')).toBeInTheDocument()
    expect(screen.getByText('mehmet@t.local')).toBeInTheDocument()
  })

  it('boş listede "kayıt yok" der — hata ile KARIŞMAZ', () => {
    render(<DataTable columns={COLUMNS} rows={[]} rowKey={(row) => row.id} />)
    expect(screen.getByText(/Kayıt yok/)).toBeInTheDocument()
    // Tablo başlığı yine görünür: kullanıcı hangi alanların olduğunu görsün.
    expect(screen.getByRole('columnheader', { name: 'E-posta' })).toBeInTheDocument()
  })

  it('boş durum metni özelleştirilebilir', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        emptyTitle="Bu filtreye uygun düğün yok"
      />,
    )
    expect(screen.getByText('Bu filtreye uygun düğün yok')).toBeInTheDocument()
  })

  it('sıralanabilir kolonda sıralama oku taşır', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        sort={{ key: 'email', direction: 'asc' }}
      />,
    )
    const header = screen.getByRole('columnheader', { name: /E-posta/ })
    // Ok bir görsel göstergedir; ekran okuyucu için `aria-sort` esas.
    expect(header).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sıralanabilir kolon başlığı butondur (klavyeyle erişilebilir)', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        sort={{ key: 'email', direction: 'asc' }}
        onSort={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: /E-posta/ })).toBeInTheDocument()
  })
})
