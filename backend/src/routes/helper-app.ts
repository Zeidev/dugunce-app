import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { hashToken } from '../lib/crypto.js'
import { resolveHelperToken } from '../helpers/token.js'
import { toHelperTaskList } from '../tasks/helper-view.js'
import { toHelperMessageList, toHelperMessageView } from '../messages/helper-view.js'
import { notifyWeddingMembers, type NotifyDeps } from '../notifications/service.js'
import {
  sendMessage,
  listMessages,
  MessageTooLongError,
  NotTaskAssigneeError,
} from '../messages/service.js'
import { drizzleHelperDeps } from '../helpers/store.js'
import { drizzleTaskDeps } from '../tasks/store.js'
import { drizzleMessageDeps } from '../messages/store.js'
import { drizzleSessionDeps } from '../helpers/session-store.js'
import {
  openSession,
  loadSession,
  verifyCsrf,
  readCookie,
  sessionCookie,
  csrfCookie,
  clearSessionCookies,
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_TTL_MS,
  type SessionContext,
} from '../helpers/session.js'
import { createRateLimit, RATE_LIMITS } from '../middleware/rate-limit.js'
import { corsForInvitations } from '../middleware/cors.js'

/**
 * Yardımcı uygulaması — çift hesabı YOK, yalnızca token → oturum.
 *
 * SECURITY §1.2:
 * - #4: Uzun ömürlü token her istekte URL'de taşınmaz. `POST /session`
 *   gövdesindeki token bir kez doğrulanır, karşılığında 30 dk'lık kısa
 *   ömürlü, iptal edilebilir oturum (HttpOnly cookie) verilir.
 * - #6: Revoke edilmiş yardımcının oturumu ilk istekte ölür (join'de
 *   `token_revoked_at IS NULL` koşulu).
 *
 * KRİTİK: Her görev sorgusu `assignee_helper_id = helperId` ile kapsamlıdır.
 */

/** Yardımcının değiştirebileceği TEK alan. */
const ALLOWED_HELPER_PATCH = ['status'] as const

