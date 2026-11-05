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
import type { UserRow } from '../types'

/**
 * `Users` — kullanıcı listesi + arama + sayfalama.
 *
 * Kolonlar brief tablosundan: `email`, `displayName`, `status`,
 * `weddingCount`, `createdAt`.
 *
 * ARAMA CURSOR'I SIFIRLAR: yeni sorgu yeni bir sonuç kümesidir;
 * önceki kümenin cursor'ını göndermek backend'de anlamsız (ve
 * muhtemelen boş) bir sayfa üretir. `useCursorList` bunu `queryKey`
 * değişimiyle yapar.
 */

const COLUMNS: Column<UserRow>[] = [
  {
    key: 'email',
    header: 'E-posta',
    // Satırın tamamı detaya götürür ama e-posta birincil tanımlayıcı
    // olduğu için bağlantı burada — operatörün ilk tıkladığı şey.
    render: (row) => <Link to={`/users/${row.id}`}>{row.email}</Link>,
  },
  {
    key: 'displayName',
    header: 'Ad',
    render: (row) => row.displayName,
  },
  {
    key: 'status',
    header: 'Durum',
    // Rozet METİN taşır (renk körlüğü) — `Badge` bunu garanti eder.
    render: (row) => <Badge kind="status" value={row.status} />,
  },
  {
    key: 'weddingCount',
    header: 'Düğün',
    render: (row) => row.weddingCount.toLocaleString('tr-TR'),
    numeric: true,
  },
  {
    key: 'createdAt',
    header: 'Kayıt',
    render: (row) => formatDate(row.createdAt),
  },
]

export function Users(): React.JSX.Element {
  const [query, setQuery] = useState('')

  /**
   * `load` KİMLİĞİ SABİT OLMALI.
   *
   * `useCursorList` `load`'u ref'te tutuyor, ama yine de `useCallback`
   * ile sınırlamak doğru: kapanış (closure) yalnız `query`'ye bağlı.
   * Bağımlılık listesine `query` yazmak, her tuş vuruşunda yeni bir
   * fonksiyon üretir — ref sayesinde effect tetiklenmez, istek de
   * atılmaz; istenen davranış bu.
   */
  const load = useCallback(
    (cursor: string | undefined) => api.users({ limit: 25, q: query, cursor }),
    [query],
  )

  /**
   * `queryKey` — liste kimliği.
   *
   * NEDEN `q:` ÖNEKİ: boş sorgu ile "q" harfi araması aynı anahtara
   * düşmesin. `JSON.stringify` de olurdu ama tek alan için gereksiz.
   */
  const list = useCursorList(load, `q:${query}`, 'Kullanıcılar')

  return (
    <section>
      {/*
        SAYFA BAŞLIĞI YOK: `Layout` üst çubuğu `h1` ile "Kullanıcılar"
        yazıyor. İkinci bir `h2` aynı metni tekrarlar.
      */}
      <div className="toolbar">
        <SearchInput
          label="Kullanıcı ara"
          value={query}
          onChange={setQuery}
          placeholder="E-posta veya ad"
        />
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
        /*
          BOŞ LİSTE ile HATA AYRI (spec §9.1). Burada "kayıt yok" der;
          hata yukarıdaki dalda "yüklenemedi" der.
        */
        <EmptyState
          title="Kayıt yok"
          description={
            query === ''
              ? 'Henüz kullanıcı yok.'
              : `"${query}" aramasına uygun kullanıcı bulunamadı.`
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
