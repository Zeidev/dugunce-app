import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'

/**
 * Basit in-memory rate limiter.
 *
 * serv00 tek süreç çalıştırdığı için Redis gerekmez. Süreç yeniden
 * başlarsa sayaçlar sıfırlanır — bu kabul edilebilir (login spam'i
 * için kalıcılık şart değil).
 *
 * SECURITY §16.1 #12: login, verify, davet kabul, RSVP için ayrı limit.
 */

export interface RateLimitOptions {
  /** Pencere süresi (ms) */
  windowMs: number
  /** Pencere başına azami istek */
  max: number
  /** İsteği hangi anahtara göre sayacağız (varsayılan: IP) */
  keyFn?: (req: Request) => string
  /** Özel mesaj */
  message?: string
}

export interface RateLimitMiddleware extends RequestHandler {
  /** Sayacı temizler — test ve operasyon için. */
  reset: () => void
}

interface Bucket {
  count: number
  resetAt: number
}

function defaultKey(req: Request): string {
  // trust proxy açık olduğu için req.ip Cloudflare'in gönderdiği gerçek IP
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

export function createRateLimit(options: RateLimitOptions): RateLimitMiddleware {
  const { windowMs, max, keyFn = defaultKey, message } = options
  const buckets = new Map<string, Bucket>()

  // Periyodik temizlik — bellek sızıntısını önler
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }, Math.max(windowMs, 60_000))
  cleanupTimer.unref()

  const middleware = ((req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req)
    const now = Date.now()

    let bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      res.setHeader('Cache-Control', 'no-store')
      next(
        AppError.tooManyRequests(
          message ?? `Çok fazla istek. ${retryAfterSec} saniye sonra tekrar deneyin.`,
        ),
      )
      return
    }

    // Kalan hak bilgisi (istemci gösterebilir)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    next()
  }) as RateLimitMiddleware

  middleware.reset = (): void => {
    buckets.clear()
  }

  return middleware
}

/**
 * Hazır limit yapılandırmaları — SECURITY §16.1 #12.
 *
 * Bu değerler plan §Task 12'den:
 * | Endpoint | Limit |
 * |---|---|
 * | POST /auth/magic-link | 3/saat (IP) + 3/saat (e-posta) |
 * | POST /auth/verify | 10/dakika (IP) |
 * | POST /auth/refresh | 30/dakika (IP) |
 * | POST /invites/accept | 10/saat (kullanıcı) |
 */
export const RATE_LIMITS = {
  magicLinkByIp: { windowMs: 60 * 60 * 1000, max: 3 },
  magicLinkByEmail: {
    windowMs: 60 * 60 * 1000,
    max: 3,
    keyFn: (req: Request): string =>
      String((req.body as { email?: string } | undefined)?.email ?? req.ip ?? 'unknown').toLowerCase(),
  },
  verify: { windowMs: 60 * 1000, max: 10 },
  refresh: { windowMs: 60 * 1000, max: 30 },
  inviteAccept: {
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyFn: (req: Request): string => req.auth?.userId ?? req.ip ?? 'unknown',
  },
  /**
   * Davetiye görüntüleme — KİMLİK DOĞRULAMASIZ uç.
   *
   * Token uzayı 256-bit olduğu için enumeration umutsuz, ama bu uç
   * serv00'ın 10 bağlantılık havuzunu tüketebilir. IP başına sınır.
   */
  invitationByIp: { windowMs: 60 * 1000, max: 30 },
  /**
   * RSVP gönderimi — KİMLİK DOĞRULAMASIZ YAZMA ucu.
   *
   * Token başına sınır: aynı davetiye için tekrar tekrar yazmayı
   * engeller (idempotent olsa da DB'ye gider).
   */
  rsvpByToken: {
    windowMs: 60 * 1000,
    max: 10,
    keyFn: (req: Request): string => String(req.params['token'] ?? req.ip ?? 'unknown'),
  },
} as const
