import { Router, type Request, type Response, type NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import {
  createTask,
  listTasks,
  updateTask,
  assignTask,
  deleteTask,
  TaskLimitError,
  NotMemberError,
  TASK_STATUSES,
} from '../tasks/service.js'
import { drizzleTaskDeps } from '../tasks/store.js'
import { sendMessage, listMessages, MessageTooLongError } from '../messages/service.js'
import { notifyWeddingMembers, type NotifyDeps } from '../notifications/service.js'
import { drizzleMessageDeps } from '../messages/store.js'
import { createRateLimit, RATE_LIMITS } from '../middleware/rate-limit.js'

/**
 * Görev ve görev sohbeti route'ları — ÇİFT tarafı.
 */
export function createTasksRouter(deps: {
  requireAuth: import('express').RequestHandler
  requireMember: (roles?: ('OWNER' | 'CO_OWNER')[]) => import('express').RequestHandler
  taskStore?: ReturnType<typeof drizzleTaskDeps>
  messageStore?: ReturnType<typeof drizzleMessageDeps>
  /**
   * Push bildirimi bağımlılıkları. Verilmezse bildirim gönderilmez —
   * mevcut router testleri push kurmadan çalışmaya devam eder.
   */
  notifyDeps?: NotifyDeps
}): Router {
  const router = Router({ mergeParams: true })
  const taskStore = deps.taskStore ?? drizzleTaskDeps()
  const msgStore = deps.messageStore ?? drizzleMessageDeps()

  router.use(deps.requireAuth)
  router.use(deps.requireMember())

  const weddingIdOf = (req: Request): string => {
    const raw = req.params['weddingId']
    return Array.isArray(raw) ? String(raw[0]) : String(raw)
  }

  // --- Görevler ---

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query as Record<string, string | undefined>
      const tasks = await listTasks(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          includeDeleted: q['includeDeleted'] === 'true',
          ...(q['status'] ? { status: q['status'] as (typeof TASK_STATUSES)[number] } : {}),
          ...(q['assigneeHelperId'] ? { assigneeHelperId: q['assigneeHelperId'] } : {}),
        },
        taskStore,
      )
      res.json({ tasks })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await createTask(
        { weddingId: weddingIdOf(req), userId: req.auth!.userId, input: req.body },
        taskStore,
      )
      res.status(201).json({ task })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  router.patch('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await updateTask(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          taskId: String(req.params['taskId']),
          patch: req.body,
        },
        taskStore,
      )
      if (!updated) {
        next(AppError.notFound('Görev bulunamadı'))
        return
      }
      /*
        `void` — ana iş akışını BLOKLAMAZ. Görev güncellemesi
        bildirimden bağımsız başarılı sayılır.
      */
      if (deps.notifyDeps !== undefined) {
        void notifyWeddingMembers(deps.notifyDeps, {
          weddingId: weddingIdOf(req),
          event: 'TASK_STATUS_CHANGED',
          actorUserId: req.auth!.userId,
        })
      }
      res.json({ task: updated })
    } catch (err) {
      next(toHttpError(err))
    }
  })

  // --- Atama (ayrı uç: assigned_at birlikte yazılmalı) ---
  router.patch(
    '/:taskId/assign',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { helperId?: unknown }
        const helperId =
          body?.helperId === null ? null : typeof body?.helperId === 'string' ? body.helperId : null

        const assigned = await assignTask(
          {
            weddingId: weddingIdOf(req),
            userId: req.auth!.userId,
            taskId: String(req.params['taskId']),
            helperId,
          },
          taskStore,
        )
        if (!assigned) {
          next(AppError.notFound('Görev bulunamadı'))
          return
        }
        if (deps.notifyDeps !== undefined) {
          void notifyWeddingMembers(deps.notifyDeps, {
            weddingId: weddingIdOf(req),
            event: 'TASK_ASSIGNED',
            actorUserId: req.auth!.userId,
          })
        }
        res.json({ task: assigned })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  router.delete('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ok = await deleteTask(
        {
          weddingId: weddingIdOf(req),
          userId: req.auth!.userId,
          taskId: String(req.params['taskId']),
        },
        taskStore,
      )
      if (!ok) {
        next(AppError.notFound('Görev bulunamadı'))
        return
      }
      res.status(204).send()
    } catch (err) {
      next(toHttpError(err))
    }
  })

  // --- Görev sohbeti (çift tarafı) ---

  router.get(
    '/:taskId/messages',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const q = req.query as Record<string, string | undefined>
        const limit = q['limit'] ? Number(q['limit']) : undefined
        const messages = await listMessages(
          {
            weddingId: weddingIdOf(req),
            taskId: String(req.params['taskId']),
            viewer: { kind: 'COUPLE', userId: req.auth!.userId },
            ...(limit !== undefined ? { limit } : {}),
            ...(q['before'] ? { before: q['before'] } : {}),
          },
          msgStore,
        )
        res.json({ messages })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  const sendLimiter = createRateLimit(RATE_LIMITS.messageSendByUser)

  router.post(
    '/:taskId/messages',
    sendLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { body?: unknown; idempotencyKey?: unknown }
        const message = await sendMessage(
          {
            weddingId: weddingIdOf(req),
            taskId: String(req.params['taskId']),
            sender: { kind: 'COUPLE', userId: req.auth!.userId },
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
          BİLDİRİM YOK: bu route'ta gönderen ÇİFT (`sender.kind: 'COUPLE'`).
          Çift kendi yazdığı mesajın bildirimini almamalı; yardımcının
          hesabı olmadığı için ona da push gönderilemez (spec §5.3 notu).
          Yardımcı → çift yönü `helper-app.ts`'te bağlanır.
        */
        res.status(201).json({ message })
      } catch (err) {
        next(toHttpError(err))
      }
    },
  )

  return router
}

export function toHttpError(err: unknown): unknown {
  if (err instanceof NotMemberError) {
    return AppError.notFound(err.message)
  }
  if (err instanceof TaskLimitError) {
    return AppError.limitReached(err.message, {
      limit: err.limit,
      current: err.current,
    })
  }
  if (err instanceof MessageTooLongError) {
    return AppError.unprocessable(err.message)
  }
  const msg = err instanceof Error ? err.message : ''
  if (/atama bu uçtan/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/geçersiz|boş olamaz|zorunlu|en fazla|en az|metin olmalı/i.test(msg)) {
    return AppError.badRequest(msg)
  }
  if (/bulunamadı|erişimi kapatılmış/i.test(msg)) {
    return AppError.conflict(msg)
  }
  return err
}
