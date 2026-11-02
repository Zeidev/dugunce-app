import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  createExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
} from '../expenses/service.js'
import { getBudgetSummary } from '../expenses/summary.js'
import { drizzleExpenseDeps } from '../expenses/store.js'

/**
 * Harcama ve bütçe route'ları.
 *
 * Hepsi `requireAuth` + `requireWeddingMember` arkasında.
 * `:weddingId` üzerinden tenant izolasyonu middleware'de uygulanır.
 */
export function createExpensesRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
}): Router {
  const router = Router({ mergeParams: true })
  const store = drizzleExpenseDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  const weddingIdOf = (req: Request): string => {
    const raw = req.params['weddingId']
    return Array.isArray(raw) ? String(raw[0]) : String(raw)
  }

  // --- Harcamalar ---

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const weddingId = weddingIdOf(req)
      const userId = req.auth!.userId
      const q = req.query as Record<string, string | undefined>

      const list = await listExpenses(
        {
          weddingId,
          userId,
          includeDeleted: q['includeDeleted'] === 'true',
          ...(q['month'] !== undefined ? { month: q['month'] } : {}),
          ...(q['categoryId'] !== undefined ? { categoryId: q['categoryId'] } : {}),
        },
        store,
      )
      res.json({ expenses: list })
    } catch (err) {
      next(err)
    }
  })

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const weddingId = weddingIdOf(req)
      const userId = req.auth!.userId
      const expense = await createExpense({ userId, weddingId, input: req.body }, store)
      res.status(201).json({ expense })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.get(
    '/:expenseId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const weddingId = weddingIdOf(req)
        const userId = req.auth!.userId
        const expenseId = String(req.params['expenseId'])

        const expense = await store.findById(expenseId, weddingId, userId)
        if (!expense) {
          next(AppError.notFound('Harcama bulunamadı'))
          return
        }
        res.json({ expense })
      } catch (err) {
        next(err)
      }
    },
  )

  router.patch(
    '/:expenseId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const weddingId = weddingIdOf(req)
        const userId = req.auth!.userId
        const expenseId = String(req.params['expenseId'])

        const updated = await updateExpense(
          { weddingId, userId, expenseId, patch: req.body },
          store,
        )
        if (!updated) {
          next(AppError.notFound('Harcama bulunamadı'))
          return
        }
        res.json({ expense: updated })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  router.delete(
    '/:expenseId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const weddingId = weddingIdOf(req)
        const userId = req.auth!.userId
        const expenseId = String(req.params['expenseId'])

        const ok = await deleteExpense({ weddingId, userId, expenseId }, store)
        if (!ok) {
          next(AppError.notFound('Harcama bulunamadı'))
          return
        }
        res.status(204).send()
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}

/**
 * Bütçe özeti router'ı — `/weddings/:weddingId/budget-summary`.
 */
export function createBudgetSummaryRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
}): Router {
  const router = Router({ mergeParams: true })
  const store = drizzleExpenseDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params['weddingId']
      const weddingId = Array.isArray(raw) ? String(raw[0]) : String(raw)
      const userId = req.auth!.userId
      const month =
        typeof req.query['month'] === 'string'
          ? req.query['month']
          : new Date().toISOString().slice(0, 7)

      const summary = await getBudgetSummary({ weddingId, userId, month }, store)
      res.json({ summary })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  return router
}

/** İş mantığı hatalarını HTTP hatalarına çevirir. */
function toHttpError(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : ''

  if (/geçersiz|boş olamaz|zorunlu|sıfırdan büyük|formatı/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/ödenmiş/i.test(msg)) {
    return AppError.conflict(msg)
  }
  if (/alan yok/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  return err
}
