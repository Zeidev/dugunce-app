import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { resolveHelperToken } from '../helpers/token.js'
import { toHelperTaskList } from '../tasks/helper-view.js'
import { toHelperMessageList, toHelperMessageView } from '../messages/helper-view.js'
import {
  sendMessage,
  listMessages,
  MessageTooLongError,
  NotTaskAssigneeError,
} from '../messages/service.js'
import { drizzleHelperDeps } from '../helpers/store.js'
import { drizzleTaskDeps } from '../tasks/store.js'
import { drizzleMessageDeps } from '../messages/store.js'
import { createRateLimit, RATE_LIMITS } from '../middleware/rate-limit.js'
import { corsForInvitations } from '../middleware/cors.js'

/**
 * Yardımcı uygulaması — KİMLİK DOĞRULAMASI YOK.
 *
 * Tek yetki kaynağı URL'deki token'dır. Yardımcının hesabı yoktur
 * (SECURITY §1.2), uygulama kurmaz, tarayıcıdan açar.
 *
 * KRİTİK: Her sorgu `assignee_helper_id = helperId` ile kapsamlıdır.
 * `task_id` tahmin edilse bile başkasının görevi dönmez (Review Focus #2).
 */

/** Yardımcının değiştirebileceği TEK alan. */
const ALLOWED_HELPER_PATCH = ['status'] as const

export function createHelperAppRouter(deps?: {
  helperStore?: ReturnType<typeof drizzleHelperDeps>
  taskStore?: ReturnType<typeof drizzleTaskDeps>
  messageStore?: ReturnType<typeof drizzleMessageDeps>
  rateLimit?: boolean
}): Router {
  const router = Router()
  const helperStore = deps?.helperStore ?? drizzleHelperDeps()
  const taskStore = deps?.taskStore ?? drizzleTaskDeps()
  const msgStore = deps?.messageStore ?? drizzleMessageDeps()

  router.use(corsForInvitations())

  // Cache'lenmemeli, indekslenmemeli, referrer sızdırmamalı.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  const limitEnabled = deps?.rateLimit !== false
  const viewLimiter = limitEnabled
    ? createRateLimit(RATE_LIMITS.invitationByIp)
    : (_req: Request, _res: Response, next: NextFunction) => next()
  const sendLimiter = limitEnabled
    ? createRateLimit(RATE_LIMITS.messageSendByHelper)
    : (_req: Request, _res: Response, next: NextFunction) => next()

  /** Token'ı çözer; geçersizse 404. */
  async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<{ helperId: string; weddingId: string; displayName: string; coupleNames: string } | null> {
    const token = String(req.params['token'] ?? '')
    const row = await resolveHelperToken(token, helperStore)
    if (!row) {
      next(AppError.notFound('Bağlantı geçersiz veya süresi dolmuş'))
      return null
    }
    return {
      helperId: row.id,
      weddingId: row.weddingId,
      displayName: row.displayName,
      coupleNames: row.wedding.coupleNames,
    }
  }

  // --- Kendi görevleri ---
  router.get('/:token/tasks', viewLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const who = await authenticate(req, res, next)
      if (!who) return

      // SADECE kendi görevleri — assigneeHelperId ile kapsamlı
      const tasks = await taskStore.listForHelper(who.weddingId, who.helperId)

      // Çift bilgisi (kim için çalıştığını bilsin)
      const view = toHelperTaskList(tasks, {
        id: who.weddingId,
        coupleNames: who.coupleNames,
        weddingDate: null,
        venueName: null,
        deletedAt: null,
      })

      res.json({ helperName: who.displayName, coupleNames: who.coupleNames, tasks: view })
    } catch (err) {
      next(err)
    }
  })

  // --- Görev durumu değiştir ---
  router.patch(
    '/:token/tasks/:taskId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const who = await authenticate(req, res, next)
        if (!who) return

        const body = req.body as Record<string, unknown>
        const keys = Object.keys(body ?? {})

        // Yardımcı YALNIZCA status değiştirebilir.
        if (keys.length === 0 || keys.some((k) => !ALLOWED_HELPER_PATCH.includes(k as never))) {
          next(
            AppError.badRequest(
              'Yardımcı yalnızca görev durumunu değiştirebilir',
            ),
          )
          return
        }

        const status = body['status']
        if (status !== 'TODO' && status !== 'DOING' && status !== 'DONE') {
          next(AppError.badRequest('Geçersiz durum'))
          return
        }

        // SADECE kendi görevi — `assignee_helper_id` WHERE koşulunda.
        // task_id tahmin edilse bile başkasının görevi güncellenmez.
        const updated = await taskStore.updateTaskStatusAsHelper(
          String(req.params['taskId']),
          status,
          who.helperId,
          who.weddingId,
        )
        if (!updated) {
          next(AppError.notFound('Görev bulunamadı'))
          return
        }
        res.json({ task: { id: updated.id, status: updated.status } })
      } catch (err) {
        next(err)
      }
    },
  )

  // --- Görev sohbeti ---
  router.get(
    '/:token/tasks/:taskId/messages',
    viewLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const who = await authenticate(req, res, next)
        if (!who) return

        const q = req.query as Record<string, string | undefined>
        const limit = q['limit'] ? Number(q['limit']) : undefined

        const messages = await listMessages(
          {
            weddingId: who.weddingId,
            taskId: String(req.params['taskId']),
            viewer: { kind: 'HELPER', helperId: who.helperId },
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
    '/:token/tasks/:taskId/messages',
    sendLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const who = await authenticate(req, res, next)
        if (!who) return

        const body = req.body as { body?: unknown; idempotencyKey?: unknown }
        const message = await sendMessage(
          {
            weddingId: who.weddingId,
            taskId: String(req.params['taskId']),
            sender: { kind: 'HELPER', helperId: who.helperId },
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
