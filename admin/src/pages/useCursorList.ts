import { useCallback, useEffect, useRef, useState } from 'react'
import type { Page } from '../types'
import { listErrorMessage } from './errors'

/**
 * İmleç (cursor) tabanlı liste durumu — `Users`, `Weddings`, `Audit`
 * sayfalarının ORTAK yükleyicisi.
 *
 * NEDEN ORTAK HOOK: üç sayfa da aynı altı durumu yaşıyor
 * (ilk yükleme / yeniden yükleme / daha fazla / hata / boş / dolu).
 * Her sayfada elle yazmak, birinde "Daha fazla"nın cursor'ı
 * sıfırlaması, diğerinde iki isteğin yarışması gibi farklılıklar
 * üretirdi — ve bu farklar testte değil ÜRETİMDE görünür.
 *
 * ÜÇ SESSİZ TUZAK burada kapatılıyor:
 *
 * 1. YARIŞ (race): kullanıcı hızlıca filtre değiştirirse iki istek
 *    uçuşta olur. Geç dönen ESKİ yanıt yeni listeyi EZERSE ekranda
 *    yanlış filtre sonucu kalır. Her istek bir sıra numarası alır;
 *    yalnız EN SON isteğin yanıtı yazılır.
 *
 * 2. `nextCursor === null` sözleşmesi: hook `Page<T>` alanını
 *    OLDUĞU GİBİ taşır, `?? ''` gibi dönüşüm YAPMAZ. Butonun
 *    gizlenmesi `=== null` kontrolüne dayanıyor.
 *
 * 3. Sorgu/filtre değişiminde LİSTE SIFIRLANIR. Eklemek yerine
 *    sıfırlamak şart: "ayşe" aramasından "mehmet"e geçerken eski
 *    satırlar ekranda kalırsa operatör iki farklı sorgunun sonucunu
 *    tek liste sanır.
 */

export interface CursorList<T> {
  items: T[]
  /** Son sayfada `null` — "Daha fazla" butonu buna bakar. */
  nextCursor: string | null
  /** İlk/sıfırlayıcı yükleme sürüyor (iskelet gösterilir). */
  loading: boolean
  /** "Daha fazla" sürüyor (liste kalır, buton kilitlenir). */
  loadingMore: boolean
  /** Yükleme hatası — dolu listede de görünebilir. */
  error: string | null
  /** Sıfırdan yükle (tekrar dene / filtre değişimi). */
  reload: () => void
  /** Sonraki sayfayı EKLE. */
  loadMore: () => void
}

/**
 * @param load      Sayfa yükleyici — cursor `undefined` ise ilk sayfa.
 * @param queryKey  Sorguyu temsil eden metin. Değişince liste sıfırlanır.
 *                  (q + filtre birlikte; sayfa bunu üretir.)
 * @param resource  Hata metninde kullanılan kaynak adı ("Kullanıcılar").
 */
export function useCursorList<T>(
  load: (cursor: string | undefined) => Promise<Page<T>>,
  queryKey: string,
  resource: string,
): CursorList<T> {
  const [items, setItems] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * En son `load` fonksiyonu.
   *
   * NEDEN REF: sayfalar `load`'u inline `useCallback` ile üretiyor ve
   * her render'da yeni kimlik alabiliyor. `useEffect` bağımlılığına
   * koymak sonsuz döngü riski taşır (yükle → setState → yeni load →
   * yükle…). Ref ile effect YALNIZ `queryKey` değişiminde çalışır.
   */
  const loadRef = useRef(load)
  loadRef.current = load

  /**
   * İstek sıra numarası — yarış koruması.
   *
   * Her yeni istek sayacı artırır ve kendi numarasını saklar. Yanıt
   * geldiğinde numara güncel değilse YAZILMAZ (bayat yanıt).
   */
  const requestIdRef = useRef(0)

  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback((): void => {
    setReloadToken((token) => token + 1)
  }, [])

  // queryKey veya reloadToken değişince ilk sayfayı yükle.
  useEffect(() => {
    const id = requestIdRef.current + 1
    requestIdRef.current = id

    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const page = await loadRef.current(undefined)
        // Bayat yanıt: bu arada yeni bir istek başladı.
        if (requestIdRef.current !== id) return
        setItems(page.items)
        setNextCursor(page.nextCursor)
      } catch (err) {
        if (requestIdRef.current !== id) return
        // Liste TEMİZLENİR: yarı yüklenmiş eski satırları hatayla
        // birlikte göstermek, "bunlar güncel mi?" sorusunu doğurur.
        setItems([])
        setNextCursor(null)
        setError(listErrorMessage(err, resource))
      } finally {
        if (requestIdRef.current === id) setLoading(false)
      }
    })()
    // `load` bilinçli olarak BAĞIMLILIK DEĞİL (yukarıdaki ref notu).
  }, [queryKey, reloadToken, resource])

  const loadMore = useCallback((): void => {
    // `null` ise sayfa YOK — istek atılmaz. Buton zaten gizli, bu
    // ikinci savunma hattı (programatik çağrıya karşı).
    if (nextCursor === null || loadingMore || loading) return

    const id = requestIdRef.current + 1
    requestIdRef.current = id
    setLoadingMore(true)
    setError(null)

    void (async () => {
      try {
        const page = await loadRef.current(nextCursor)
        if (requestIdRef.current !== id) return
        // EKLE — cursor sayfalaması önceki satırları korur.
        setItems((current) => [...current, ...page.items])
        setNextCursor(page.nextCursor)
      } catch (err) {
        if (requestIdRef.current !== id) return
        // Yüklenmiş satırlar KORUNUR: "Daha fazla" başarısız oldu diye
        // ekrandaki 50 kaydı silmek, kullanıcıyı başa döndürür.
        setError(listErrorMessage(err, resource))
      } finally {
        if (requestIdRef.current === id) setLoadingMore(false)
      }
    })()
  }, [nextCursor, loadingMore, loading, resource])

  return { items, nextCursor, loading, loadingMore, error, reload, loadMore }
}

