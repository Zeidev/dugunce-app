import { useEffect, useId, useRef, useState } from 'react'

/**
 * `SearchInput` — 300 ms debounce'lu arama (spec §9.1: "300 ms debounce,
 * `⌘K`/`Ctrl+K` odak").
 *
 * İKİ KURAL (brief §8):
 *
 * 1. Yazarken 300 ms BEKLENİR. Her tuş vuruşunda istek atmak, "ayşe"
 *    yazarken 4 istek üretir; sunucu ve hız sınırı boşa yorulur, ayrıca
 *    yanıtlar sırasız dönerse liste eski sonuçla kalır.
 *
 * 2. TEMİZLERKEN BEKLENMEZ. Boş sorgu "filtreyi kaldır" demektir;
 *    geciktirmenin faydası yok, zararı var: operatör silme sonrası
 *    300 ms boyunca eski filtrelenmiş listeyi görür ve silmenin
 *    işlemediğini sanar.
 *
 * NEDEN KONTROLLÜ (`value` prop'u): sorguyu sayfa tutuyor; sayfa
 * sayfalamayı sıfırlayıp isteği kendisi atıyor. Bileşen içinde tutmak
 * iki kaynak (bileşen + sayfa) ve senkron hatası üretirdi.
 */

interface SearchInputProps {
  /** Görünür etiket — `aria-label` yerine gerçek `<label>`. */
  label: string
  value: string
  /** Debounce sonrası (veya anında temizlemede) çağrılır. */
  onChange: (value: string) => void
  placeholder?: string
}

/** Debounce süresi — spec §9.1. Testte sabit olarak da kullanılır. */
export const SEARCH_DEBOUNCE_MS = 300

export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
}: SearchInputProps): React.JSX.Element {
  const inputId = useId()

  /**
   * Yerel taslak — kullanıcının yazdığı anki metin.
   *
   * NEDEN AYRI: `value` yalnız debounce sonrası güncelleniyor; doğrudan
   * `value`'yu gösterseydik kullanıcı yazdığı harfi 300 ms sonra
   * görürdü (input "donuk" hissi verir).
   */
  const [draft, setDraft] = useState(value)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Dışarıdan gelen değer değişirse (ör. "Temizle" başka yerden) taslak
  // hizalanır. `draft`'ı bağımlılığa KOYMUYORUZ: konsaydı her tuş
  // vuruşunda effect çalışır ve taslağı geri yazardı.
  useEffect(() => {
    setDraft(value)
  }, [value])

  // Sökülürken bekleyen zamanlayıcıyı temizle: aksi hâlde sökülmüş
  // bileşenin `onChange`'i sonradan çalışır ve sayfa "hayalet" bir
  // istek atar (testte ve StrictMode'da görülür).
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  function schedule(next: string): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      onChange(next)
    }, SEARCH_DEBOUNCE_MS)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value
    setDraft(next)

    // BOŞ SORGU → BEKLEMEDEN gönder. Bekleyen zamanlayıcı iptal edilir;
    // aksi hâlde 300 ms sonra eski (boş olmayan) değer geri gelirdi.
    if (next === '') {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      onChange('')
      return
    }

    schedule(next)
  }

  function handleClear(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setDraft('')
    onChange('')
    inputRef.current?.focus()
  }

  /**
   * `⌘K` / `Ctrl+K` — spec §9.1 klavye kuralı.
   *
   * NEDEN `document` üzerinde: kısayol sayfanın herhangi bir yerinden
   * çalışmalı. Yalnız input üzerinde dinlemek, kullanıcı tabloda
   * gezinirken kısayolu işe yaramaz yapardı.
   *
   * NEDEN `preventDefault`: tarayıcıda `Ctrl+K` bazı tarayıcılarda
   * adres çubuğu aramasını açar; panelin arama alanına odaklanması
   * gerekiyor.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="search">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="search__box">
        <input
          className="field__input search__input"
          id={inputId}
          ref={inputRef}
          type="search"
          value={draft}
          onChange={handleChange}
          placeholder={placeholder}
          // `search` tipi tarayıcının kendi "x" butonunu gösterir; bizim
          // butonumuzla ÇAKIŞIR ve iki temizleme düğmesi görünür. CSS'te
          // gizlenir (`.search__input::-webkit-search-cancel-button`).
          autoComplete="off"
          spellCheck={false}
        />
        {draft !== '' && (
          <button
            type="button"
            className="search__clear"
            onClick={handleClear}
            aria-label="Aramayı temizle"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
    </div>
  )
}
