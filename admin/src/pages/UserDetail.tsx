import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { Badge } from '../components/Badge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'
import { Toast } from '../components/Toast'
import { apiErrorMessage, listErrorMessage } from './errors'
import { formatDate, formatDateTime } from './format'
import type { UserDetail as UserDetailType, WeddingRow } from '../types'

/**
 * `UserDetail` — kullanıcı + düğünleri + askıya al/aktifleştir.
 *
 * `PATCH /users/:id` YALNIZ `{status}` kabul eder (backend gövdede tek
 * anahtar bekliyor, `INVALID_PATCH` 400). Bu yüzden `api.setUserStatus`
 * kullanılır; gövde elle kurulmaz.
 *
 * ASKIYA ALMA ONAY İSTER (spec §9.1 "yıkıcı/önemli eylemde onay
 * dialog'u"): kullanıcı askıya alınınca oturumu ölür ve davetiyesine
 * erişemez. Yanlışlıkla tıklamak gerçek bir zarar verir.
 *
 * SONUÇ SUNUCUDAN: yanıttaki `user` yazılır. Optimistic güncelleme
 * yapılsaydı istek başarısız olduğunda rozet "SUSPENDED" gösterip
 * yalan söylerdi.
 */

/** Kullanıcı durumları — backend `USER_STATUSES` ile aynı. */
const SUSPENDED = 'SUSPENDED'
const ACTIVE = 'ACTIVE'

const WEDDING_COLUMNS: Column<WeddingRow>[] = [
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
]

export function UserDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<UserDetailType | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /** Açık onay dialog'u — hedef durum. `null` ise kapalı. */
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (id === undefined) {
      setLoadError('Kullanıcı kimliği okunamadı.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      setDetail(await api.user(id))
    } catch (err) {
      setLoadError(listErrorMessage(err, 'Kullanıcı'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function confirmStatusChange(): Promise<void> {
    if (id === undefined || pendingStatus === null) return

    setSaving(true)
    try {
      // Yanıttaki `user` — optimistic DEĞİL.
      const updated = await api.setUserStatus(id, pendingStatus)
      setDetail((current) => (current === null ? current : { ...current, user: updated }))
      setNotice({
        kind: 'success',
        text:
          updated.status === SUSPENDED
            ? 'Kullanıcı askıya alındı.'
            : 'Kullanıcı yeniden aktifleştirildi.',
      })
      setPendingStatus(null)
    } catch (err) {
      setNotice({ kind: 'error', text: apiErrorMessage(err, 'Durum değiştirilemedi.') })
      setPendingStatus(null)
    } finally {
      setSaving(false)
    }
  }

  const closeNotice = useCallback((): void => {
    setNotice(null)
  }, [])

  if (loading) {
    return (
      <section>
        <h2 className="page-title">Kullanıcı</h2>
        <Skeleton rows={4} />
      </section>
    )
  }

  if (loadError !== null) {
    return (
      <section>
        <h2 className="page-title">Kullanıcı</h2>
        <div className="card" role="alert">
          <p className="form-error">{loadError}</p>
          <p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                void load()
              }}
            >
              Tekrar dene
            </button>
          </p>
        </div>
      </section>
    )
  }

  if (detail === null) {
    return (
      <section>
        <EmptyState title="Kullanıcı yüklenemedi" description="Sayfayı yenileyip tekrar deneyin." />
      </section>
    )
  }

  const { user, weddings } = detail
  const suspended = user.status === SUSPENDED
  const nextStatus = suspended ? ACTIVE : SUSPENDED
  // Eylem metni DURUMA göre: "Askıya al" / "Aktifleştir".
  const actionLabel = suspended ? 'Aktifleştir' : 'Askıya al'

  /*
    ERİŞİLEBİLİR AD ÇAKIŞMASI (tarayıcıda ÖLÇÜLDÜ): sayfadaki tetikleyici
    buton ile dialog'un onay butonu AYNI metni ("Askıya al") taşıyınca
    `getByRole('button', { name: 'Askıya al' })` iki eşleşme döndürüyor.
    Bu yalnız test sorunu değil: ekran okuyucu kullanıcısı Tab ile
    gezerken iki özdeş buton duyar ve hangisinin "onay" olduğunu
    bilemez. Bu yüzden onay butonu eylemi AÇIKÇA onaylar ("Evet, askıya
    al"), tetikleyici ise kısa kalır ("Askıya al").
  */
  const confirmLabel = suspended ? 'Evet, aktifleştir' : 'Evet, askıya al'

  return (
    <section>
      <nav className="breadcrumb" aria-label="Konum">
        <Link to="/users">Kullanıcılar</Link>
        <span aria-hidden="true">/</span>
        <span>{user.displayName}</span>
      </nav>

      <header className="detail-head">
        <div>
          <h2 className="page-title">{user.displayName}</h2>
          {/*
            E-posta AYRI SATIRDA ve kendi öğesinde: operatörün en sık
            kopyaladığı değer. Cümle içine gömmek (· ayırıcılarıyla)
            metni bölünmüş hâle getirir; kopyalarken ayırıcılar da
            gelir.
          */}
          <p className="detail-head__email">{user.email}</p>
          <p className="detail-head__meta">
            {user.weddingCount.toLocaleString('tr-TR')} düğün · Kayıt{' '}
            {formatDate(user.createdAt)}
          </p>
        </div>

        <div className="detail-head__actions">
          <Badge kind="status" value={user.status} />
          <button
            type="button"
            className={suspended ? 'btn btn--primary' : 'btn btn--danger'}
            onClick={() => setPendingStatus(nextStatus)}
            disabled={saving}
          >
            {actionLabel}
          </button>
        </div>
      </header>

      {notice !== null && (
        <Toast
          key={`${notice.kind}:${notice.text}`}
          kind={notice.kind}
          message={notice.text}
          onClose={closeNotice}
        />
      )}

      <h3 className="section-title">Düğünler</h3>
      <DataTable
        columns={WEDDING_COLUMNS}
        rows={weddings}
        rowKey={(row) => row.id}
        emptyTitle="Kayıt yok"
        emptyDescription="Bu kullanıcının henüz düğünü yok."
      />

      <div className="card detail-card">
        <h3 className="card__title">Hesap</h3>
        {/*
          Durum burada TEKRAR YAZILMAZ: rozet başlıkta duruyor. Aynı
          bilgiyi iki yerde göstermek, biri tazelenmediğinde çelişkili
          ekran üretir (WeddingDetail'de de aynı kural).
        */}
        <dl className="detail-list">
          <div>
            <dt>Kayıt tarihi</dt>
            <dd>{formatDateTime(user.createdAt)}</dd>
          </div>
          <div>
            <dt>Düğün sayısı</dt>
            <dd>{user.weddingCount.toLocaleString('tr-TR')}</dd>
          </div>
        </dl>
      </div>

      {pendingStatus !== null && (
        <ConfirmDialog
          title={pendingStatus === SUSPENDED ? 'Kullanıcıyı askıya al' : 'Kullanıcıyı aktifleştir'}
          description={
            pendingStatus === SUSPENDED
              ? `${user.displayName} askıya alınacak. Kullanıcı oturumu kapanır ve davetiyesine erişemez.`
              : `${user.displayName} yeniden aktifleştirilecek ve davetiyesine erişebilecek.`
          }
          confirmLabel={confirmLabel}
          cancelLabel="Vazgeç"
          busy={saving}
          onConfirm={() => {
            void confirmStatusChange()
          }}
          onCancel={() => setPendingStatus(null)}
        />
      )}
    </section>
  )
}
