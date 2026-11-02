import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  listCategories,
  createCategory,
  deleteCategory,
  drizzleCategoryDeps,
} from '../expenses/categories.js'

/**
 * Harcama kategorileri — `/weddings/:weddingId/categories`.
 *
 * Brief §5.3: kategori listesi hem sistem hem kullanıcı kategorilerini
 * içerir. Sistem kategorileri silinemez.
 */
export function createCategoriesRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: () => import('express').RequestHandler
  store?: ReturnType<typeof drizzleCategoryDeps>
}): Router {
  const router = Router({ mergeParams: true })
  const store = deps.store ?? drizzleCategoryDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params['weddingId']
      const weddingId = Array.isArray(raw) ? String(raw[0]) : String(raw)
      const categories = await listCategories(
        { weddingId, userId: req.auth!.userId },
        store,
      )
      res.json({ categories })
    } catch (err) {
      next(err)
    }
  })

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params['weddingId']
      const weddingId = Array.isArray(raw) ? String(raw[0]) : String(raw)
      const category = await createCategory(
        { weddingId, userId: req.auth!.userId, input: req.body },
        store,
      )
      res.status(201).json({ category })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.delete('/:categoryId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params['weddingId']
      const weddingId = Array.isArray(raw) ? String(raw[0]) : String(raw)
      const ok = await deleteCategory(
        {
          weddingId,
          userId: req.auth!.userId,
          categoryId: String(req.params['categoryId']),
        },
        store,
      )
      if (!ok) {
        next(AppError.notFound('Kategori bulunamadı'))
        return
      }
      res.status(204).send()
    } catch (err) {
      next(toHttpError(err))
    }
  })

  return router
}

function toHttpError(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : ''
  if (/boş olamaz|zorunlu|en fazla|metin/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/bulunamadı/i.test(msg)) {
    return AppError.notFound(msg)
  }
  return err
}
