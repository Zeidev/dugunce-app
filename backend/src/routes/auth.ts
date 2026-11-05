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
import type { DeviceTokenDeps } from '../notifications/store.js'

export function createAuthRouter(deps: {
  requireAuth: import('express').RequestHandler
  /**
   * Push token temizliği için.
   *
   * Opsiyonel: verilmezse çıkış yalnız refresh token'ı iptal eder
   * (mevcut davranış). Testler push kurmadan çalışabilir.
   */
  deviceTokenDeps?: Pick<DeviceTokenDeps, 'deleteDeviceTokenAnyOwner' | 'deleteAllForUser'>
  /**
   * Test enjeksiyonu: verilmezse gerçek DB'ye bağlanır.
   *
   * NEDEN GEREKLİ: `drizzleRefreshDeps` kurulum anında `getDb()` çağırıyor;
   * DB olmayan bir testte bu 500 üretir. Push testleri refresh akışını
   * değil token temizliğini sınıyor.
   */
  refreshDeps?: import('../auth/tokens.js').RefreshDeps
}): Router {
  const router = Router()

  const magicLinkByIp = createRateLimit(RATE_LIMITS.magicLinkByIp)
  const magicLinkByEmail = createRateLimit(RATE_LIMITS.magicLinkByEmail)
  const verifyLimit = createRateLimit(RATE_LIMITS.verify)
  const refreshLimit = createRateLimit(RATE_LIMITS.refresh)

  const magicDeps = drizzleMagicLinkDeps()
  const refreshDeps = deps.refreshDeps ?? drizzleRefreshDeps(loadEnv().JWT_SECRET)

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
        const body = req.body as { refreshToken?: unknown; deviceToken?: unknown }
        if (typeof body.refreshToken === 'string' && body.refreshToken) {
          await revokeRefreshToken(body.refreshToken, refreshDeps)
        }

        /*
          Push token temizliği (spec §5.2). Token GÖVDEDEN alınıyor:
          bu uç kimlik doğrulaması İSTEMİYOR (yalnız refresh token
          iptali), dolayısıyla `userId` bilinmiyor. Gövdedeki token
          doğrudan silinir — doğru cihazı hedefler ve ek yetki gerektirmez.

          HATA YUTULUR: çıkış kullanıcının niyetidir; bildirim
          temizliği ikincil. DB hatası çıkışı engellememeli.
        */
        if (
          deps.deviceTokenDeps !== undefined &&
          typeof body.deviceToken === 'string' &&
          body.deviceToken !== ''
        ) {
          try {
            /*
              Çıkışta kullanıcı kimliği YOK (bu uç requireAuth'suz).
              Bu yüzden sahiplik kontrolsüz silme yerine ayrı bir metot
              kullanılıyor: `deleteDeviceTokenAnyOwner`. Risk kabul
              edilebilir çünkü token'ı bilmek zaten cihazın kendisini
              ele geçirmeyi gerektirir; ayrıca yalnız push kaydı silinir
              (oturum değil).
            */
            await deps.deviceTokenDeps.deleteDeviceTokenAnyOwner(body.deviceToken)
          } catch {
            // Sessizce yut — çıkış başarılı sayılır.
          }
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

        /*
          TÜM cihazların push token'ları silinir. Bu uçta `userId`
          BİLİNİYOR (requireAuth), o yüzden cihaz başına token yerine
          kullanıcının hepsi siliniyor — istemci listeyi bilmek zorunda
          kalmıyor.
        */
        if (deps.deviceTokenDeps !== undefined) {
          try {
            await deps.deviceTokenDeps.deleteAllForUser(userId)
          } catch {
            // Çıkış yine başarılı.
          }
        }

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
