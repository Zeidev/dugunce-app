import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import type { DeviceTokenDeps } from './store.js'
import type { PreferencesDeps } from './preferences.js'

/**
 * Bildirim uçları.
 *
 * Hepsi `requireAuth` arkasında. iOS platformu kapsam dışı (spec §0);
 * `PLATFORMS` yalnız ANDROID içeriyor.
 */

/** Desteklenen platformlar. iOS sonraki iş. */
const PLATFORMS = ['ANDROID'] as const

/** `PATCH /preferences` için izinli alanlar. */
const PREFERENCE_KEYS = ['enabled', 'quietHoursOverride'] as const

export function createNotificationsRouter(deps: {
  requireAuth: import('express').RequestHandler
  tokens: DeviceTokenDeps
  preferences: PreferencesDeps
}): Router {
  const router = Router()

  /** Oturumdaki kullanıcı kimliği; yoksa 401 fırlatır. */
  function requireUserId(req: Request): string {
    const userId = req.auth?.userId
    if (!userId) throw AppError.unauthorized('Oturum gerekli')
    return userId
  }

  /**
   * POST /device — token kaydı (upsert).
   *
   * Her uygulama açılışında çağrılır: `last_seen_at` tazelenir ve cihaz
   * el değiştirdiyse token sahibi güncellenir.
   */
  router.post(
    '/device',
    deps.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireUserId(req)
        const body = (req.body ?? {}) as Record<string, unknown>
        const rawToken = body['token']
        const platform = body['platform'] ?? 'ANDROID'

        if (typeof rawToken !== 'string' || rawToken.trim() === '') {
          next(AppError.badRequest('Token gerekli', 'INVALID_TOKEN'))
          return
        }
        if (typeof platform !== 'string' || !PLATFORMS.includes(platform as 'ANDROID')) {
          next(AppError.badRequest('Geçersiz platform', 'INVALID_PLATFORM'))
          return
        }

        await deps.tokens.upsertDeviceToken({
          userId,
          token: rawToken.trim(),
          platform,
        })
        res.status(204).end()
      } catch (err) {
        next(err)
      }
    },
  )

  /**
   * DELETE /device — çıkışta token siler.
   *
   * Token GÖVDEDE, sorgu parametresinde değil: URL'ye yazılan token
   * erişim loglarına, proxy loglarına ve tarayıcı geçmişine düşer.
   * Gövde loglanmaz.
   */
  router.delete(
    '/device',
    deps.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        requireUserId(req)
        const body = (req.body ?? {}) as Record<string, unknown>
        const rawToken = body['token']

        if (typeof rawToken !== 'string' || rawToken.trim() === '') {
          next(AppError.badRequest('Token gerekli', 'INVALID_TOKEN'))
          return
        }

        await deps.tokens.deleteDeviceToken(rawToken.trim())
        res.status(204).end()
      } catch (err) {
        next(err)
      }
    },
  )

  /**
   * GET /preferences — kullanıcının bildirim tercihleri.
   *
   * Cihaz token'ından BAĞIMSIZ: kullanıcı bildirimleri kapatınca token
   * silinmez (yeniden açtığında izin akışı tekrar yaşanmasın).
   */
  router.get(
    '/preferences',
    deps.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireUserId(req)
        res.json(await deps.preferences.get(userId))
      } catch (err) {
        next(err)
      }
    },
  )

  /**
   * PATCH /preferences — tercih güncelleme.
   *
   * BOŞ GÖVDE 400: sessiz no-op, istemci hatasını gizler — istemci
   * "kapattım" sanır, sunucu hiçbir şey yapmamıştır.
   *
   * BİLİNMEYEN ALAN 400: `admin: true` gibi bir alanın sessizce yok
   * sayılması, ileride eklenecek bir alanın yanlışlıkla gönderilmesini
   * maskeler (aynı kural `PATCH /users/:id` için de geçerli).
   */
  router.patch(
    '/preferences',
    deps.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireUserId(req)
        const body = (req.body ?? {}) as Record<string, unknown>
        const keys = Object.keys(body)

        if (keys.length === 0) {
          next(AppError.badRequest('Güncellenecek alan yok', 'EMPTY_PATCH'))
          return
        }
        const unknown = keys.filter((k) => !PREFERENCE_KEYS.includes(k as 'enabled'))
        if (unknown.length > 0) {
          next(AppError.badRequest('Bilinmeyen alan', 'INVALID_PATCH'))
          return
        }

        const patch: { enabled?: boolean; quietHoursOverride?: boolean } = {}
        if (typeof body['enabled'] === 'boolean') patch.enabled = body['enabled']
        if (typeof body['quietHoursOverride'] === 'boolean') {
          patch.quietHoursOverride = body['quietHoursOverride']
        }

        // Tip zorlaması sonrası boş kaldıysa (ör. `enabled: 'evet'`)
        // yine 400: sessizce hiçbir şey yapmamak yanıltıcı.
        if (Object.keys(patch).length === 0) {
          next(AppError.badRequest('Geçersiz değer tipi', 'INVALID_PATCH'))
          return
        }

        await deps.preferences.set(userId, patch)
        res.json(await deps.preferences.get(userId))
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
