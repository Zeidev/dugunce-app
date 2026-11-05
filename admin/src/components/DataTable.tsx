import { EmptyState } from './EmptyState'

/**
 * `DataTable` — panelin ortak tablosu (spec §9.1: "Yapışkan başlık,
 * zebra yok, satır hover, sıralama oku, boş durum").
 *
 * NEDEN GENEL BİLEŞEN: dört sayfa (kullanıcı, düğün, üye, denetim)
 * aynı tablo davranışını istiyor. Her sayfada `<table>` yazmak,
 * yapışkan başlık ve boş durumun zamanla ayrışmasına yol açardı.
 *
 * SIRALAMA: spec "sıralama oku" istiyor. Ok yalnız görsel değil —
 * `aria-sort` ile ekran okuyucuya da bildirilir; aksi hâlde renk
 * körlüğü/ekran okuyucu kullanıcısı hangi kolona göre sıralı
 * olduğunu bilemez.
 *
 * SIRALAMA BURADA YAPILMAZ: veri sunucudan cursor ile geldiği için
 * sıralama sayfanın (veya backend'in) işi. Tablo yalnız gösterir ve
 * niyeti (`onSort`) yukarı iletir.
 */

export interface Column<T> {
  /** Kolon kimliği — sıralama anahtarı olarak da kullanılır. */
  key: string
  header: string
  render: (row: T) => React.ReactNode
  /** Sağa hizalanır (sayı kolonları). */
  numeric?: boolean
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: string
  direction: SortDirection
}

interface DataTableProps<T> {
  columns: readonly Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  sort?: SortState
  /** Verilirse başlıklar tıklanabilir buton olur. */
  onSort?: (key: string) => void
  /** Boş durum başlığı — varsayılan "Kayıt yok". */
  emptyTitle?: string
  emptyDescription?: string
}

/**
 * `aria-sort` değeri — `SortState` → ARIA sözlüğü.
 *
 * NEDEN `asc`/`desc` DOĞRUDAN YAZILMAZ: ARIA değerleri
 * `ascending`/`descending`. Yanlış yazmak ekran okuyucuda sessizce
 * yok sayılır (geçersiz değer) ve sıralama bilgisi kaybolur.
 */
function ariaSort(sort: SortState | undefined, key: string): 'ascending' | 'descending' | 'none' | undefined {
  if (sort === undefined) return undefined
  if (sort.key !== key) return 'none'
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}

/** Ok karakteri — `direction`'a göre. */
function sortArrow(sort: SortState | undefined, key: string): string {
  if (sort === undefined || sort.key !== key) return '↕'
  return sort.direction === 'asc' ? '▲' : '▼'
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  emptyTitle = 'Kayıt yok',
  emptyDescription,
}: DataTableProps<T>): React.JSX.Element {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => {
              const direction = ariaSort(sort, column.key)
              return (
                <th
                  key={column.key}
                  // `aria-sort` YALNIZ sıralanabilir kolonda yazılır;
                  // sıralanamayan kolona "none" koymak gereksiz gürültü.
                  {...(onSort !== undefined || sort !== undefined ? { 'aria-sort': direction } : {})}
                  className={column.numeric === true ? 'table__num' : undefined}
                >
                  {onSort === undefined ? (
                    column.header
                  ) : (
                    <button
                      type="button"
                      className="table__sort"
                      onClick={() => onSort(column.key)}
                    >
                      {column.header}
                      {/*
                        Ok `aria-hidden`: bilgi zaten `aria-sort` ile
                        iletiliyor. Ekran okuyucu "E-posta yukarı ok"
                        demesin.
                      */}
                      <span className="table__sort-arrow" aria-hidden="true">
                        {sortArrow(sort, column.key)}
                      </span>
                    </button>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              {/*
                Boş durum TABLO İÇİNDE: başlık satırı görünür kalır ve
                kullanıcı hangi alanların olduğunu görür. Tabloyu
                tamamen gizlemek "sayfa bozuk" izlenimi verirdi.
              */}
              <td className="table__empty" colSpan={columns.length}>
                <EmptyState title={emptyTitle} {...(emptyDescription !== undefined ? { description: emptyDescription } : {})} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.numeric === true ? 'table__num' : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
