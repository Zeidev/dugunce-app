import express, { type Express } from 'express'
import { healthRouter } from './routes/health.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { createRequireAuth } from './middleware/require-auth.js'
import { createRequireWeddingMember } from './middleware/require-member.js'
import { createAuthRouter } from './routes/auth.js'
import { createWeddingsRouter } from './routes/weddings.js'
import { createInvitesRouter } from './routes/invites.js'
import { drizzleAuthDeps, drizzleMembershipDeps } from './auth/auth-store.js'
import { loadEnv } from './config/env.js'

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

  // --- Auth middleware'leri ---
  const env = loadEnv()
  const requireAuth = createRequireAuth(drizzleAuthDeps(env.JWT_SECRET))
  const requireMember = createRequireWeddingMember(drizzleMembershipDeps())

  // --- API route'ları ---
  app.use('/api/v1/auth', createAuthRouter({ requireAuth }))
  app.use('/api/v1/weddings', createWeddingsRouter({ requireAuth, requireMember }))

  // Davet kodları iki yerde: düğün altında üretim, kökte kabul
  const invites = createInvitesRouter({ requireAuth, requireMember })
  app.use('/api/v1/weddings/:weddingId/invites', invites.weddingInvites)
  app.use('/api/v1/invites', invites.publicInvites)

  // 404 ve hata yönetimi en sonda
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
