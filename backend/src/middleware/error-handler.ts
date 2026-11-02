import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

/**
 * Log'a yazılacak güvenli yol.
 *
 * `req.path` HAM yolu verir — `/api/v1/invitations/<TOKEN>` gibi kimlik
 * taşıyan segmentler log'a düşer (SECURITY §8 #13). Bunun yerine route
 * pattern'i (`req.route.path`, ör. `/api/v1/invitations/:token`) tercih
 * edilir; route eşleşmediyse (404) yolun tamamı değil, yalnızca ilk iki
 * segmenti yazılır.
 */
function safePath(req: Request): string {
  const routePath = (req.route as { path?: string } | undefined)?.path
  if (typeof routePath === 'string') {
    return `${req.baseUrl}${routePath}`
  }

  // Route yok: token/id taşıyabilecek segmentleri at, sadece prefix tut
  const segments = req.path.split('/').filter(Boolean).slice(0, 3)
  return `/${segments.join('/')}${req.path.split('/').filter(Boolean).length > 3 ? '/…' : ''}`
}

/**
 * Merkezi hata yakalayıcı.
 *
 * - `AppError` → kendi status/code/message'ı ile döner.
 * - Bilinmeyen hata → 500 INTERNAL, **stack ve iç detay response'a yazılmaz**.
 * - Tüm 5xx hatalar log'a yazılır (maskelenmiş).
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return
  }

  if (err instanceof AppError) {
    // 4xx: beklenen hata, sadece debug seviyesinde logla
    if (err.statusCode >= 500) {
      logger.error({ err, path: safePath(req), method: req.method }, 'app error')
    } else {
      logger.debug({ code: err.code, path: safePath(req), method: req.method }, 'client error')
    }

    // `details` yalnızca AppError.limitReached gibi açıkça set eden
    // yapıcılar tarafından doldurulur; keyfi alan sızmaz.
    const details = (err as AppError & { details?: Record<string, unknown> }).details
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(details ? { details } : {}),
      },
    })
    return
  }

  // Bilinmeyen hata — iç detay sızdırma
  logger.error(
    { err, path: safePath(req), method: req.method },
    'unhandled error',
  )

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Beklenmeyen bir hata oluştu',
    },
  })
}

/**
 * 404 yakalayıcı — hiçbir route eşleşmediğinde.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`${req.method} ${req.path} bulunamadı`))
}
