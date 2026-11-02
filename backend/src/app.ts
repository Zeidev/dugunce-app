import express, { type Express } from 'express'
import { healthRouter } from './routes/health.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'

/**
 * Express uygulamasını oluşturur.
 *
 * Test edilebilirlik için ayrı: `createApp()` her çağrıda taze bir uygulama
 * döner, dinlemeye başlamaz. Sunucuyu `server.ts` başlatır.
 */
export function createApp(): Express {
  const app = express()

  // Proxy arkasında (Cloudflare) doğru IP ve protokol
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  // Sağlık kontrolü — en üstte, hiçbir middleware'e takılmasın
  app.use(healthRouter)

  // --- API route'ları buraya eklenecek (Aşama 2+) ---

  // 404 ve hata yönetimi en sonda
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
