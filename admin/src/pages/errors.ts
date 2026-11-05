/**
 * API hatası → kullanıcıya gösterilecek Türkçe metin.
 *
 * NEDEN ORTAK: altı sayfa aynı üç dalı (401 / 403 / diğer) ele alıyor.
 * Her sayfada tekrar yazmak, birinde "oturum bitti" diğerinde ham
 * `CSRF_INVALID` göstermesine yol açardı — operatör için ikisi çok
 * farklı şey söyler.
 *
 * 401 vs 403 AYRIMI KRİTİK:
 *  - 401 → oturum gerçekten yok. Guard `/login`e yönlendirir.
 *  - 403 → oturum VAR, yalnız bu yazma reddedildi (bayat CSRF token'ı).
 *    Kullanıcıyı çıkışa atmak yanlış olur; yeni oturum açması gerekir
 *    çünkü CSRF token'ı oturumla birlikte üretiliyor.
 */

import { ApiError } from '../api'

/** Oturum düştü — guard yönlendirmeyi üstlenir. */
const SESSION_EXPIRED = 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.'

/** Yazma reddedildi ama oturum duruyor. */
const SESSION_STALE = 'Oturum doğrulaması geçersiz. Lütfen tekrar giriş yapın.'

/** Tek bir hata için okunur mesaj. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return SESSION_EXPIRED
    if (err.status === 403) return SESSION_STALE
    // Ağ hatası: `api.ts` durum 0 + Türkçe mesaj üretir; onu kullan.
    if (err.status === 0) return err.message
    return err.message === '' ? fallback : err.message
  }
  return fallback
}

/**
 * Liste yükleme hatası — "yüklenemedi" ifadesi ŞART.
 *
 * NEDEN: spec §9.1 "hata 'yüklenemedi + tekrar dene' der". Boş liste
 * ile hata karışmamalı; bu metin testlerde de bu ayrımı çiviliyor.
 */
export function listErrorMessage(err: unknown, resource: string): string {
  return `${resource} yüklenemedi. ${apiErrorMessage(err, 'Bağlantınızı kontrol edip tekrar deneyin.')}`
}
