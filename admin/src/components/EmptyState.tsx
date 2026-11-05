/**
 * `EmptyState` — boş liste / hata durumu (spec §9.1: "İkon + başlık +
 * açıklama").
 *
 * AYRIŞMA KURALI (spec §9.1): "Boş liste 'kayıt yok' der, hata
 * 'yüklenemedi + tekrar dene' der — ikisi KARIŞMAZ."
 *
 * NEDEN TEK BİLEŞEN: iki durum aynı görsel dili paylaşır (başlık +
 * açıklama + isteğe bağlı buton); ayrı bileşen yazmak ikisinin zamanla
 * farklı hizalanmasına yol açardı. Ayrım METİNDE ve `actionLabel`'ın
 * varlığında.
 */

interface EmptyStateProps {
  title: string
  /** Kullanıcıya ne yapacağını söyleyen cümle. */
  description?: string
  /** Buton metni — yalnız `onAction` ile birlikte anlamlı. */
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty-state">
      {/*
        İkon DEKORATİF: anlam metinde taşınıyor. `aria-hidden` olmadan
        ekran okuyucu "büyüteç" gibi anlamsız bir ad okur.
      */}
      <span className="empty-state__icon" aria-hidden="true">
        ◍
      </span>
      <p className="empty-state__title">{title}</p>
      {description !== undefined && <p className="empty-state__desc">{description}</p>}
      {/*
        Buton yalnız hem etiket hem eylem varsa çizilir: tıklanamayan
        bir "Tekrar dene" butonu göstermek, kullanıcıyı boşa uğraştırır.
      */}
      {actionLabel !== undefined && onAction !== undefined && (
        <button type="button" className="btn btn--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
