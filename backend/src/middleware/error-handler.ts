import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

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
      logger.error({ err, path: req.path, method: req.method }, 'app error')
    } else {
      logger.debug({ code: err.code, path: req.path, method: req.method }, 'client error')
    }

    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    })
    return
  }

  // Bilinmeyen hata — iç detay sızdırma
  logger.error(
    { err, path: req.path, method: req.method },
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
