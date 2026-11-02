import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'

/**
 * Düğün üyeliği kontrolü — tenant izolasyonunun kalbi (SECURITY §1.1).
 *
 * KURAL: Üye olunmayan düğün için **404 NOT_FOUND** döner, 403 değil.
 *
 * Sebep: 403 "bu kaynak var ama yetkin yok" demektir — saldırgana varlık
 * bilgisi sızdırır. 404 hiçbir şey söylemez, kaynağın var olup olmadığını
 * bile gizler.
 *
 * Bu middleware `requireAuth`'tan SONRA gelmelidir (`req.auth` gerekir).
 */

export interface MembershipLookup {
  findMembership: (
    weddingId: string,
    userId: string,
  ) => Promise<{ weddingId: string; userId: string; role: string } | null>
}

/** Düğün rolleri (design §7). */
export type WeddingRole = 'OWNER' | 'CO_OWNER'

/**
 * @param deps - DB erişimi
 * @param allowedRoles - verilirse yalnızca bu roller geçer (aksi halde tüm üyeler)
 */
export function createRequireWeddingMember(
  deps: MembershipLookup,
): (allowedRoles?: WeddingRole[]) => RequestHandler {
  return (allowedRoles?: WeddingRole[]) =>
    async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      try {
        const auth = req.auth
        if (!auth) {
          next(AppError.unauthorized('Oturum gerekli'))
          return
        }

        const rawWeddingId = req.params['weddingId']
        // Express params string | string[] olabilir (wildcard route'larda)
        const weddingId = Array.isArray(rawWeddingId) ? rawWeddingId[0] : rawWeddingId
        if (!weddingId) {
          next(AppError.badRequest('weddingId eksik'))
          return
        }

        const membership = await deps.findMembership(weddingId, auth.userId)

        // Üye değilse 404 — varlık sızdırma yok
        if (!membership) {
          next(AppError.notFound('Düğün bulunamadı'))
          return
        }

        // Rol kısıtı varsa kontrol et
        if (allowedRoles && allowedRoles.length > 0) {
          if (!allowedRoles.includes(membership.role as WeddingRole)) {
            next(AppError.forbidden('Bu işlem için yetkiniz yok'))
            return
          }
        }

        req.membership = {
          weddingId: membership.weddingId,
          userId: membership.userId,
          role: membership.role,
        }
        next()
      } catch (err) {
        next(err)
      }
    }
}
