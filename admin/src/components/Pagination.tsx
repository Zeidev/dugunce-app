/**
 * `Pagination` — imleç (cursor) tabanlı "Daha fazla" + toplam sayı
 * (spec §9.1).
 *
 * KURAL (brief §7): `nextCursor === null` iken "Daha fazla" GİZLENİR.
 *
 * NEDEN `=== null` ve NEDEN `!nextCursor` DEĞİL: `types.ts`'teki
 * `Page<T>.nextCursor` alanı `string | null`. `undefined` bu sözleşmede
 * "alan gelmedi" demektir — sessiz bir ihlal. `!nextCursor` yazmak
 * `undefined`'ı da gizler ve ihlali MASKELLER; `=== null` ise yalnız
 * gerçek "son sayfa" durumunda gizler. Ölçülebilir fark: backend alanı
 * yeniden adlandırırsa `!nextCursor` butonu sonsuza kadar kapatır ve
 * "Daha fazla kayıt var mı?" sorusu cevapsız kalır.
 */

interface PaginationProps {
  /** `Page.nextCursor` — son sayfada `null`. */
  nextCursor: string | null
  /** Şu ana kadar yüklenen kayıt sayısı. */
  total: number
  /** İstek sürüyor mu — buton kilitlenir (çift istek yok). */
  loading?: boolean
  onLoadMore: () => void
}

export function Pagination({
  nextCursor,
  total,
  loading = false,
  onLoadMore,
}: PaginationProps): React.JSX.Element {
  // "1 kayıt" / "12 kayıt": Türkçede çoğul eki isimle birlikte
  // kullanılmaz (sayı + tekil isim). Ayrı bir çoğul dalı yazmak
  // gereksiz; tek fark edilebilir durum 0.
  const totalLabel = total === 0 ? 'Kayıt yok' : `${total.toLocaleString('tr-TR')} kayıt`

  return (
    <div className="pagination">
      <span className="pagination__total">{totalLabel}</span>

      {nextCursor !== null && (
        <button
          type="button"
          className="btn"
          onClick={onLoadMore}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Yükleniyor…' : 'Daha fazla'}
        </button>
      )}
    </div>
  )
}
