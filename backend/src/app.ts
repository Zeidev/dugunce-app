import express, { type Express } from 'express'
import { createHealthRouter } from './routes/health.js'
import { pingDb } from './db/client.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { createRequireAuth } from './middleware/require-auth.js'
import { createRequireWeddingMember } from './middleware/require-member.js'
import { createAuthRouter } from './routes/auth.js'
import { createWeddingsRouter } from './routes/weddings.js'
import { createInvitesRouter } from './routes/invites.js'
import {
  createExpensesRouter,
  createBudgetSummaryRouter,
  createInstallmentsRouter,
} from './routes/expenses.js'
import { createGuestsRouter } from './routes/guests.js'
import { createInvitationsRouter } from './routes/invitations.js'
import { createHelpersRouter } from './routes/helpers.js'
import { createTasksRouter } from './routes/tasks.js'
import { createHelperAppRouter } from './routes/helper-app.js'
import { drizzleAuthDeps, drizzleMembershipDeps } from './auth/auth-store.js'
import { loadEnv } from './config/env.js'

/**
 * Express uygulamasını oluşturur.
 *
 * Test edilebilirlik için ayrı: `createApp()` her çağrıda taze bir uygulama
 * döner, dinlemeye başlamaz. Sunucuyu `server.ts` başlatır.
 */
export interface CreateAppOptions {
  /**
   * Test için enjekte edilebilir davetli deposu.
   *
   * Verilmezse `drizzleGuestDeps()` gerçek DB bağlantısı kurar. Auth
   * katmanı testleri DB olmadan çalışabilsin diye açık.
   */
  guestStore?: ReturnType<typeof import('./guests/store.js').drizzleGuestDeps>
  /**
   * `/health/deep` için DB erişim testi.
   *
   * Verilmezse derin kontrol 503 döner. Üretimde `pingDb()` bağlanır;
   * testlerde enjekte edilir.
   */
  healthCheckDb?: () => Promise<boolean>
  helperStore?: ReturnType<typeof import('./helpers/store.js').drizzleHelperDeps>
  taskStore?: ReturnType<typeof import('./tasks/store.js').drizzleTaskDeps>
  messageStore?: ReturnType<typeof import('./messages/store.js').drizzleMessageDeps>
  sessionStore?: ReturnType<typeof import('./helpers/session-store.js').drizzleSessionDeps>
  /** Testlerde IP bazlı sınırları kapatmak için. */
  helperRateLimit?: boolean
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express()

  // Proxy arkasında (Cloudflare) doğru IP ve protokol
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  // Sağlık kontrolü — en üstte, hiçbir middleware'e takılmasın
  app.use(
    createHealthRouter({
      ...(options.healthCheckDb
        ? { checkDb: options.healthCheckDb }
        : { checkDb: () => pingDb() }),
    }),
  )

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

  // Bütçe
  app.use('/api/v1/weddings/:weddingId/expenses', createExpensesRouter({ requireAuth, requireMember }))
  app.use('/api/v1/weddings/:weddingId/budget-summary', createBudgetSummaryRouter({ requireAuth, requireMember }))
  app.use('/api/v1/weddings/:weddingId/installments', createInstallmentsRouter({ requireAuth, requireMember }))

  // Davetliler — çift tarafı (auth + üyelik)
  app.use(
    '/api/v1/weddings/:weddingId/guests',
    createGuestsRouter({
      requireAuth,
      requireMember,
      ...(options.guestStore ? { store: options.guestStore } : {}),
    }),
  )

  // Davetiyeler — davetli tarafı (token tek yetki, auth YOK)
  app.use(
    '/api/v1/invitations',
    createInvitationsRouter(
      options.guestStore ? { store: options.guestStore } : {},
    ),
  )

  // Yardımcılar — çift tarafı (auth + üyelik)
  app.use(
    '/api/v1/weddings/:weddingId/helpers',
    createHelpersRouter({
      requireAuth,
      requireMember,
      ...(options.helperStore ? { store: options.helperStore } : {}),
    }),
  )

  // Görevler ve görev sohbeti — çift tarafı
  app.use(
    '/api/v1/weddings/:weddingId/tasks',
    createTasksRouter({
      requireAuth,
      requireMember,
      ...(options.taskStore ? { taskStore: options.taskStore } : {}),
      ...(options.messageStore ? { messageStore: options.messageStore } : {}),
    }),
  )

  // Yardımcı uygulaması — token yalnızca oturum açar, veri istekleri oturumla
  app.use(
    '/api/v1/helper',
    createHelperAppRouter({
      ...(options.helperStore ? { helperStore: options.helperStore } : {}),
      ...(options.taskStore ? { taskStore: options.taskStore } : {}),
      ...(options.messageStore ? { messageStore: options.messageStore } : {}),
      ...(options.sessionStore ? { sessionStore: options.sessionStore } : {}),
      ...(options.helperRateLimit === false ? { rateLimit: false } : {}),
    }),
  )

  // 404 ve hata yönetimi en sonda
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
