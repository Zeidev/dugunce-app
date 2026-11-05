import { useCallback, useState } from 'react'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import { Skeleton } from '../components/Skeleton'
import { formatDateTime } from './format'
import { useCursorList } from './useCursorList'
import type { AuditRow } from '../types'

/**
 * `Audit` — denetim kaydı, SALT OKUMA (spec §6.5, §9.1).
 *
 * Kolonlar brief tablosundan: `createdAt`, `action`, `actorType`,
 * `targetType`, `ip`.
 *
 * NEDEN `metadata` KOLON DEĞİL: JSONB nesnesi serbest şekilli; ham
 * basmak tabloyu okunamaz yapar (satır yüksekliği değişir, hücre
 * taşar). Plan değişikliğinin `from/to` bilgisi zaten `action` +
 * hedef kimliğiyle anlaşılır. İleride "detay" açılırı eklenebilir.
 */

/**
 * Aksiyon filtresi — spec §5.3'teki aksiyon adları.
 *
 * NEDEN SABİT LİSTE: backend serbest metin kabul ediyor (`?action=`),
 * ama operatörün aklında aksiyon ADI yok, İŞİ var ("kimin premium
 * açtığını görmek istiyorum"). Liste bu çeviriyi yapar.
 */
interface ActionFilter {
  label: string
  value: string | undefined
}

const ACTION_FILTERS: readonly ActionFilter[] = [
  { label: 'Tümü', value: undefined },
  { label: 'Plan değişikliği', value: 'WEDDING_PLAN_CHANGED' },
  { label: 'Giriş', value: 'ADMIN_LOGIN' },
  { label: 'Başarısız giriş', value: 'ADMIN_LOGIN_FAILED' },
  { label: 'Kullanıcı askıya alma', value: 'USER_SUSPENDED' },
  { label: 'Kullanıcı aktifleştirme', value: 'USER_ACTIVATED' },
]

const COLUMNS: Column<AuditRow>[] = [
  {
    key: 'createdAt',
    header: 'Zaman',
    render: (row) => formatDateTime(row.createdAt),
  },
  {
    key: 'action',
    header: 'Aksiyon',
    render: (row) => row.action,
  },
  {
    key: 'actorType',
    header: 'Aktör',
    // `actorType` ADMIN / USER / SYSTEM olabilir; `actorId` UUID'si
    // tabloyu doldurur ve operatöre bir şey söylemez. Tip yeterli.
    render: (row) => row.actorType,
  },
  {
    key: 'targetType',
    header: 'Hedef',
    // `null` → "—". Boş hücre bırakmak "alan eksik mi" dedirtir.
    render: (row) => row.targetType ?? '—',
  },
  {
    key: 'ip',
    header: 'IP',
    // `null` (eski kayıtlar / IP yok) → "—".
    render: (row) => row.ip ?? '—',
  },
]

export function Audit(): React.JSX.Element {
  const [action, setAction] = useState<string | undefined>(undefined)

  const load = useCallback(
    (cursor: string | undefined) => api.audit({ limit: 25, action, cursor }),
    [action],
  )

  const list = useCursorList(load, `action:${action ?? 'ALL'}`, 'Denetim kayıtları')

  return (
    <section>
      {/* Sayfa başlığı üst çubukta (`h1`) — burada tekrarlanmaz. */}
      <div className="toolbar">
        <div className="filter-group" role="group" aria-label="Aksiyon filtresi">
          {ACTION_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={action === filter.value ? 'filter is-active' : 'filter'}
              aria-pressed={action === filter.value}
              onClick={() => setAction(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {list.loading ? (
        <Skeleton rows={8} />
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
            action === undefined
              ? 'Henüz denetim kaydı yok.'
              : 'Bu aksiyona ait kayıt yok. Filtreyi değiştirmeyi deneyin.'
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
