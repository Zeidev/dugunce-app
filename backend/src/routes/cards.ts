import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  listCards,
  createCard,
  updateCard,
  deleteCard,
  drizzleCardDeps,
} from '../expenses/cards.js'

/**
 * Kart uçları — `/weddings/:weddingId/cards` (spec §6b.5).
 *
 * GÜVENLİK: Tam kart numarası/CVV/son kullanma tarihi gönderilirse
 * istek REDDEDİLİR (400). Sessizce yok saymak, istemcinin kart bilgisi
 * gönderdiğini fark etmemesine yol açardı.
 */
export function createCardsRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: () => import('express').RequestHandler
  store?: ReturnType<typeof drizzleCardDeps>
}): Router {
  const router = Router({ mergeParams: true })
  const store = deps.store ?? drizzleCardDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  const weddingIdOf = (req: Request): string => {
    const raw = req.params['weddingId']
    return Array.isArray(raw) ? String(raw[0]) : String(raw)
  }

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cards = await listCards(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId },
        store,
      )
      res.json({ cards })
    } catch (err) {
      next(err)
    }
  })

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const card = await createCard(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId, input: req.body },
        store,
      )
      res.status(201).json({ card })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.patch('/:cardId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const card = await updateCard(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          cardId: String(req.params['cardId']),
          input: req.body,
        },
        store,
      )
      if (!card) {
        next(AppError.notFound('Kart bulunamadı'))
        return
      }
      res.json({ card })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.delete('/:cardId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ok = await deleteCard(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          cardId: String(req.params['cardId']),
        },
        store,
      )
      if (!ok) {
        next(AppError.notFound('Kart bulunamadı'))
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
  if (/saklanmaz/i.test(msg)) {
    // Güvenlik kuralı ihlali — 400, açıklayıcı mesaj
    return AppError.badRequest(msg)
  }
  if (/boş olamaz|zorunlu|en fazla|olmalı|rakam/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/bulunamadı/i.test(msg)) {
    return AppError.notFound(msg)
  }
  return err
}
