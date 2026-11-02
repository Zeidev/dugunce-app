import { Router, type Request, type Response } from 'express'

const router = Router()

/**
 * GET /health — ayakta mı kontrolü.
 *
 * DİKKAT: Bu endpoint **veritabanına dokunmaz**.
 * Sebebi (SECURITY §1.5): UptimeRobot her saat başı çağırır; DB sorgusu
 * eklemek gereksiz yük ve uyku önleme amacını bozar.
 * Derin kontrol için `/health/deep` (v1.1) ayrıdır.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.status(200).json({
    status: 'ok',
    app: 'davetly-api',
  })
})

export const healthRouter = router
