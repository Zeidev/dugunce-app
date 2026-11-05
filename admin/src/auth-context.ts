import { createContext, useContext } from 'react'
import type { Admin } from './types'

/**
 * Oturum bağlamı — giriş yapmış yöneticiyi ağaç boyunca taşır.
 *
 * NEDEN CONTEXT: `App.tsx`'teki guard `api.me()` ile admini zaten çekiyor.
 * Bunu `Layout`'a prop ile geçirmek mümkün değil, çünkü `Layout` bir
 * `<Route element={...}>` olarak render ediliyor; prop geçirmek için
 * `cloneElement` gibi kırılgan bir yol gerekirdi. `Layout`'un ikinci bir
 * `me()` çağrısı yapması ise her rota değişiminde fazladan istek demek.
 *
 * NEDEN AYRI DOSYA: `Layout` bu bağlamı import ediyor; bağlam `App.tsx`
 * içinde tanımlansaydı `App → Layout → App` döngüsü oluşur ve Vite bunu
 * geliştirmede "circular import" uyarısıyla yükler (bazı sıralamalarda
 * `undefined` context hatası verir).
 */

export interface AuthContextValue {
  /** Oturumdaki yönetici — guard doğruladıktan sonra null olamaz. */
  admin: Admin
  /**
   * Çıkış — sunucu oturumunu siler, CSRF token'ını temizler ve guard'ı
   * anonim duruma geçirir (yönlendirmeyi guard yapar).
   *
   * NEDEN BAĞLAMDA, NEDEN `Layout` İÇİNDE DEĞİL: ilk sürümde `Layout`
   * `api.logout()` çağırıp `navigate('/login')` yapıyordu. Bu, guard'ın
   * `session` durumunu DEĞİŞTİRMİYOR; guard hâlâ `authenticated` olduğu
   * için `/login` rotasındaki `<Navigate to="/" replace />` devreye girip
   * kullanıcıyı PANELE GERİ ATIYORDU (tarayıcıda ölçüldü: çıkışa
   * basıldıktan sonra panel ekranda kaldı). Oturum durumunun TEK sahibi
   * guard olmalı; çıkış da oradan geçer.
   */
  signOut: () => Promise<void>
}

/**
 * Varsayılan `null`: bağlam SAĞLAYICI OLMADAN kullanılırsa `useAuth`
 * açıkça hata fırlatır. Sessizce sahte bir admin döndürmek, oturumsuz
 * bir ekranın çalışıyor gibi görünmesine yol açardı.
 */
const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = AuthContext.Provider

/** Oturumdaki yöneticiyi verir; sağlayıcı yoksa hata fırlatır. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth yalnız AuthProvider içinde kullanılabilir')
  }
  return value
}
