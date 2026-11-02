import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  createHelper,
  listHelpers,
  renameHelper,
  revokeHelper,
  deleteHelper,
  HelperLimitError,
  NotMemberError,
} from '../helpers/service.js'
import { drizzleHelperDeps } from '../helpers/store.js'

/**
 * Yardımcı route'ları — ÇİFT tarafı.
 *
 * Hepsi `requireAuth` + `requireWeddingMember` arkasında.
 */
export function createHelpersRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
  store?: ReturnType<typeof drizzleHelperDeps>
}): Router {
  const router = Router({ mergeParams: true })
  const store = deps.store ?? drizzleHelperDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  const weddingIdOf = (req: Request): string => {
    const raw = req.params['weddingId']
    return Array.isArray(raw) ? String(raw[0]) : String(raw)
  }

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const helpers = await listHelpers(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId },
        store,
      )
      res.json({ helpers })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await createHelper(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId, input: req.body },
        store,
      )
      if (!created) {
        next(AppError.notFound('Düğün bulunamadı'))
        return
      }

      // Ham token YALNIZCA burada döner — bir daha okunamaz.
      res.status(201).json({
        helper: created.helper,
        // İstemci linki kursun: fragment sunucuya gitmez
        url: `/h#${created.token}`,
        token: created.token,
      })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.patch('/:helperId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { displayName?: unknown }
      const updated = await renameHelper(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          helperId: String(req.params['helperId']),
          displayName: typeof body?.displayName === 'string' ? body.displayName : '',
        },
        store,
      )
      if (!updated) {
        next(AppError.notFound('Yardımcı bulunamadı'))
        return
      }
      res.json({ helper: updated })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.post(
    '/:helperId/revoke',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ok = await revokeHelper(
          {
            weddingId: weddingIdOf(req),
            userId: req.auth!.userId,
            helperId: String(req.params['helperId']),
          },
          store,
        )
        if (!ok) {
          next(AppError.notFound('Yardımcı bulunamadı'))
          return
        }
        res.status(204).send()
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  router.delete('/:helperId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ok = await deleteHelper(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          helperId: String(req.params['helperId']),
        },
        store,
      )
      if (!ok) {
        next(AppError.notFound('Yardımcı bulunamadı'))
        return
      }
      res.status(204).send()
    } catch (err) {
      next(toHttpError(err))
    }
  })

  return router
}

export function toHttpError(err: unknown): unknown {
  if (err instanceof NotMemberError) {
    return AppError.notFound(err.message)
  }
  if (err instanceof HelperLimitError) {
    return AppError.limitReached(err.message, {
      limit: err.limit,
      current: err.current,
    })
  }
  const msg = err instanceof Error ? err.message : ''
  if (/geçersiz|boş olamaz|zorunlu|en fazla|en az|metin olmalı/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  return err
}
