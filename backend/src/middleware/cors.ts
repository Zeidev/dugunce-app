import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * CORS — iki ayrı tüketici, tek uygulama.
 *
 * Neden gerekli: davetiye sayfası `dugunce.com.tr` (Cloudflare Pages)
 * üzerinde, API `api.dugunce.com.tr` (serv00) üzerinde. Farklı origin
 * olduğu için tarayıcı CORS başlığı arar; yoksa isteği engeller ve
 * sayfa boş kalır.
 *
 * Aynı gerekçe admin paneli için de geçerli: SPA
 * `https://dugunce.com.tr/spa/`, API `https://api.dugunce.com.tr` —
 * alt alan adı farklı olduğu için tarayıcı bunu **cross-origin** sayar.
 *
 * GÜVENLİK:
 * - `Access-Control-Allow-Origin: *` KULLANILMAZ. Davetiye token'ı ve
 *   admin çerezi hassas; herhangi bir site okuyabilmemeli.
 * - Yalnızca beyaz listedeki origin'ler yansıtılır.
 * - `Vary: Origin` — aksi halde CDN/proxy yanlış origin için cache'ler
 *   (cache zehirlenmesi).
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

/** Davetiye uçlarının varsayılan metotları. */
const DEFAULT_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
/** Davetiye uçlarının varsayılan başlıkları. */
const DEFAULT_HEADERS = ['Content-Type', 'Accept']

/**
 * Ortak CORS uygulaması.
 *
 * `corsForInvitations` ve `corsForAdmin` bunun ince sarmalayıcılarıdır:
 * mantık TEK yerde kalsın ki birinde düzeltilen bir hata (ör. `Vary`
 * eksikliği) diğerinde sessizce yaşamasın.
 *
 * `credentials` varsayılanı `false`: davetiye ucu token'ı URL'de taşır,
 * cookie paylaşmaz. Açmak `Allow-Credentials: true` yazar ve tarayıcı
 * artık `*` ile eşleşmeyi reddeder — davranışı bilinçli değiştirmek
 * gerekir.
 */
export function corsMiddleware(options: CorsOptions = {}): RequestHandler {
  const allowed = new Set(options.allowedOrigins ?? ALLOWED_ORIGINS)
  const methods = options.allowedMethods ?? DEFAULT_METHODS
  const headers = options.allowedHeaders ?? DEFAULT_HEADERS

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin

    // Vary her durumda: cache anahtarı origin'e bağlı
    res.setHeader('Vary', 'Origin')

    if (typeof origin === 'string' && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Methods', methods.join(', '))
      res.setHeader('Access-Control-Allow-Headers', headers.join(', '))
      if (options.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true')
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

/**
 * Davetli tarafı CORS middleware'i.
 *
 * Yalnızca `/api/v1/invitations/*` altında kullanılır. Çift tarafı uçlar
 * (auth, weddings, guests, expenses) CORS başlığı ALMAZ — mobil uygulama
 * CORS kullanmaz ve admin paneli kendi middleware'ini kullanır.
 */
export function corsForInvitations(options: CorsOptions = {}): RequestHandler {
  return corsMiddleware(options)
}

/**
 * Admin paneli CORS middleware'i.
 *
 * Davetiye sürümünden iki farkı var:
 * 1. `credentials: true` — oturum `a_session` çerezinde taşınır ve
 *    tarayıcı çerezi cross-origin istekte ANCAK bu başlıkla gönderir.
 *    Eksik olursa giriş 200 döner ama sonraki her istek 401 olur.
 * 2. `X-CSRF-Token` izinli başlıklar arasında — olmazsa preflight
 *    PATCH/POST isteğini engeller ve panelde hiçbir yazma çalışmaz.
 *
 * Yabancı origin YANSITILMAZ: `Access-Control-Allow-Origin` hiç
 * yazılmaz, dolayısıyla tarayıcı yanıtı okutmaz.
 */
export function corsForAdmin(options: CorsOptions = {}): RequestHandler {
  // Varsayılanlar YALNIZ çağıran vermediyse uygulanır. Naif bir
  // `{...defaults, ...options}` yayması, `credentials: undefined` gibi
  // açıkça verilmiş bir değeri varsayılanın ÜZERİNE yazar ve cookie
  // paylaşımını sessizce kapatırdı.
  const merged: CorsOptions = {
    credentials: options.credentials ?? true,
    allowedHeaders: options.allowedHeaders ?? ['Content-Type', 'Accept', 'X-CSRF-Token'],
    allowedMethods: options.allowedMethods ?? DEFAULT_METHODS,
  }
  if (options.allowedOrigins) merged.allowedOrigins = options.allowedOrigins
  return corsMiddleware(merged)
}
