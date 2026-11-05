/**
 * Test kurulumu — DOM temizliği, jest-dom eşleştiricileri ve
 * `vi.useFakeTimers()` + `user-event` uyumu.
 *
 * `@testing-library/jest-dom/vitest` girişi, `expect`'i Vitest'inkiyle
 * genişletir. Düz `@testing-library/jest-dom` import etmek Vitest'in
 * global `expect`'ine eşleştirici EKLEMEZ ve tüm `toBeInTheDocument`
 * çağrıları "is not a function" ile patlar.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * HER TESTTEN SONRA DOM'U TEMİZLE — ELLE.
 *
 * NEDEN GEREKLİ: `@testing-library/react` otomatik temizliği yalnız
 * `afterEach` GLOBAL olarak tanımlıysa yapar. Bu projede
 * `vitest.config.ts` içinde `globals` açık DEĞİL (açmak, her test
 * dosyasına `import { describe }` yazma zorunluluğunu kaldırır ama
 * tip tarafında `vitest/globals` eklemeyi gerektirir).
 *
 * Ölçülen sonuç (temizlik olmadan): ikinci testte `getByRole` AYNI
 * öğeyi iki kez buluyor ve "Found multiple elements" ile patlıyordu.
 * Bu, testlerin birbirine sızmasıdır — sırayla yeşil/kırmızı değişen
 * güvenilmez bir takım üretir.
 */
afterEach(() => {
  cleanup()
})

/**
 * `vi.useFakeTimers()` + `user-event` UYUMU.
 *
 * SORUN (ölçüldü, test 5 sn'de zaman aşımına düşüyordu):
 * `@testing-library/react`'in `asyncWrapper`'ı, her `user-event`
 * çağrısından sonra mikro-görev kuyruğunu boşaltmak için
 * `new Promise(resolve => setTimeout(resolve, 0))` kuruyor. Sahte
 * zamanlayıcı açıkken bu `setTimeout` ASLA tetiklenmez — meğerki
 * birileri saati ilerletsin.
 *
 * RTL bunu `jestFakeTimersAreEnabled()` ile tespit edip
 * `jest.advanceTimersByTime(0)` çağırıyor. O fonksiyon YALNIZ `jest`
 * globali varken çalışıyor; Vitest'te `jest` yoktur, dolayısıyla
 * `setTimeout(0)` sonsuza kadar bekler ve test zaman aşımına düşer.
 *
 * ÇÖZÜM: RTL'in aradığı minimum `jest` arayüzünü (tek metot)
 * sağlamak.
 *
 * NEDEN GETTER: `beforeEach` sırası ÖNEMLİ — kurulum dosyasının
 * `beforeEach`'i test dosyasınınkinden ÖNCE çalışır, yani o anda
 * `vi.useFakeTimers()` henüz çağrılmamıştır. "Sahte zamanlayıcı açıksa
 * tanımla" demek işe yaramaz. Getter ile her erişimde durum okunur:
 * RTL'in `typeof jest !== 'undefined'` kontrolü, sahte zamanlayıcı
 * KAPALIYKEN `undefined` görür ve kendi gerçek-zaman yolundan gider.
 *
 * NEDEN TEST DOSYALARINA DEĞİL DE BURAYA: debounce davranışını
 * test eden her dosya aynı kurulumu tekrar yazmak zorunda kalırdı;
 * biri unutursa test sessizce 5 sn bekleyip KIRMIZI verir ve nedeni
 * anlaşılmaz.
 */
interface JestShim {
  advanceTimersByTime: (ms: number) => void
}

const jestShim: JestShim = {
  advanceTimersByTime: (ms: number) => {
    vi.advanceTimersByTime(ms)
  },
}

Object.defineProperty(globalThis, 'jest', {
  configurable: true,
  // Sahte zamanlayıcı kapalıyken `undefined` → RTL bunu "jest yok"
  // sayar ve gerçek `setTimeout` ile devam eder.
  get: (): JestShim | undefined => (vi.isFakeTimers() ? jestShim : undefined),
})

/**
 * `__BUILD_ID__` — `vite.config.ts` içindeki `define` ile gömülür.
 *
 * SORUN: Vitest `vite.config.ts`'i KULLANMIYOR (ayrı `vitest.config.ts` var,
 * çünkü üretim yapılandırması test aracına bağımlı olmamalı). Bu yüzden
 * `define` uygulanmıyor ve `Layout` render edilirken
 * `ReferenceError: __BUILD_ID__ is not defined` fırlıyor.
 *
 * ÇÖZÜM: testte sabit bir değer tanımla. Değerin kendisi önemli değil —
 * testler yalnız "görünür bir sürüm etiketi var mı" sorusunu soruyor.
 */
Object.defineProperty(globalThis, '__BUILD_ID__', {
  configurable: true,
  writable: true,
  value: 'test',
})
