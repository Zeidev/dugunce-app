/**
 * Uygulama hataları.
 *
 * Her hata bir HTTP durum kodu ve makine-okunur bir kod taşır.
 * `message` kullanıcıya gösterilebilir olmalı — iç detay, stack veya
 * secret İÇERMEZ. İç detay log'a yazılır (maskelenmiş).
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    Object.setPrototypeOf(this, AppError.prototype)
  }

  static badRequest(message = 'Geçersiz istek', code = 'BAD_REQUEST'): AppError {
    return new AppError(400, code, message)
  }

  static unauthorized(message = 'Oturum gerekli', code = 'UNAUTHORIZED'): AppError {
    return new AppError(401, code, message)
  }

  static forbidden(message = 'Bu işlem için yetkiniz yok', code = 'FORBIDDEN'): AppError {
    return new AppError(403, code, message)
  }

  static notFound(message = 'Kayıt bulunamadı', code = 'NOT_FOUND'): AppError {
    return new AppError(404, code, message)
  }

  static conflict(message = 'Çakışma', code = 'CONFLICT'): AppError {
    return new AppError(409, code, message)
  }

  /** 410 — kaynak kalıcı olarak gitmiş (ör. RSVP kapanışı). */
  static gone(message = 'Bu kaynak artık kullanılamıyor', code = 'GONE'): AppError {
    return new AppError(410, code, message)
  }

  /** 422 — istek biçimsel olarak geçerli ama iş kuralına uymuyor. */
  static unprocessable(message = 'İstek işlenemedi', code = 'UNPROCESSABLE'): AppError {
    return new AppError(422, code, message)
  }

  /** 403 + limit bilgisi — premium yükseltme teşviki için ek alan taşır. */
  static limitReached(
    message = 'Plan limitine ulaşıldı',
    details?: Record<string, unknown>,
  ): AppError {
    const err = new AppError(403, 'LIMIT_REACHED', message)
    if (details) (err as AppError & { details?: Record<string, unknown> }).details = details
    return err
  }

  static upgradeRequired(message = 'Uygulama güncellemesi gerekli', code = 'UPGRADE_REQUIRED'): AppError {
    return new AppError(426, code, message)
  }

  static tooManyRequests(message = 'Çok fazla istek', code = 'RATE_LIMITED'): AppError {
    return new AppError(429, code, message)
  }

  static internal(message = 'Beklenmeyen bir hata oluştu', code = 'INTERNAL'): AppError {
    return new AppError(500, code, message)
  }
}
