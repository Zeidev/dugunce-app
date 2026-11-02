import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * CORS — yalnızca davetli tarafı uçları için.
 *
 * Neden gerekli: davetiye sayfası `dugunce.com.tr` (Cloudflare Pages)
 * üzerinde, API `api.dugunce.com.tr` (serv00) üzerinde. Farklı origin
 * olduğu için tarayıcı CORS başlığı arar; yoksa isteği engeller ve
 * sayfa boş kalır.
 *
 * GÜVENLİK:
 * - `Access-Control-Allow-Origin: *` KULLANILMAZ. Davetiye token'ı
 *   hassas; herhangi bir site okuyabilmemeli.
 * - Yalnızca beyaz listedeki origin'ler yansıtılır.
 * - `Vary: Origin` — aksi halde CDN/proxy yanlış origin için cache'ler
 *   (cache zehirlenmesi).
 * - Kimlik bilgisi (cookie) paylaşımı YOK: `Allow-Credentials` set
 *   edilmez. Davetli tarafı token'ı URL'de taşır, cookie kullanmaz.
 */

/** İzinli origin'ler. Üretim + yerel geliştirme. */
const ALLOWED_ORIGINS = [
  'https://dugunce.com.tr',
  'https://www.dugunce.com.tr',
  // Yerel geliştirme (vite varsayılan portları)
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]

export interface CorsOptions {
  /** Test için genişletilebilir. Verilmezse varsayılan liste. */
  allowedOrigins?: string[]
  /**
   * Cookie tabanlı uçlar için `true`. Yalnızca beyaz listedeki origin'ler
   * yansıtıldığı için wildcard'a dönüşmez.
   */
  credentials?: boolean
  /** İzinli istek başlıkları (CSRF başlığı dahil). */
  allowedHeaders?: string[]
  /** İzinli metotlar. */
  allowedMethods?: string[]
}

/**
 * Davetli tarafı CORS middleware'i.
 *
 * Yalnızca `/api/v1/invitations/*` altında kullanılır. Çift tarafı uçlar
 * (auth, weddings, guests, expenses) CORS başlığı ALMAZ — mobil uygulama
 * CORS kullanmaz ve admin paneli aynı origin'de olacak.
 */
export function corsForInvitations(options: CorsOptions = {}): RequestHandler {
  const allowed = new Set(options.allowedOrigins ?? ALLOWED_ORIGINS)

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin

    // Vary her durumda: cache anahtarı origin'e bağlı
    res.setHeader('Vary', 'Origin')

    if (typeof origin === 'string' && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader(
        'Access-Control-Allow-Methods',
        (options.allowedMethods ?? ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']).join(', '),
      )
      res.setHeader(
        'Access-Control-Allow-Headers',
        (options.allowedHeaders ?? ['Content-Type', 'Accept']).join(', '),
      )
      if (options.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true')
      // Hassas veri: sonuç cache'lenmesin
      res.setHeader('Access-Control-Max-Age', '600')
    }

    // Preflight: gövde gerekmez, hemen bitir
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  }
}
