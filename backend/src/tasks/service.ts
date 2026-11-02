import { z } from 'zod'

/**
 * Görev servisi — çift tarafı.
 *
 * v1: görev başına TEK sorumlu. `assignee_helper_id` tek kolon olduğu
 * için çoklu atama şemada zaten imkânsız.
 */

export const MAX_TASK_TITLE = 200
export const MAX_TASK_DESCRIPTION = 2000

export const TASK_STATUSES = ['TODO', 'DOING', 'DONE'] as const
export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const

/** Ücretsiz plan: 1 görev (tadımlık). Premium: sınırsız. */
export const FREE_TASK_LIMIT = 1

export class TaskLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(
      `Ücretsiz planda en fazla ${limit} görev oluşturabilirsiniz (şu an ${current}). ` +
        `Premium'a geçerek sınırsız görev ekleyebilirsiniz.`,
    )
    this.name = 'TaskLimitError'
  }
}

export class NotMemberError extends Error {
  constructor() {
    super('Düğün bulunamadı')
    this.name = 'NotMemberError'
  }
}

// ---------------------------------------------------------------------------
// Girdi doğrulama
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  title: z
    .string({ required_error: 'Başlık zorunlu', invalid_type_error: 'Başlık metin olmalı' })
    .trim()
    .min(1, { message: 'Başlık zorunlu' })
    .max(MAX_TASK_TITLE, { message: `Başlık en fazla ${MAX_TASK_TITLE} karakter olabilir` }),
  description: z
    .string()
    .trim()
    .max(MAX_TASK_DESCRIPTION, {
      message: `Açıklama en fazla ${MAX_TASK_DESCRIPTION} karakter olabilir`,
    })
    .optional(),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('NORMAL'),
  dueDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Geçersiz tarih' })
    .optional(),
})

export interface ValidatedTaskInput {
  title: string
  description?: string
  status: (typeof TASK_STATUSES)[number]
  priority: (typeof TASK_PRIORITIES)[number]
  dueDate?: Date
}

export function validateTaskInput(input: unknown): ValidatedTaskInput {
  const parsed = inputSchema.parse(input)

  const result: ValidatedTaskInput = {
    title: parsed.title,
    status: parsed.status,
    priority: parsed.priority,
  }
  if (parsed.description !== undefined && parsed.description !== '') {
    result.description = parsed.description
  }
  if (parsed.dueDate !== undefined) {
    result.dueDate = new Date(parsed.dueDate)
  }
  return result
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TASK_TITLE).optional(),
    description: z.string().trim().max(MAX_TASK_DESCRIPTION).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Geçersiz tarih' })
      .nullable()
      .optional(),
    // assigneeHelperId BİLİNÇLİ olarak yok — atama ayrı uçtan (assignTask)
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Güncelleme boş olamaz' })

export type TaskPatch = z.infer<typeof patchSchema>

// ---------------------------------------------------------------------------
// Depo arayüzü
// ---------------------------------------------------------------------------

export interface TaskRecord {
  id: string
  weddingId: string
  title: string
  description: string | null
  assigneeHelperId: string | null
  status: string
  priority: string
  dueDate: Date | null
  assignedAt: Date | null
  deletedAt: Date | null
}

export interface HelperSummary {
  id: string
  tokenRevokedAt: Date | null
}

export interface TaskDeps {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
  insertTask(values: Record<string, unknown>, tx: unknown): Promise<TaskRecord>
  listByWedding(
    weddingId: string,
    userId: string,
    opts: { includeDeleted?: boolean; status?: string; assigneeHelperId?: string },
  ): Promise<TaskRecord[]>
  findById(
    taskId: string,
    weddingId: string,
    userId: string,
  ): Promise<TaskRecord | null>
  updateTask(
    taskId: string,
    values: Record<string, unknown>,
    weddingId: string,
    userId: string,
    tx?: unknown,
  ): Promise<TaskRecord>
  softDelete(taskId: string): Promise<boolean>
  countTasks(tx: unknown, weddingId: string, userId: string): Promise<number>
  getPlan(tx: unknown, weddingId: string, userId: string): Promise<'FREE' | 'PREMIUM'>
  assertMember(tx: unknown, weddingId: string, userId: string): Promise<boolean>
  lockWeddingForUpdate(tx: unknown, weddingId: string): Promise<void>
  findHelper(helperId: string, weddingId: string): Promise<HelperSummary | null>
  /**
   * Yardımcının kendi görevinin durumunu günceller.
   *
   * Üyelik değil `assignee_helper_id` kontrolü yapar — yardımcının
   * hesabı olmadığı için `userId` yoktur.
   */
  updateTaskStatusAsHelper(
    taskId: string,
    status: string,
    helperId: string,
    weddingId: string,
  ): Promise<TaskRecord | null>
  /** Yardımcının kendi görevleri — üyelik değil atama ile kapsamlı. */
  listForHelper(weddingId: string, helperId: string): Promise<TaskRecord[]>
}

// ---------------------------------------------------------------------------
// İşlemler
// ---------------------------------------------------------------------------

export interface CreateTaskParams {
  weddingId: string
  userId: string
  input: unknown
}

