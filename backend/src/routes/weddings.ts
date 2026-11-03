import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  createWedding,
  listUserWeddings,
  getWedding,
  updateWedding,
} from '../weddings/service.js'
import { drizzleWeddingDeps } from '../weddings/store.js'

/**
 * Düğün route'ları.
 *
 * Hepsi `requireAuth` arkasında — `req.auth.userId` garantili.
 * `requireWeddingMember` router seviyesinde `:weddingId` için uygulanır.
 */
export function createWeddingsRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
  /** Testlerde PGlite enjekte etmek için; verilmezse gerçek DB. */
  store?: ReturnType<typeof drizzleWeddingDeps>
}): Router {
  const router = Router()
  const store = deps.store ?? drizzleWeddingDeps()

  router.use(deps.requireAuth)

  // --- Koleksiyon ---
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.auth!.userId
      const wedding = await createWedding({ userId, input: req.body }, store)
      res.status(201).json({ wedding })
    } catch (err) {
      next(err)
    }
  })

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.auth!.userId
      const list = await listUserWeddings(userId, store)
      res.json({ weddings: list })
    } catch (err) {
      next(err)
    }
  })

  // --- Tek kayıt (üyelik gerekli) ---
  router.get(
    '/:weddingId',
    deps.requireMember(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.auth!.userId
        const weddingId = String(req.params['weddingId'])
        const wedding = await getWedding({ weddingId, userId }, store)
        if (!wedding) {
          next(AppError.notFound('Düğün bulunamadı'))
          return
        }
        res.json({ wedding })
      } catch (err) {
        next(err)
      }
    },
  )

  router.patch(
    '/:weddingId',
    deps.requireMember(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.auth!.userId
        const weddingId = String(req.params['weddingId'])
        const updated = await updateWedding({ weddingId, userId, patch: req.body }, store)
        if (!updated) {
          next(AppError.notFound('Düğün bulunamadı'))
          return
        }
        res.json({ wedding: updated })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
