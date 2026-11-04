import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { requestMagicLink, verifyMagicLink } from '../auth/magic-link.js'
import { rotateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from '../auth/tokens.js'
import { drizzleRefreshDeps } from '../auth/refresh-store.js'
import { drizzleMagicLinkDeps } from '../auth/magic-link-store.js'
import { createRateLimit, RATE_LIMITS } from '../middleware/rate-limit.js'
import { loadEnv } from '../config/env.js'

/**
 * Auth route'ları.
 *
 * Rate limit'ler SECURITY §16.1 #12'den:
 * - magic-link: 3/saat (IP) + 3/saat (e-posta)
 * - verify: 10/dakika (IP)
 * - refresh: 30/dakika (IP)
 */
export function createAuthRouter(deps: {
  requireAuth: import('express').RequestHandler
}): Router {
  const router = Router()

  const magicLinkByIp = createRateLimit(RATE_LIMITS.magicLinkByIp)
  const magicLinkByEmail = createRateLimit(RATE_LIMITS.magicLinkByEmail)
  const verifyLimit = createRateLimit(RATE_LIMITS.verify)
  const refreshLimit = createRateLimit(RATE_LIMITS.refresh)

  const magicDeps = drizzleMagicLinkDeps()
  const refreshDeps = drizzleRefreshDeps(loadEnv().JWT_SECRET)

  /**
   * POST /auth/magic-link
   *
   * GÜVENLİK: Kullanıcı var/yok bilgisi sızdırılmaz — her durumda 200.
   * (Enumeration koruması, SECURITY §16.1)
   */
  router.post(
    '/magic-link',
    magicLinkByIp,
    magicLinkByEmail,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { email?: unknown }
        if (typeof body.email !== 'string' || !body.email.trim()) {
          next(AppError.badRequest('E-posta gerekli'))
          return
        }

        try {
          await requestMagicLink({ email: body.email, deps: magicDeps })
        } catch (err) {
          // Geçersiz format → 400 (kullanıcıya söylenebilir)
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('Geçersiz e-posta')) {
            next(AppError.badRequest(msg))
            return
          }
          // Diğer hatalar (SMTP vb.) → log'a, kullanıcıya genel yanıt
          next(err)
          return
        }

        // Her durumda aynı yanıt — kullanıcı var mı yok mu belli olmaz
        res.status(200).json({ ok: true })
      } catch (err) {
        next(err)
      }
    },
  )

  /** POST /auth/verify — token veya kodu tüketir, token çifti döner. */
  router.post(
    '/verify',
    verifyLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { token?: unknown; code?: unknown }
        const token = typeof body.token === 'string' ? body.token : undefined
        const code = typeof body.code === 'string' ? body.code : undefined

        if (!token && !code) {
          next(AppError.badRequest('Token veya kod gerekli'))
          return
        }

        const result = await verifyMagicLink({
          ...(token !== undefined ? { token } : {}),
          ...(code !== undefined ? { code } : {}),
          deps: magicDeps,
        })

        res.status(200).json({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (/geçersiz|süresi dolmuş|kullanılamıyor|hatalı|deneme/i.test(msg)) {
          next(AppError.unauthorized(msg))
          return
        }
        next(err)
      }
    },
  )

  /** POST /auth/refresh — rotasyonlu yenileme. */
  router.post(
    '/refresh',
    refreshLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { refreshToken?: unknown }
        if (typeof body.refreshToken !== 'string' || !body.refreshToken) {
          next(AppError.badRequest('refreshToken gerekli'))
          return
        }

        const result = await rotateRefreshToken(body.refreshToken, refreshDeps)
        // `accessToken` DA dönmeli — yoksa istemci 15 dakika sonra yine
        // 401 alır ve kullanıcı sürekli giriş ekranına düşer.
        res.status(200).json({
          refreshToken: result.refreshToken,
          accessToken: result.accessToken,
        })
      } catch (err) {
        next(AppError.unauthorized('Geçersiz veya süresi dolmuş yenileme tokenı'))
      }
    },
  )

  /** POST /auth/logout — tek cihaz. */
  router.post(
    '/logout',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { refreshToken?: unknown }
        if (typeof body.refreshToken === 'string' && body.refreshToken) {
          await revokeRefreshToken(body.refreshToken, refreshDeps)
        }
        res.status(200).json({ ok: true })
      } catch (err) {
        next(err)
      }
    },
  )

  /** POST /auth/logout-all — tüm cihazlar. */
  router.post(
    '/logout-all',
    deps.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.auth!.userId
        const count = await revokeAllUserTokens(userId, refreshDeps)
        res.status(200).json({ ok: true, revoked: count })
      } catch (err) {
        next(err)
      }
    },
  )

  /** GET /auth/me — oturum sahibi. */
  router.get(
    '/me',
    deps.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.auth!.userId
        const user = await magicDeps.findUserById(userId)
        if (!user) {
          next(AppError.unauthorized('Kullanıcı bulunamadı'))
          return
        }
        res.json({ user })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
