import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'
import { StatCard } from '../components/StatCard'
import { listErrorMessage } from './errors'
import { formatDateTime, formatPercent } from './format'
import type { AuditRow, Overview } from '../types'

/**
 * `Dashboard` — açılış ekranı (spec §9.1: "4 StatCard + Son işlemler
 * tablosu (20 satır)").
 *
 * KART İÇERİKLERİ backend sözleşmesinden BİREBİR:
 *  - Kullanıcı: `users.total`, delta `+newLast7Days / 7g`
 *  - Düğün: `weddings.total`, delta `active aktif`
 *  - Premium: `weddings.premium`, delta ORAN (`premium / total`)
 *  - Davetli: `guests.total`
 *
 * DİKKAT: `guests` bir NESNE (`GuestStats`), brief tablosunda tek satır
 * görünüyordu. `guests.total` kullanılır; alt satırda katılım dağılımı
 * verilir — operatörün en çok sorduğu sayı "kaç kişi gelecek".
 */

const AUDIT_COLUMNS: Column<AuditRow>[] = [
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
    render: (row) => row.actorType,
  },
  {
    key: 'targetType',
    header: 'Hedef',
    render: (row) => row.targetType ?? '—',
  },
]

export function Dashboard(): React.JSX.Element {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setOverview(await api.overview())
    } catch (err) {
      /*
        HATA DURUMUNDA SIFIR GÖSTERİLMEZ. `overview` `null` kalır ve
        hiçbir kart çizilmez. Sıfır çizmek "hiç kullanıcı yok" dedirtir;
        bu, sunucu 500 döndüğünde operatörün paniklemesine yol açar.
      */
      setOverview(null)
      setError(listErrorMessage(err, 'Genel bakış'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /*
    SAYFA BAŞLIĞI BURADA YAZILMAZ: `Layout` üst çubuğu zaten `h1` ile
    "Genel bakış" yazıyor. Aynı metni ikinci kez `h2` olarak basmak
    ekran okuyucuda "Genel bakış, Genel bakış" dedirtir ve görsel
    olarak da tekrar görünür.
  */
  if (loading) {
    return (
      <section>
        <Skeleton rows={4} />
      </section>
    )
  }

  if (error !== null || overview === null) {
    return (
      <section>
        <div className="card" role="alert">
          <p className="form-error">{error ?? 'Genel bakış yüklenemedi.'}</p>
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

  const { users, weddings, guests } = overview

  return (
    <section>
      <div className="stat-grid">
        <StatCard
          label="Kullanıcı"
          value={users.total}
          delta={`+${users.newLast7Days.toLocaleString('tr-TR')} / 7g`}
        />
        <StatCard
          label="Düğün"
          value={weddings.total}
          delta={`${weddings.active.toLocaleString('tr-TR')} aktif`}
        />
        {/*
          Premium kartında delta ORAN: mutlak sayı zaten büyük yazıda.
          Oran, "satışlar iyi mi" sorusunun tek cevabı.
        */}
        <StatCard
          label="Premium"
          value={weddings.premium}
          delta={`${formatPercent(weddings.premium, weddings.total)} oran`}
        />
        <StatCard
          label="Davetli"
          value={guests.total}
          delta={`${guests.attending.toLocaleString('tr-TR')} katılıyor`}
        />
      </div>

      {/* Üst çubuk `h1`; bölüm başlığı `h2` — seviye atlanmaz. */}
      <h2 className="section-title">Son işlemler</h2>
      {overview.recentAudit.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description="Henüz denetim kaydı yok. Panelde yapılan her işlem burada listelenir."
        />
      ) : (
        <DataTable
          columns={AUDIT_COLUMNS}
          rows={overview.recentAudit}
          rowKey={(row) => row.id}
          emptyTitle="Kayıt yok"
        />
      )}
    </section>
  )
}