export async function createTask(
  params: CreateTaskParams,
  deps: TaskDeps,
): Promise<TaskRecord> {
  const input = validateTaskInput(params.input)

  return deps.transaction(async (tx) => {
    const isMember = await deps.assertMember(tx, params.weddingId, params.userId)
    if (!isMember) throw new NotMemberError()

    await deps.lockWeddingForUpdate(tx, params.weddingId)

    const plan = await deps.getPlan(tx, params.weddingId, params.userId)
    if (plan === 'FREE') {
      const current = await deps.countTasks(tx, params.weddingId, params.userId)
      if (current >= FREE_TASK_LIMIT) {
        throw new TaskLimitError(FREE_TASK_LIMIT, current)
      }
    }

    return deps.insertTask(
      {
        weddingId: params.weddingId,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        createdBy: params.userId,
      },
      tx,
    )
  })
}

export interface ListTasksParams {
  weddingId: string
  userId: string
  includeDeleted?: boolean
  status?: (typeof TASK_STATUSES)[number]
  assigneeHelperId?: string
}

export async function listTasks(
  params: ListTasksParams,
  deps: Pick<TaskDeps, 'listByWedding'>,
): Promise<TaskRecord[]> {
  const opts: {
    includeDeleted?: boolean
    status?: string
    assigneeHelperId?: string
  } = { includeDeleted: params.includeDeleted === true }
  if (params.status) opts.status = params.status
  if (params.assigneeHelperId) opts.assigneeHelperId = params.assigneeHelperId

  return deps.listByWedding(params.weddingId, params.userId, opts)
}

export interface UpdateTaskParams {
  weddingId: string
  userId: string
  taskId: string
  patch: unknown
}

/**
 * Görevi günceller.
 *
 * `assigneeHelperId` bu yoldan DEĞİŞTİRİLEMEZ — atama `assignTask` ile
 * yapılır çünkü `assigned_at` de birlikte güncellenmelidir. Buradan
 * izin verilseydi `assigned_at` eski kalır ve mesaj erişim sınırı bozulur.
 *
 * @returns null — görev yoksa veya kullanıcı üye değilse (404)
 */
export async function updateTask(
  params: UpdateTaskParams,
  deps: Pick<TaskDeps, 'findById' | 'updateTask'>,
): Promise<TaskRecord | null> {
  const existing = await deps.findById(params.taskId, params.weddingId, params.userId)
  if (!existing) return null

  const raw = params.patch
  if (raw !== null && typeof raw === 'object' && 'assigneeHelperId' in raw) {
    throw new Error(
      'Atama bu uçtan değiştirilemez; PATCH /tasks/:id/assign kullanılmalı',
    )
  }

  const parsed = patchSchema.parse(raw)

  const values: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.title !== undefined) values['title'] = parsed.title
  if (parsed.status !== undefined) values['status'] = parsed.status
  if (parsed.priority !== undefined) values['priority'] = parsed.priority
  if (parsed.description !== undefined) values['description'] = parsed.description
  if (parsed.dueDate !== undefined) {
    values['dueDate'] = parsed.dueDate === null ? null : new Date(parsed.dueDate)
  }

  return deps.updateTask(params.taskId, values, params.weddingId, params.userId)
}

export interface AssignTaskParams {
  weddingId: string
  userId: string
  taskId: string
  /** null → atamayı kaldır */
  helperId: string | null
}

/**
 * Görevi yardımcıya atar.
 *
 * **KRİTİK (SECURITY §10.3 #4b):** `assigned_at` HER atamada güncellenir.
 * Mesaj erişimi bu andan sonrasıyla sınırlıdır. Güncellenmezse yeni
 * yardımcı önceki yardımcının özel konuşmasını görür — sessiz ve fark
 * edilmesi zor bir mahremiyet ihlali.
 *
 * @returns null — görev yoksa veya kullanıcı üye değilse (404)
 */
export async function assignTask(
  params: AssignTaskParams,
  deps: Pick<TaskDeps, 'findById' | 'updateTask' | 'findHelper'>,
): Promise<TaskRecord | null> {
  const existing = await deps.findById(params.taskId, params.weddingId, params.userId)
  if (!existing) return null

  if (params.helperId === null) {
    return deps.updateTask(
      params.taskId,
      { assigneeHelperId: null, assignedAt: null, updatedAt: new Date() },
      params.weddingId,
      params.userId,
    )
  }

  const helper = await deps.findHelper(params.helperId, params.weddingId)
  if (!helper) {
    throw new Error('Yardımcı bulunamadı')
  }
  if (helper.tokenRevokedAt) {
    throw new Error('Erişimi kapatılmış yardımcıya görev atanamaz')
  }

  return deps.updateTask(
    params.taskId,
    {
      assigneeHelperId: params.helperId,
      // HER atamada yenilenir — mesaj erişim sınırı buna bağlı
      assignedAt: new Date(),
      updatedAt: new Date(),
    },
    params.weddingId,
    params.userId,
  )
}

export interface DeleteTaskParams {
  weddingId: string
  userId: string
  taskId: string
}

/**
 * Görevi siler (soft delete). Mesajlar CASCADE ile fiziksel silinir.
 *
 * @returns false — görev yoksa veya kullanıcı üye değilse (404)
 */
export async function deleteTask(
  params: DeleteTaskParams,
  deps: Pick<TaskDeps, 'findById' | 'softDelete'>,
): Promise<boolean> {
  const existing = await deps.findById(params.taskId, params.weddingId, params.userId)
  if (!existing) return false
  return deps.softDelete(params.taskId)
}