export function createHelperAppRouter(deps?: {
  helperStore?: ReturnType<typeof drizzleHelperDeps>
  taskStore?: ReturnType<typeof drizzleTaskDeps>
  messageStore?: ReturnType<typeof drizzleMessageDeps>
  sessionStore?: ReturnType<typeof drizzleSessionDeps>
  rateLimit?: boolean
  /** Test için: çerezleri Secure'suz üret. */
  secureCookies?: boolean
  /** Push bildirimi bağımlılıkları; verilmezse gönderim yok. */
  notifyDeps?: NotifyDeps
}): Router {
  const router = Router()
  const helperStore = deps?.helperStore ?? drizzleHelperDeps()
  const taskStore = deps?.taskStore ?? drizzleTaskDeps()
  const msgStore = deps?.messageStore ?? drizzleMessageDeps()
  const sessionStore = deps?.sessionStore ?? drizzleSessionDeps()

  const secure = deps?.secureCookies ?? process.env['NODE_ENV'] === 'production'
  const cookieBase = { secure, path: '/api/v1/helper' }

  router.use(
    corsForInvitations({ credentials: true, allowedHeaders: ['Content-Type', 'Accept', CSRF_HEADER] }),
  )

  // Cache'lenmemeli, indekslenmemeli, referrer sızdırmamalı.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  const limitEnabled = deps?.rateLimit !== false
  const skip = (_req: Request, _res: Response, next: NextFunction): void => next()
  const loginLimiter = limitEnabled
    ? createRateLimit(RATE_LIMITS.helperSessionByIp)
    : skip
  const readLimiter = limitEnabled ? createRateLimit(RATE_LIMITS.invitationByIp) : skip
  const writeLimiter = limitEnabled ? createRateLimit(RATE_LIMITS.helperMessageByIp) : skip

  /** Oturumu çözer; yoksa 401. */
  async function requireSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<SessionContext | null> {
    const raw = readCookie(req.headers.cookie, SESSION_COOKIE)
    const ctx = raw ? await loadSession(raw, sessionStore) : null
    if (!ctx) {
      next(AppError.unauthorized('Oturum gerekli veya süresi dolmuş'))
      return null
    }
    // Oturum veritabanında uzatıldıysa çerezleri de tazele.
    // Aksi halde tarayıcı çerezi 30 dk sonra siler ve kullanıcı —
    // oturum sunucuda hâlâ geçerliyken — "geçersiz bağlantı" görür.
    if (ctx.renewed && raw) {
      const maxAgeSec = Math.floor((ctx.expiresAt.getTime() - Date.now()) / 1000)
      const csrf = readCookie(req.headers.cookie, CSRF_COOKIE)
      const cookies = [sessionCookie(raw, maxAgeSec, cookieBase)]
      if (csrf) cookies.push(csrfCookie(csrf, maxAgeSec, cookieBase))
      res.setHeader('Set-Cookie', cookies)
    }
    return ctx
  }

  /**
   * CSRF — double-submit + Origin kontrolü.
   *
   * Cookie cross-site gittiği için SameSite tek başına yetmez: başka bir
   * site kurbanın tarayıcısından istek atarsa cookie gider. Başlıktaki
   * değer yalnızca aynı origin'deki JS tarafından bilinir.
   */
  function requireCsrf(req: Request, ctx: SessionContext, next: NextFunction): boolean {
    const raw = readCookie(req.headers.cookie, CSRF_COOKIE)
    const header = req.headers[CSRF_HEADER]
    if (!raw || !header || raw !== header || !verifyCsrf(header, ctx.csrfHash)) {
      next(AppError.forbidden('CSRF doğrulaması başarısız'))
      return false
    }
    return true
  }

  // --- Oturum açma: token BİR KEZ, gövdede ---
  router.post('/session', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = (req.body as { token?: unknown } | undefined)?.token
      if (typeof token !== 'string' || token.length === 0) {
        next(AppError.badRequest('Bağlantı gerekli'))
        return
      }

      const helper = await resolveHelperToken(token, helperStore)
      if (!helper) {
        next(AppError.notFound('Bağlantı geçersiz veya süresi dolmuş'))
        return
      }

      const opened = await openSession(helper, sessionStore)
      const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000)
      res.setHeader('Set-Cookie', [
        sessionCookie(opened.session, maxAgeSec, cookieBase),
        csrfCookie(opened.csrf, maxAgeSec, cookieBase),
      ])

      res.status(201).json({
        helperName: helper.displayName,
        coupleNames: helper.wedding.coupleNames,
        csrfToken: opened.csrf,
        expiresIn: maxAgeSec,
      })
    } catch (err) {
      next(err)
    }
  })

  // --- Oturum kapatma ---
  router.delete('/session', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await requireSession(req, res, next)
      if (!ctx) return
      if (!requireCsrf(req, ctx, next)) return

      const raw = readCookie(req.headers.cookie, SESSION_COOKIE)
      if (raw) await sessionStore.deleteByHash(hashToken(raw))
      res.setHeader('Set-Cookie', clearSessionCookies(cookieBase))
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  // --- Kendi görevleri ---
  router.get('/tasks', readLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await requireSession(req, res, next)
      if (!ctx) return

      const tasks = await taskStore.listForHelper(ctx.weddingId, ctx.helperId)
      const view = toHelperTaskList(tasks, {
        id: ctx.weddingId,
        coupleNames: ctx.coupleNames,
        weddingDate: null,
        venueName: null,
        deletedAt: null,
      })

      res.json({ helperName: ctx.displayName, coupleNames: ctx.coupleNames, tasks: view })
    } catch (err) {
      next(err)
    }
  })

  // --- Görev durumu değiştir ---
  router.patch('/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await requireSession(req, res, next)
      if (!ctx) return
      if (!requireCsrf(req, ctx, next)) return

      const body = req.body as Record<string, unknown>
      const keys = Object.keys(body ?? {})

      // Yardımcı YALNIZCA status değiştirebilir.
      if (keys.length === 0 || keys.some((k) => !ALLOWED_HELPER_PATCH.includes(k as never))) {
        next(AppError.badRequest('Yardımcı yalnızca görev durumunu değiştirebilir'))
        return
      }

      const status = body['status']
      if (status !== 'TODO' && status !== 'DOING' && status !== 'DONE') {
        next(AppError.badRequest('Geçersiz durum'))
        return
      }

      const updated = await taskStore.updateTaskStatusAsHelper(
        String(req.params['taskId']),
        status,
        ctx.helperId,
        ctx.weddingId,
      )
      if (!updated) {
        next(AppError.notFound('Görev bulunamadı'))
        return
      }
      res.json({ task: { id: updated.id, status: updated.status } })
    } catch (err) {
      next(err)
    }
  })

  // --- Görev sohbeti ---
  router.get(
    '/tasks/:taskId/messages',
    readLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = await requireSession(req, res, next)
        if (!ctx) return

        const q = req.query as Record<string, string | undefined>
        const limit = q['limit'] ? Number(q['limit']) : undefined

        const messages = await listMessages(
          {
            weddingId: ctx.weddingId,
            taskId: String(req.params['taskId']),
            viewer: { kind: 'HELPER', helperId: ctx.helperId },
            ...(limit !== undefined ? { limit } : {}),
            ...(q['before'] ? { before: q['before'] } : {}),
          },
          msgStore,
        )
        res.json({ messages: toHelperMessageList(messages) })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  router.post(
    '/tasks/:taskId/messages',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = await requireSession(req, res, next)
        if (!ctx) return
        if (!requireCsrf(req, ctx, next)) return

        const body = req.body as { body?: unknown; idempotencyKey?: unknown }
        const message = await sendMessage(
          {
            weddingId: ctx.weddingId,
            taskId: String(req.params['taskId']),
            sender: { kind: 'HELPER', helperId: ctx.helperId },
            body: body?.body,
            ...(typeof body?.idempotencyKey === 'string'
              ? { idempotencyKey: body.idempotencyKey }
              : {}),
          },
          msgStore,
        )
        if (!message) {
          next(AppError.notFound('Görev bulunamadı'))
          return
        }
        /*
          YALNIZ YARDIMCI yazdığında bildirim gider (bu route'ta
          `sender.kind: 'HELPER'`). Çift kendi yazdığının bildirimini
          almamalı; yardımcının hesabı olmadığı için ona push
          gönderilemez — yani mesaj bildirimi TEK YÖNLÜ (spec §5.3).
        */
        if (deps?.notifyDeps !== undefined) {
          void notifyWeddingMembers(deps.notifyDeps, {
            weddingId: ctx.weddingId,
            event: 'TASK_MESSAGE',
            actorUserId: null,
          })
        }
        res.status(201).json({ message: toHelperMessageView(message) })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  return router
}

function toHttpError(err: unknown): unknown {
  if (err instanceof NotTaskAssigneeError) {
    return AppError.notFound('Görev bulunamadı')
  }
  if (err instanceof MessageTooLongError) {
    return AppError.unprocessable(err.message)
  }
  const msg = err instanceof Error ? err.message : ''
  if (/boş olamaz|en fazla|metin olmalı/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  return err
}
