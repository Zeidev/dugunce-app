/**
 * `Skeleton` — yükleme iskeleti (spec §9.1: "yükleme sırasında kart/satır
 * iskeleti — 'boş ekran' yok").
 *
 * NEDEN GEREKLİ: boş ekran ile "veri yok" ayırt edilemez. Yükleme
 * sırasında boş tablo göstermek operatöre "hiç kayıt yok" dedirtir ve
 * yanlış karar verdirir (ör. aynı düğünü ikinci kez oluşturmaya çalışır).
 *
 * ERİŞİLEBİLİRLİK: görsel çubuklar `aria-hidden`; tek bir `role="status"`
 * + `aria-busy="true"` metni duyurulur. Her çubuğu ayrı duyurmak ekran
 * okuyucuyu "Yükleniyor" ile boğardı.
 */

interface SkeletonProps {
  /** Kaç satır iskelet çizilecek (tablo/liste için). */
  rows?: number
}

export function Skeleton({ rows = 3 }: SkeletonProps): React.JSX.Element {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      {/*
        Metin görünür: yalnız görsel çubuk bırakmak, gözle gören
        kullanıcıya da ne olduğunu söylemez (yavaş bağlantıda iskelet
        "bozuk sayfa" gibi görünür).
      */}
      <span className="skeleton__label">Yükleniyor…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton__row" key={index}>
          <span className="skeleton__bar" aria-hidden="true" />
          <span className="skeleton__bar skeleton__bar--short" aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}
