import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  createGuest,
  createGuestsBulk,
  listGuests,
  updateGuest,
  deleteGuest,
  setGuestRsvp,
  getGuestUsage,
  GuestLimitError,
  NotMemberError,
} from '../guests/service.js'
import { createInvitation, PartySizeError } from '../guests/invitation.js'
import { drizzleGuestDeps } from '../guests/store.js'

/**
 * Davetli route'ları — ÇİFT tarafı.
 *
 * Hepsi `requireAuth` + `requireWeddingMember` arkasında.
 * `:weddingId` üzerinden tenant izolasyonu middleware'de uygulanır.
 */
export function createGuestsRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
  store?: ReturnType<typeof drizzleGuestDeps>
}): Router {
  const router = Router({ mergeParams: true })
  // Depo enjekte edilebilir — auth katmanı testleri DB olmadan çalışsın.
  const store = deps.store ?? drizzleGuestDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  const weddingIdOf = (req: Request): string => {
    const raw = req.params['weddingId']
    return Array.isArray(raw) ? String(raw[0]) : String(raw)
  }

  // --- Liste ---
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query as Record<string, string | undefined>
      const guests = await listGuests(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          includeDeleted: q['includeDeleted'] === 'true',
          ...(q['side'] ? { side: q['side'] as 'BRIDE' | 'GROOM' } : {}),
          ...(q['rsvp'] ? { rsvp: q['rsvp'] as 'PENDING' | 'ATTENDING' | 'DECLINED' } : {}),
          // spec §6b.7: ad/telefon araması sunucuda
          ...(q['search'] ? { search: q['search'] } : {}),
          // spec §6b.7: cursor sayfalama
          ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
          ...(q['cursor'] ? { cursor: q['cursor'] } : {}),
        },
        store,
      )
      res.json({ guests })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  // --- Kota ---
  // NOT: `/:guestId`'den ÖNCE tanımlanmalı, yoksa "limit" bir guest id sanılır.
  router.get('/limit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usage = await getGuestUsage(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId },
        store,
      )
      res.json({ usage })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  // --- Tek ekle ---
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guest = await createGuest(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId, input: req.body },
        store,
      )
      res.status(201).json({ guest })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  // --- Toplu ekle ---
  router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { guests?: unknown }
      const guests = await createGuestsBulk(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          inputs: Array.isArray(body?.guests) ? body.guests : [],
        },
        store,
      )
      res.status(201).json({ guests })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  // --- Güncelle ---
  router.patch(
    '/:guestId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const updated = await updateGuest(
          {
            weddingId: weddingIdOf(req),
            userId: req.auth!.userId,
            guestId: String(req.params['guestId']),
            patch: req.body,
          },
          store,
        )
        if (!updated) {
          next(AppError.notFound('Davetli bulunamadı'))
          return
        }
        res.json({ guest: updated })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  // --- RSVP (çiftin telefonla gelen yanıtı girmesi) ---
  router.patch(
    '/:guestId/rsvp',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { rsvp?: unknown; partySize?: unknown }
        const updated = await setGuestRsvp(
          {
            weddingId: weddingIdOf(req),
            userId: req.auth!.userId,
            guestId: String(req.params['guestId']),
            rsvp: body?.rsvp as 'ATTENDING' | 'DECLINED' | 'PENDING',
            ...(typeof body?.partySize === 'number' ? { partySize: body.partySize } : {}),
          },
          store,
        )
        if (!updated) {
          next(AppError.notFound('Davetli bulunamadı'))
          return
        }
        res.json({ guest: updated })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  // --- Sil ---
  router.delete(
    '/:guestId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ok = await deleteGuest(
          {
            weddingId: weddingIdOf(req),
            userId: req.auth!.userId,
            guestId: String(req.params['guestId']),
          },
          store,
        )
        if (!ok) {
          next(AppError.notFound('Davetli bulunamadı'))
          return
        }
        res.status(204).send()
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  // --- Davetiye üret ---
  router.post(
    '/:guestId/invitation',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { allowedPartySize?: unknown }
        const allowedPartySize =
          typeof body?.allowedPartySize === 'number' ? body.allowedPartySize : undefined

        const invitation = await createInvitation(
          {
            weddingId: weddingIdOf(req),
            userId: req.auth!.userId,
            guestId: String(req.params['guestId']),
            ...(allowedPartySize !== undefined ? { allowedPartySize } : {}),
          },
          store,
        )
        if (!invitation) {
          next(AppError.notFound('Davetli bulunamadı'))
          return
        }

        // Ham token YALNIZCA burada döner — bir daha okunamaz.
        res.status(201).json({
          invitation: {
            token: invitation.token,
            expiresAt: invitation.expiresAt,
            // İstemci linki kursun: fragment sunucuya gitmez (design)
            url: `/d#${invitation.token}`,
          },
        })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  return router
}

/**
 * Servis hatalarını HTTP'ye eşler.
 *
 * Eşleme tablosu (plan Task 8):
 * - GuestLimitError  → 403 LIMIT_REACHED + {limit, current, requested}
 * - PartySizeError   → 422
 * - geçersiz girdi   → 400
 */
export function toHttpError(err: unknown): unknown {
  // 404, 403 DEĞİL: 403 "kaynak var ama yetkin yok" der ve düğünün
  // varlığını sızdırır (SECURITY §1.1).
  if (err instanceof NotMemberError) {
    return AppError.notFound(err.message)
  }
  if (err instanceof GuestLimitError) {
    return AppError.limitReached(err.message, {
      limit: err.limit,
      current: err.current,
      requested: err.requested,
    })
  }
  if (err instanceof PartySizeError) {
    return AppError.unprocessable(err.message)
  }

  const msg = err instanceof Error ? err.message : ''
  if (/geçersiz|boş olamaz|zorunlu|en fazla|en az|metin olmalı|arasında|telefon/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/rsvp/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/silinmiş/i.test(msg)) {
    return AppError.conflict(msg)
  }
  return err
}
