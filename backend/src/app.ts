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
import { corsForInvitations } from './middleware/cors.js'
import { createCategoriesRouter } from './routes/categories.js'
import { createCardsRouter } from './routes/cards.js'

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
  /** Test enjeksiyonu — verilmezse gerçek DB. */
  inviteStore?: import('./auth/invite.js').InviteDeps
  helperStore?: ReturnType<typeof import('./helpers/store.js').drizzleHelperDeps>
  taskStore?: ReturnType<typeof import('./tasks/store.js').drizzleTaskDeps>
  messageStore?: ReturnType<typeof import('./messages/store.js').drizzleMessageDeps>
  sessionStore?: ReturnType<typeof import('./helpers/session-store.js').drizzleSessionDeps>
  /** Testlerde IP bazlı sınırları kapatmak için. */
  helperRateLimit?: boolean
  categoryStore?: ReturnType<typeof import('./expenses/categories.js').drizzleCategoryDeps>
  cardStore?: ReturnType<typeof import('./expenses/cards.js').drizzleCardDeps>
  /**
   * Düğün deposu ve üyelik araması.
   *
   * Verilmezse gerçek DB bağlantısı kurulur. Testler PGlite enjekte
   * ederek `PATCH /weddings/:id` gibi akışları gerçek HTTP üzerinden
   * doğrulayabilir — bu, kullanıcının gördüğü "kaydet hatası"nın
   * yakalandığı yerdir.
   */
  weddingStore?: ReturnType<typeof import('./weddings/store.js').drizzleWeddingDeps>
  /** Auth middleware'inin kullanıcı araması (testler için PGlite). */
  authDeps?: import('./middleware/require-auth.js').RequireAuthDeps
  membershipDeps?: import('./middleware/require-member.js').MembershipLookup
  /**
   * 404/hata yakalayıcıdan ÖNCE çalışan ek route'lar.
   *
   * Yerel doğrulama sunucuları (polling gibi canlı davranışları sınamak
   * için) kullanır. Üretimde verilmez.
   */
  extraRoutes?: (app: Express) => void
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express()

  // Proxy arkasında (Cloudflare) doğru IP ve protokol
  app.set('trust proxy', 1)

  /**
   * BigInt → JSON.
   *
   * `Kurus = bigint` (money.ts) ve Drizzle `numeric`/`bigint` kolonlarını
   * BigInt olarak döndürüyor. Express'in varsayılan `res.json()`
   * `JSON.stringify` kullanır ve **BigInt'te patlar**:
   *
   *   TypeError: Do not know how to serialize a BigInt
   *
   * Sonuç: harcama ekleme/ listeleme 500 dönerdi — üretimde de.
   * Kuruş zaten **string** olarak taşınmalı (istemci `String` bekliyor,
   * float yuvarlaması olmasın diye). Bu yüzden BigInt'i string'e çeviriyoruz.
   */
  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  )
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
  const requireAuth = createRequireAuth(
    options.authDeps ?? drizzleAuthDeps(env.JWT_SECRET),
  )
  const requireMember = createRequireWeddingMember(
    options.membershipDeps ?? drizzleMembershipDeps(),
  )

  // --- API route'ları ---
  /**
   * Auth uçları CORS'a AÇIK.
   *
   * `/auth/` onay sayfası `dugunce.com.tr` üzerinde (Cloudflare Pages),
   * API ise `api.dugunce.com.tr` — farklı origin. CORS başlığı olmadan
   * tarayıcı yanıtı okumaz, `fetch` "Failed to fetch" atar ve kullanıcı
   * "sunucuya ulaşılamadı" görür (bildirilen hata).
   *
   * Yalnızca beyaz listedeki origin'ler yansıtılır — wildcard YOK.
   */
  app.use(
    '/api/v1/auth',
    corsForInvitations({ allowedMethods: ['GET', 'POST', 'OPTIONS'] }),
    createAuthRouter({ requireAuth }),
  )
  app.use(
    '/api/v1/weddings',
    createWeddingsRouter({
      requireAuth,
      requireMember,
      ...(options.weddingStore ? { store: options.weddingStore } : {}),
    }),
  )

  // Davet kodları iki yerde: düğün altında üretim, kökte kabul
  const invites = createInvitesRouter({
    requireAuth,
    requireMember,
    ...(options.inviteStore ? { inviteStore: options.inviteStore } : {}),
  })
  app.use('/api/v1/weddings/:weddingId/invites', invites.weddingInvites)
  app.use('/api/v1/invites', invites.publicInvites)

  // Bütçe
  app.use('/api/v1/weddings/:weddingId/expenses', createExpensesRouter({ requireAuth, requireMember }))
  app.use('/api/v1/weddings/:weddingId/budget-summary', createBudgetSummaryRouter({ requireAuth, requireMember }))
  app.use('/api/v1/weddings/:weddingId/installments', createInstallmentsRouter({ requireAuth, requireMember }))
  app.use(
    '/api/v1/weddings/:weddingId/cards',
    createCardsRouter({
      requireAuth,
      requireMember,
      ...(options.cardStore ? { store: options.cardStore } : {}),
    }),
  )
  app.use(
    '/api/v1/weddings/:weddingId/categories',
    createCategoriesRouter({
      requireAuth,
      requireMember,
      ...(options.categoryStore ? { store: options.categoryStore } : {}),
    }),
  )

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

  // Yerel doğrulama kancaları — 404'ten ÖNCE
  options.extraRoutes?.(app)

  // 404 ve hata yönetimi en sonda
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
