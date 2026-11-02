import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { resolveInvitation } from '../guests/invitation.js'
import { toPublicInvitation } from '../guests/public-view.js'
import { submitRsvp, RsvpError, RsvpClosedError } from '../guests/rsvp.js'
import { drizzleGuestDeps } from '../guests/store.js'
import { createRateLimit, RATE_LIMITS } from '../middleware/rate-limit.js'

/**
 * Davetli route'ları — DAVETLİ tarafı (kimlik doğrulama YOK).
 *
 * Tek yetki kaynağı URL'deki token'dır (design "Davetiye sayfası").
 * `wedding_id` istemciden ASLA alınmaz.
 *
 * GÜVENLİK:
 * - `GET` yan etki YARATMAZ — WhatsApp link önizlemesi davetiyeyi yakmasın.
 * - RSVP yalnızca `POST` ile değişir.
 * - `no-store` + `noindex` + `no-referrer` başlıkları.
 */
export function createInvitationsRouter(deps?: {
  store?: ReturnType<typeof drizzleGuestDeps>
  /** Test için kapatılabilir — varsayılan açık. */
  rateLimit?: boolean
}): Router {
  const router = Router()
  // Depo enjekte edilebilir — auth katmanı testleri DB olmadan çalışsın.
  const store = deps?.store ?? drizzleGuestDeps()

  // Bu iki uç KİMLİK DOĞRULAMASI OLMAYAN tek yüzey; sınırsız bırakmak
  // serv00'ın 10 bağlantılık havuzunu tüketmeye açık kapı bırakır.
  const limitEnabled = deps?.rateLimit !== false
  const getLimiter = limitEnabled
    ? createRateLimit(RATE_LIMITS.invitationByIp)
    : (_req: Request, _res: Response, next: NextFunction) => next()
  const rsvpLimiter = limitEnabled
    ? createRateLimit(RATE_LIMITS.rsvpByToken)
    : (_req: Request, _res: Response, next: NextFunction) => next()

  // Davetli tarafı: cache'lenmemeli, indekslenmemeli, referrer sızdırmamalı.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  /**
   * Davetiyeyi göster.
   *
   * SALT OKUMA — hiçbir yazma yapmaz, `rsvp_at` değişmez, `invite_status`
   * değişmez. Bu, link önizleme botlarının davetiyeyi yakmaması için
   * kritik (Review Focus #3).
   */
  router.get('/:token', getLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = String(req.params['token'])
      const row = await resolveInvitation(token, store)
      const view = toPublicInvitation(row)

      if (!view) {
        next(AppError.notFound('Davetiye bulunamadı'))
        return
      }
      res.json({ invitation: view })
    } catch (err) {
      next(err)
    }
  })

  /**
   * RSVP gönder.
   *
   * Idempotent — aynı yanıt tekrar gelirse yazma yapılmaz.
   */
  router.post('/:token/rsvp', rsvpLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = String(req.params['token'])
      const body = req.body as { rsvp?: unknown; partySize?: unknown }

      const result = await submitRsvp(
        {
          rawToken: token,
          rsvp: body?.rsvp as 'ATTENDING' | 'DECLINED',
          ...(typeof body?.partySize === 'number' ? { partySize: body.partySize } : {}),
        },
        store,
      )

      if (!result) {
        next(AppError.notFound('Davetiye bulunamadı'))
        return
      }
      res.json({ rsvp: result })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  return router
}

export function toHttpError(err: unknown): unknown {
  if (err instanceof RsvpClosedError) {
    return AppError.gone(err.message)
  }
  if (err instanceof RsvpError) {
    return AppError.unprocessable(err.message)
  }

  const msg = err instanceof Error ? err.message : ''
  if (/geçersiz|gerekli|en az|en fazla|tam sayı/i.test(msg)) {
    return AppError.unprocessable(msg)
  }
  return err
}
