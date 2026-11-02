import { Router, type Request, type Response } from 'express'

/**
 * Sağlık kontrolü router'ı.
 *
 * @param deps.checkDb — DB erişim testi. Verilmezse `/health/deep` 503
 *   döner (test ortamında gerçek DB olmayabilir).
 */
export function createHealthRouter(deps?: {
  checkDb?: () => Promise<boolean>
}): Router {
  const router = Router()

  /**
   * GET /health — ayakta mı kontrolü.
   *
   * DİKKAT: Bu endpoint **veritabanına dokunmaz**.
   * Sebebi (SECURITY §1.5): UptimeRobot her saat başı çağırır; DB sorgusu
   * eklemek gereksiz yük ve uyku önleme amacını bozar.
   * Derin kontrol için `/health/deep` ayrıdır.
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.status(200).json({
      status: 'ok',
      app: 'dugunce-api',
    })
  })

  /**
   * GET /health/deep — veritabanı dahil derin kontrol.
   *
   * `/health`'ten farkı: DB'ye gerçekten bağlanmayı dener.
   * İzleme ve teşhis içindir; UptimeRobot bunu çağırmamalı.
   *
   * GÜVENLİK: Hata detayı DIŞARI SIZMAZ. Yalnızca `db: ok | fail`.
   * Bağlantı dizesi, kullanıcı adı veya stack trace dönmez
   * (SECURITY §8 #13).
   */
  router.get('/health/deep', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

    let dbOk = false
    if (deps?.checkDb) {
      try {
        dbOk = await deps.checkDb()
      } catch {
        // Hata detayı YUTULUR — dışarı sızmamalı
        dbOk = false
      }
    }

    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      app: 'dugunce-api',
      db: dbOk ? 'ok' : 'fail',
    })
  })

  return router
}

/** Geriye dönük uyumluluk: DB kontrolü olmayan router. */
export const healthRouter = createHealthRouter()
