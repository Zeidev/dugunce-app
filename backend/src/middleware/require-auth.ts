import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { verifyAccessToken } from '../auth/tokens.js'
import { AppError } from '../lib/errors.js'

/**
 * Kimlik doğrulama middleware'i.
 *
 * `Authorization: Bearer <jwt>` başlığını doğrular, kullanıcıyı DB'den
 * kontrol eder (silinmiş/askıya alınmış olabilir) ve `req.auth`'a yazar.
 *
 * Not: Token geçerli olsa bile kullanıcı DB'de yoksa veya askıya alınmışsa
 * reddedilir — token iptali DB üzerinden anında etkili olur.
 */

export interface AuthContext {
  userId: string
}

export interface RequireAuthDeps {
  secret: string
  findUserById: (id: string) => Promise<{ id: string; status: string } | null>
}

/** Express Request'e eklenen alanlar. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
      membership?: { weddingId: string; userId: string; role: string }
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null
  return value
}

export function createRequireAuth(deps: RequireAuthDeps): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearer(req)
      if (!token) {
        next(AppError.unauthorized('Oturum gerekli'))
        return
      }

      const payload = verifyAccessToken(token, deps.secret)
      if (!payload) {
        next(AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }

      const user = await deps.findUserById(payload.userId)
      if (!user || user.status !== 'ACTIVE') {
        next(AppError.unauthorized('Geçersiz veya süresi dolmuş oturum'))
        return
      }

      req.auth = { userId: user.id }
      next()
    } catch (err) {
      next(err)
    }
  }
}
