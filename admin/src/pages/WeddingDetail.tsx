import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Badge } from '../components/Badge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'
import { Toast } from '../components/Toast'
import type { WeddingDetail as WeddingDetailType, WeddingMemberRow, WeddingRow } from '../types'
import { formatDateTime, formatDate } from './format'

/**
 * `WeddingDetail` — PANELİN VARLIK SEBEBİ.
 *
 * Panelin tek gerçek işi premium açmak. Bu sayfa çalışmazsa panelin
 * hiçbir anlamı yok (brief §1). Bu yüzden:
 *
 *  - "Planı değiştir" butonu birincil eylemdir,
 *  - yanıt beklenirken buton kilitlenir,
 *  - SONUÇ SUNUCUDAN gelen `wedding` ile yazılır.
 *
 * SESSİZ HATA YASAK (brief §6) — dört ayrı dal:
 *
 *  1. BAŞARILI → rozet yanıttaki `wedding.plan` ile güncellenir.
 *     Optimistic güncelleme YOK: istek başarısız olursa rozet yalan
 *     söylerdi ve operatör "premium açıldı" sanıp müşteriye öyle derdi.
 *     Yanıttaki tüm satır kullanılır (üye/masraf sayıları da tazelenir).
 *
 *  2. `from === to` → backend kısa devre yapar ve AUDIT YAZMAZ. Panel
 *     bunu HATA gibi göstermez; "zaten bu planda" der. Hata göstermek
 *     operatöre "bir şey ters gitti" dedirtir ve gereksiz tekrar
 *     denemeye yol açar.
 *
 *  3. 403 (CSRF) → "oturum yenilenmeli, tekrar giriş yapın". Oturum
 *     GEÇERLİ, yalnız yazma reddedildi; çıkışa atmak kullanıcıyı
 *     boşuna dışarıda bırakırdı.
 *
 *  4. 401 → oturum düştü. `api.ts` bu durumda `onSessionExpired`
 *     yayar ve guard `/login`e yönlendirir; burada yalnız kullanıcıya
 *     ne olduğunu söyleyen mesaj bırakılır.
 */

/** Plan seçenekleri — backend `WEDDING_PLANS` ile aynı. */
const PLANS = ['FREE', 'PREMIUM'] as const
type Plan = (typeof PLANS)[number]

/**
 * Hata → kullanıcıya gösterilecek mesaj.
 *
 * NEDEN TEK FONKSİYON: aynı eşleme sayfanın iki yerinde (yükleme ve
 * plan değiştirme) gerekiyor; kopyalamak birinde güncellenip diğerinde
 * unutulmasına yol açardı.
 */
function planErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      // CSRF: oturum duruyor ama yazma reddedildi. "Çıkış yap" demek
      // yanlış yönlendirme olurdu; token tazelemek için yeniden giriş
      // gerekiyor (yeni oturum = yeni token).
      return 'Oturum doğrulaması geçersiz. Lütfen tekrar giriş yapın.'
    }
    if (err.status === 401) {
      return 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.'
    }
    if (err.status === 404) {
      return 'Düğün bulunamadı. Silinmiş olabilir.'
    }
    if (err.status === 400) {
      return `Plan değiştirilemedi: ${err.message}`
    }
    return err.message
  }
  return 'Plan değiştirilemedi. Bağlantınızı kontrol edip tekrar deneyin.'
}

const MEMBER_COLUMNS: Column<WeddingMemberRow>[] = [
  {
    key: 'displayName',
    header: 'Üye',
    render: (row) => row.displayName,
  },
  {
    key: 'email',
    header: 'E-posta',
    render: (row) => row.email,
  },
  {
    key: 'role',
    header: 'Rol',
    render: (row) => row.role,
  },
  {
    key: 'joinedAt',
    header: 'Katıldı',
    render: (row) => formatDate(row.joinedAt),
  },
]

