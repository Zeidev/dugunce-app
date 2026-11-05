import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import { SearchInput } from '../components/SearchInput'
import { Skeleton } from '../components/Skeleton'
import { formatDate } from './format'
import { useCursorList } from './useCursorList'
import type { WeddingRow } from '../types'

/**
 * `Weddings` — düğün listesi + plan filtresi + arama.
 *
 * Spec §9.1: "Plan filtresi (Tümü/Free/Premium) + tablo (çift, tarih,
 * plan, davetli, oluşturma). Plan rozeti TIKLANABİLİR DEĞİL —
 * değişiklik detayda."
 *
 * NEDEN ROZET TIKLANAMAZ: listede yanlış satıra tıklayıp plan
 * değiştirmek çok kolay bir hata olurdu ve geri alınması audit
 * gerektirir. Değişiklik, onay dialog'u olan detay sayfasında yapılır.
 */

/**
 * Plan filtresi seçenekleri.
 *
 * `value: undefined` = "Tümü". NEDEN BOŞ STRING DEĞİL: backend
 * `?plan=` boş değerini "filtre yok" saysa da `parsePlanFilter`
 * yalnız `''` ve `undefined` durumunu atlıyor; boş string göndermek
 * `buildQuery`'de zaten atlanıyor. `undefined` niyeti açıkça taşır ve
 * testte `plan: undefined` olarak doğrulanabilir.
 */
interface PlanFilter {
  label: string
  value: 'FREE' | 'PREMIUM' | undefined
}

const PLAN_FILTERS: readonly PlanFilter[] = [
  { label: 'Tümü', value: undefined },
  { label: 'Free', value: 'FREE' },
  { label: 'Premium', value: 'PREMIUM' },
]

const COLUMNS: Column<WeddingRow>[] = [
  {
    key: 'coupleNames',
    header: 'Çift',
    render: (row) => <Link to={`/weddings/${row.id}`}>{row.coupleNames}</Link>,
  },
  {
    key: 'weddingDate',
    header: 'Tarih',
    render: (row) => formatDate(row.weddingDate),
  },
  {
    key: 'plan',
    header: 'Plan',
    render: (row) => <Badge kind="plan" value={row.plan} />,
  },
  {
    key: 'guestCount',
    header: 'Davetli',
    render: (row) => row.guestCount.toLocaleString('tr-TR'),
    numeric: true,
  },
  {
    key: 'memberCount',
    header: 'Üye',
    render: (row) => row.memberCount.toLocaleString('tr-TR'),
    numeric: true,
  },
  {
    key: 'createdAt',
    header: 'Oluşturma',
    render: (row) => formatDate(row.createdAt),
  },
]

export function Weddings(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState<'FREE' | 'PREMIUM' | undefined>(undefined)

  const load = useCallback(
    (cursor: string | undefined) => api.weddings({ limit: 25, plan, q: query, cursor }),
    [plan, query],
  )

  // Filtre + sorgu birlikte liste kimliğini belirler: ikisinden biri
  // değişince liste SIFIRLANIR (cursor taşınmaz).
  const list = useCursorList(load, `plan:${plan ?? 'ALL'}|q:${query}`, 'Düğünler')

  return (
    <section>
      {/* Sayfa başlığı üst çubukta (`h1`) — burada tekrarlanmaz. */}
      <div className="toolbar">
        <SearchInput
          label="Düğün ara"
          value={query}
          onChange={setQuery}
          placeholder="Çift adı"
        />

        {/*
          Filtre grubu — `role="group"` + `aria-pressed`: ekran okuyucu
          hangi filtrenin SEÇİLİ olduğunu duyar. Yalnız renk/kenarlık
          ile seçim göstermek renk körü kullanıcıya bilgi vermez.
        */}
        <div className="filter-group" role="group" aria-label="Plan filtresi">
          {PLAN_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={plan === filter.value ? 'filter is-active' : 'filter'}
              aria-pressed={plan === filter.value}
              onClick={() => setPlan(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {list.loading ? (
        <Skeleton rows={6} />
      ) : list.error !== null ? (
        <div className="card" role="alert">
          <p className="form-error">{list.error}</p>
          <p>
            <button type="button" className="btn btn--primary" onClick={list.reload}>
              Tekrar dene
            </button>
          </p>
        </div>
      ) : list.items.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description={
            query !== '' || plan !== undefined
              ? 'Bu filtreye uygun düğün yok. Filtreyi değiştirmeyi deneyin.'
              : 'Henüz düğün oluşturulmamış.'
          }
        />
      ) : (
        <>
          <DataTable columns={COLUMNS} rows={list.items} rowKey={(row) => row.id} />
          <Pagination
            nextCursor={list.nextCursor}
            total={list.items.length}
            loading={list.loadingMore}
            onLoadMore={list.loadMore}
          />
        </>
      )}
    </section>
  )
}
