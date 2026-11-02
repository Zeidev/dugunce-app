import type { TaskRecord } from './service.js'

/**
 * Yardımcıya gösterilen görev görünümü — BEYAZ LİSTE.
 *
 * Yardımcı, çiftin davetlisi gibi kimlik doğrulaması olmayan bir yüzey.
 * Tüm satırı döndürmek şunları sızdırırdı:
 * - `wedding_id` (başka uçlara zemin)
 * - `created_by` (çiftin user id'si)
 * - `assignee_helper_id` (kendisi olduğunu bilmesi yeter; id gereksiz)
 * - `assigned_at` (iç mantık — mesaj sınırı)
 *
 * Bu yüzden gövde alan alan kurulur, `...task` ASLA kullanılmaz.
 */

/** Dönen alanların tam listesi — test bunu doğrular. */
export const HELPER_TASK_FIELDS = [
  'id',
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'coupleNames',
  'weddingDate',
  'venueName',
  'createdAt',
  'updatedAt',
] as const

export interface HelperWeddingInfo {
  id: string
  coupleNames: string
  weddingDate: Date | null
  venueName: string | null
  deletedAt: Date | null
}

export interface HelperTaskView {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: Date | null
  /** Kim için çalıştığını bilsin. */
  coupleNames: string
  weddingDate: Date | null
  venueName: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Görevi yardımcıya gösterilecek hâle çevirir.
 *
 * @returns null — görev silinmişse veya yoksa
 */
export function toHelperTaskView(
  task: TaskRecord | null,
  wedding: HelperWeddingInfo,
): HelperTaskView | null {
  if (!task) return null
  if (task.deletedAt) return null

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    coupleNames: wedding.coupleNames,
    weddingDate: wedding.weddingDate,
    venueName: wedding.venueName,
    createdAt: (task as TaskRecord & { createdAt?: Date }).createdAt ?? new Date(),
    updatedAt: (task as TaskRecord & { updatedAt?: Date }).updatedAt ?? new Date(),
  }
}

/** Listeyi çevirir, silinmişleri filtreler. */
export function toHelperTaskList(
  tasks: TaskRecord[],
  wedding: HelperWeddingInfo,
): HelperTaskView[] {
  const out: HelperTaskView[] = []
  for (const t of tasks) {
    const v = toHelperTaskView(t, wedding)
    if (v) out.push(v)
  }
  return out
}
