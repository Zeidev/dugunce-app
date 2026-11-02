/**
 * Görev sohbeti servisi.
 *
 * KRİTİK (SECURITY §10.3):
 * - Mesajlar SAYFALI yüklenir (asla tamamı birden)
 * - `idempotency_key` ile tekrar gönderim kopya oluşturmaz
 * - Yardımcı, görev kendisine atandıktan SONRAKİ mesajları görür (#4b)
 * - Gövde max 4000 karakter, HTML çalıştırılmaz
 */

export const MAX_MESSAGE_LENGTH = 4000
export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 100

export class MessageTooLongError extends Error {
  constructor() {
    super(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir`)
    this.name = 'MessageTooLongError'
  }
}

export class NotTaskAssigneeError extends Error {
  constructor() {
    super('Bu görev size atanmamış')
    this.name = 'NotTaskAssigneeError'
  }
}

// ---------------------------------------------------------------------------
// Gövde doğrulama
// ---------------------------------------------------------------------------

/**
 * Mesaj gövdesini doğrular.
 *
 * HTML kaçışı BURADA yapılmaz — depolama ham metin, sunum katmanı
 * escape eder. Bu ayrım, aynı mesajın mobil uygulamada da web'de de
 * doğru görünmesini sağlar (çift kaçış olmaz).
 *
 * @throws {MessageTooLongError} 4000 karakteri aşarsa
 * @throws {Error} boşsa
 */
export function validateMessageBody(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('Mesaj metin olmalı')
  }
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error('Mesaj boş olamaz')
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new MessageTooLongError()
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// Depo arayüzü
// ---------------------------------------------------------------------------

export type Sender =
  | { kind: 'COUPLE'; userId: string }
  | { kind: 'HELPER'; helperId: string }

export type Viewer =
  | { kind: 'COUPLE'; userId: string }
  | { kind: 'HELPER'; helperId: string }

export interface MessageRecord {
  id: string
  weddingId: string
  taskId: string
  senderKind: string
  senderUserId: string | null
  senderHelperId: string | null
  body: string
  createdAt: Date
}

export interface TaskForMessages {
  id: string
  weddingId: string
  assigneeHelperId: string | null
  assignedAt: Date | null
  deletedAt: Date | null
}

export interface ListMessagesOptions {
  /** Bu tarihten SONRAKİ mesajlar. Yardımcı için assigned_at. */
  since: Date | null
  limit: number
  before: string | null
}

export interface MessageDeps {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
  insertMessage(values: Record<string, unknown>, tx: unknown): Promise<MessageRecord>
  findByIdempotencyKey(
    taskId: string,
    key: string,
  ): Promise<MessageRecord | null>
  listByTask(
    weddingId: string,
    taskId: string,
    opts: ListMessagesOptions,
  ): Promise<MessageRecord[]>
  findTask(taskId: string, weddingId: string): Promise<TaskForMessages | null>
}

// ---------------------------------------------------------------------------
// Gönderme
// ---------------------------------------------------------------------------

export interface SendMessageParams {
  weddingId: string
  taskId: string
  sender: Sender
  body: unknown
  /** Aynı key ile tekrar gönderim kopya oluşturmaz. */
  idempotencyKey?: string
}

/**
 * Göreve mesaj gönderir.
 *
 * `senderKind` SUNUCUDA belirlenir, istemciden alınmaz — aksi halde
 * yardımcı kendini "çift" olarak gösterebilirdi.
 *
 * @returns null — görev yoksa veya silinmişse (404)
 */
export async function sendMessage(
  params: SendMessageParams,
  deps: MessageDeps,
): Promise<MessageRecord | null> {
  const body = validateMessageBody(params.body)

  const task = await deps.findTask(params.taskId, params.weddingId)
  if (!task || task.deletedAt) return null

  // Yardımcı yalnızca kendi görevine yazabilir
  if (params.sender.kind === 'HELPER') {
    if (task.assigneeHelperId !== params.sender.helperId) {
      throw new NotTaskAssigneeError()
    }
  }

  // İdempotency: aynı key varsa mevcut mesajı döndür
  if (params.idempotencyKey) {
    const existing = await deps.findByIdempotencyKey(
      params.taskId,
      params.idempotencyKey,
    )
    if (existing) return existing
  }

  return deps.transaction(async (tx) =>
    deps.insertMessage(
      {
        weddingId: params.weddingId,
        taskId: params.taskId,
        senderKind: params.sender.kind,
        senderUserId: params.sender.kind === 'COUPLE' ? params.sender.userId : null,
        senderHelperId: params.sender.kind === 'HELPER' ? params.sender.helperId : null,
        body,
        idempotencyKey: params.idempotencyKey ?? null,
      },
      tx,
    ),
  )
}

// ---------------------------------------------------------------------------
// Listeleme
// ---------------------------------------------------------------------------

export interface ListMessagesParams {
  weddingId: string
  taskId: string
  viewer: Viewer
  /** Sayfa boyutu. Varsayılan 30, azami 100. */
  limit?: number
  /** Bu mesaj id'sinden ÖNCEKİLER (yeniden eskiye sayfalama). */
  before?: string
}

/**
 * Görevin mesajlarını sayfalı listeler.
 *
 * **KRİTİK (SECURITY §10.3 #4b):** Yardımcı YALNIZCA kendi atama anından
 * (`task.assigned_at`) sonraki mesajları görür. Görev el değiştirdiyse
 * yeni yardımcı önceki yardımcının özel konuşmasını GÖRMEZ.
 *
 * Çift için sınır YOKTUR — tüm konuşmayı görür.
 *
 * @returns [] — görev yoksa, silinmişse veya yardımcı atanmamışsa
 */
export async function listMessages(
  params: ListMessagesParams,
  deps: Pick<MessageDeps, 'findTask' | 'listByTask'>,
): Promise<MessageRecord[]> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Sayfa boyutu en az 1 olmalı')
  }
  const effectiveLimit = Math.min(limit, MAX_PAGE_SIZE)

  const task = await deps.findTask(params.taskId, params.weddingId)
  if (!task || task.deletedAt) return []

  // --- Görünürlük sınırı ---
  let since: Date | null = null

  if (params.viewer.kind === 'HELPER') {
    // Yardımcı yalnızca KENDİ görevini görür
    if (task.assigneeHelperId !== params.viewer.helperId) {
      return []
    }
    // Atanmamış görevin mesajı yardımcıya görünmez
    if (!task.assignedAt) {
      return []
    }
    since = task.assignedAt
  }

  return deps.listByTask(params.weddingId, params.taskId, {
    since,
    limit: effectiveLimit,
    before: params.before ?? null,
  })
}