export function WeddingDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<WeddingDetailType | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /** Açık onay dialog'unun hedef planı — `null` ise dialog kapalı. */
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * Bildirim — `kind: 'info'` "zaten bu planda" gibi nötr durumlar için.
   *
   * NEDEN ÜÇÜNCÜ TÜR: başarı (`status`) ile hata (`alert`) arasında
   * bir de "bir şey değişmedi" durumu var. Onu başarı gibi göstermek
   * yanlış (bir şey değişmedi), hata gibi göstermek de yanlış (bir şey
   * bozulmadı).
   */
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  )

  const load = useCallback(async (): Promise<void> => {
    if (id === undefined) {
      setLoadError('Düğün kimliği okunamadı.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      setDetail(await api.wedding(id))
    } catch (err) {
      // 404 / 401 / 5xx ayrımı: hepsi "yüklenemedi" der ama neden
      // farklı. `planErrorMessage` aynı eşlemeyi kullanır.
      setLoadError(
        err instanceof ApiError && err.status === 401
          ? 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.'
          : `Düğün yüklenemedi. ${err instanceof ApiError ? err.message : ''}`.trim(),
      )
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Onaylandı — istek atılır.
   *
   * NEDEN DIALOG KAPANMIYOR: istek sürerken dialog açık kalır ve
   * butonlar kilitlidir. Kapatıp arka planda çalıştırmak, kullanıcının
   * sonucu görmeden başka bir şeye tıklamasına ve iki isteğin
   * yarışmasına yol açardı.
   */
  async function confirmPlanChange(): Promise<void> {
    if (id === undefined || pendingPlan === null) return

    const previous = detail?.wedding.plan
    const target = pendingPlan

    setSaving(true)
    try {
      const updated: WeddingRow = await api.setPlan(id, target)

      /*
        YANITTAN yaz — optimistic değil. Sunucu farklı bir plan
        döndürürse (ör. iş kuralı engelledi) ekranda GERÇEK olan görünür.
        Detayın geri kalanı (üyeler, masraf sayısı) korunur; `setPlan`
        yalnız `wedding` döner.
      */
      setDetail((current) => (current === null ? current : { ...current, wedding: updated }))

      /*
        `from === to`: sunucu kısa devre yaptı, audit yazmadı, hiçbir
        şey değişmedi. Bu HATA DEĞİL — nazik bir bilgi.
      */
      if (previous === updated.plan) {
        setNotice({ kind: 'info', text: `Düğün zaten bu planda (${updated.plan}).` })
      } else {
        setNotice({ kind: 'success', text: `Plan ${updated.plan} olarak güncellendi.` })
      }
      setPendingPlan(null)
    } catch (err) {
      setNotice({ kind: 'error', text: planErrorMessage(err) })
      setPendingPlan(null)
    } finally {
      setSaving(false)
    }
  }

  /** Bildirimi kapat — `Toast` bunu `useEffect` bağımlılığı olarak kullanır. */
  const closeNotice = useCallback((): void => {
    setNotice(null)
  }, [])

  // --- Yükleniyor -------------------------------------------------------
  if (loading) {
    return (
      <section>
        <h2 className="page-title">Düğün</h2>
        <Skeleton rows={4} />
      </section>
    )
  }

  // --- Yükleme hatası (boş liste DEĞİL) --------------------------------
  if (loadError !== null) {
    return (
      <section>
        <h2 className="page-title">Düğün</h2>
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
    // Savunmacı: `loading === false` ve hata yok ama veri de yok.
    // Sessiz beyaz ekran yerine açık bir mesaj.
    return (
      <section>
        <EmptyState title="Düğün yüklenemedi" description="Sayfayı yenileyip tekrar deneyin." />
      </section>
    )
  }

  const { wedding, members, expenseCount } = detail
  const nextPlan: Plan = wedding.plan === 'PREMIUM' ? 'FREE' : 'PREMIUM'

  return (
    <section>
      <nav className="breadcrumb" aria-label="Konum">
        <Link to="/weddings">Düğünler</Link>
        <span aria-hidden="true">/</span>
        <span>{wedding.coupleNames}</span>
      </nav>

      <header className="detail-head">
        <div>
          <h2 className="page-title">{wedding.coupleNames}</h2>
          <p className="detail-head__meta">
            {formatDate(wedding.weddingDate)} · {wedding.guestCount} davetli · {wedding.memberCount}{' '}
            üye · {expenseCount} masraf
          </p>
        </div>

        <div className="detail-head__actions">
          {/*
            PLAN ROZETİ — metin her zaman yazılır (renk körlüğü).
            `key={wedding.plan}` GEREKLİ DEĞİL: React metni zaten
            günceller; yalnız animasyon isteseydik gerekirdi.
          */}
          <Badge kind="plan" value={wedding.plan} />

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setPendingPlan(nextPlan)}
            // Kaydetme sürerken ikinci dialog açılmasın.
            disabled={saving}
          >
            Planı değiştir
          </button>
        </div>
      </header>

      {notice !== null && (
        <Toast
          // `key`: yeni bildirim geldiğinde sayaç sıfırlanır. Anahtar
          // olmadan React aynı bileşeni korur, 4 sn'lik zamanlayıcı eski
          // bildirimden devam eder ve yeni mesaj erken kapanır.
          key={`${notice.kind}:${notice.text}`}
          kind={notice.kind === 'info' ? 'success' : notice.kind}
          message={notice.text}
          onClose={closeNotice}
        />
      )}

      <div className="card detail-card">
        <h3 className="card__title">Düğün bilgileri</h3>
        {/*
          Plan burada TEKRAR YAZILMAZ: rozet zaten başlıkta duruyor.
          Aynı bilgiyi iki yerde göstermek, biri güncellenmediğinde
          (ör. yalnız başlık tazelenirse) ÇELİŞKİLİ ekran üretir —
          operatör hangisine inanacağını bilemez.
        */}
        <dl className="detail-list">
          <div>
            <dt>Düğün tarihi</dt>
            <dd>{formatDateTime(wedding.weddingDate)}</dd>
          </div>
          <div>
            <dt>Davetli</dt>
            <dd>{wedding.guestCount.toLocaleString('tr-TR')}</dd>
          </div>
          <div>
            <dt>Masraf</dt>
            <dd>{expenseCount.toLocaleString('tr-TR')}</dd>
          </div>
          <div>
            <dt>Oluşturma</dt>
            <dd>{formatDateTime(wedding.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <h3 className="section-title">Üyeler</h3>
      <DataTable
        columns={MEMBER_COLUMNS}
        rows={members}
        rowKey={(row) => row.userId}
        emptyTitle="Üye yok"
        emptyDescription="Bu düğüne henüz kimse katılmamış."
      />

      {pendingPlan !== null && (
        <ConfirmDialog
          title="Planı değiştir"
          description={`${wedding.coupleNames} düğünü ${wedding.plan} planından ${pendingPlan} planına geçirilecek. Bu işlem denetim kaydına yazılır.`}
          confirmLabel={`${pendingPlan} yap`}
          cancelLabel="Vazgeç"
          busy={saving}
          onConfirm={() => {
            void confirmPlanChange()
          }}
          onCancel={() => setPendingPlan(null)}
        />
      )}
    </section>
  )
}
