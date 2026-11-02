import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { createInvite, acceptInvite } from '../auth/invite.js'
import { drizzleInviteDeps } from '../auth/invite-store.js'

/**
 * Davet kodu route'ları.
 *
 * - `POST /weddings/:weddingId/invites` — kod üret (üye gerekli)
 * - `POST /invites/accept` — kodu kabul et (giriş gerekli)
 */
export function createInvitesRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
}): { weddingInvites: Router; publicInvites: Router } {
  const store = drizzleInviteDeps()

  // --- Düğün altında kod üretimi ---
  const weddingInvites = Router({ mergeParams: true })
  weddingInvites.use(deps.requireAuth)

  weddingInvites.post(
    '/',
    deps.requireMember(['OWNER', 'CO_OWNER']),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const weddingId = String(req.params['weddingId'])
        const userId = req.auth!.userId
        const body = req.body as { role?: string; displayName?: string }

        if (body.role !== 'CO_OWNER') {
          next(AppError.badRequest('Bu aşamada yalnızca CO_OWNER daveti destekleniyor'))
          return
        }

        const result = await createInvite(
          {
            weddingId,
            role: 'CO_OWNER',
            createdBy: userId,
            ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
          },
          store,
        )

        res.status(201).json({
          code: result.code,
          expiresAt: result.expiresAt,
          expiresInMinutes: 10,
        })
      } catch (err) {
        next(err)
      }
    },
  )

  // --- Kod kabulü ---
  const publicInvites = Router()
  publicInvites.use(deps.requireAuth)

  publicInvites.post(
    '/accept',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.auth!.userId
        const body = req.body as { code?: string }

        if (!body.code || typeof body.code !== 'string') {
          next(AppError.badRequest('Davet kodu gerekli'))
          return
        }

        const result = await acceptInvite({ code: body.code, userId }, store)
        res.json({ ok: true, weddingId: result.weddingId, role: result.role })
      } catch (err) {
        next(err)
      }
    },
  )

  return { weddingInvites, publicInvites }
}
