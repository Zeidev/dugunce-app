/**
 * Giriş hatalarının Türkçe metinleri.
 *
 * NEDEN AYRI DOSYA (Login.tsx içinde değil): bu eşleme bir İŞ KURALIDIR —
 * backend 423 `ACCOUNT_LOCKED` ile 403 `ACCOUNT_SUSPENDED`'i AYRI kodlarla
 * döndürüyor ve operatörün ne yapacağı bu ayrıma bağlı ("15 dakika sonra
 * tekrar dene" ile "yöneticine başvur" aynı şey değil). Bileşen içinde
 * kalsaydı davranışını test etmek için React render etmek gerekirdi.
 *
 * KURAL: `alert()` YOK, mesaj SATIR İÇİ gösterilir (spec §9.1).
 */

import { ApiError } from '../api'

/**
 * Hata koduna göre kullanıcıya gösterilecek metin.
 *
 * NEDEN `switch` + `never` kontrolü: yeni bir hata kodu eklendiğinde
 * derleyici uyarır. `Record<string, string>` kullanmak eksik eşlemeyi
 * sessizce geçirirdi.
 */
function messageForCode(code: string, fallback: string): string {
  switch (code) {
    // 423 — hesap 5 hatalı denemeden sonra 15 dakika kilitli. Genel
    // "hatalı parola" demek operatöre bekleyip beklemeyeceğini söylemez.
    case 'ACCOUNT_LOCKED':
      return 'Çok fazla hatalı deneme nedeniyle hesap geçici olarak kilitlendi. Yaklaşık 15 dakika sonra tekrar deneyin.'

    // 403 — hesap yönetici tarafından askıya alınmış. Parola DOĞRU olsa
    // bile giriş yapılamaz; kullanıcı bunu bilmeli, parolasını değiştirmeye
    // çalışmamalı.
    case 'ACCOUNT_SUSPENDED':
      return 'Bu hesap askıya alınmış. Erişim için sistem yöneticinizle iletişime geçin.'

    // 401 — e-posta yok VEYA parola yanlış. Backend bilerek ayırmıyor
    // (hesap listesi sızmasın); metin de ayırmamalı.
    case 'INVALID_CREDENTIALS':
      return 'E-posta veya parola hatalı.'

    // 400 — e-posta/parola boş gönderildi. Alan doğrulaması istemcide de
    // var ama sunucu yine de kontrol ediyor.
    case 'BAD_REQUEST':
      return fallback

    // 429 — IP başına 10 deneme / 15 dakika.
    case 'RATE_LIMITED':
      return 'Çok fazla giriş denemesi yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.'

    // Ağ hatası — sunucuya hiç ulaşılamadı. "Parola hatalı" demek
    // kullanıcıyı yanlış yöne gönderir (parolasını değiştirmeye çalışır).
    case 'NETWORK_ERROR':
      return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'

    // Sunucu 2xx döndü ama gövde beklenen şekilde değil — dağıtım
    // uyuşmazlığı. Operatöre "teknik bir sorun" demek en dürüstü.
    case 'INVALID_RESPONSE':
      return 'Sunucudan beklenmeyen bir yanıt geldi. Sayfayı yenileyip tekrar deneyin.'

    // 500 — merkezi yakalayıcının genel mesajı.
    case 'INTERNAL':
      return 'Sunucuda beklenmeyen bir hata oluştu. Lütfen biraz sonra tekrar deneyin.'

    default:
      // Bilinmeyen kod: sunucunun kullanıcıya dönük mesajı varsa onu
      // kullan (backend mesajları gösterilebilir olacak şekilde yazılmış).
      return fallback
  }
}

/**
 * Bir hatayı giriş ekranında gösterilecek Türkçe metne çevirir.
 *
 * `ApiError` dışındaki değerler (programlama hatası, beklenmeyen throw)
 * için genel metin döner — ham `Error.message` göstermek stack/CVE
 * detayı sızdırabilir.
 */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // Sunucunun mesajı boşsa genel metne düş.
    const fallback = err.message.trim() === '' ? 'Giriş yapılamadı.' : err.message
    return messageForCode(err.code, fallback)
  }
  return 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'
}
