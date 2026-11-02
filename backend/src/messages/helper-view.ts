import type { MessageRecord } from './service.js'

/**
 * Yardımcıya gösterilen mesaj görünümü — BEYAZ LİSTE.
 *
 * Ham satır `wedding_id`, `task_id`, `sender_user_id`, `sender_helper_id`
 * taşır. Yardımcıya hiçbiri gerekmez; yalnızca kim yazdı (rol olarak)
 * ve ne zaman.
 */

export const HELPER_MESSAGE_FIELDS = [
  'id',
  'senderKind',
  'body',
  'createdAt',
] as const

export interface HelperMessageView {
  id: string
  /** COUPLE | HELPER — istemci "Siz" / çift adı olarak gösterir. */
  senderKind: string
  body: string
  createdAt: Date
}

export function toHelperMessageView(
  message: MessageRecord | null,
): HelperMessageView | null {
  if (!message) return null
  return {
    id: message.id,
    senderKind: message.senderKind,
    body: message.body,
    createdAt: message.createdAt,
  }
}

export function toHelperMessageList(messages: MessageRecord[]): HelperMessageView[] {
  const out: HelperMessageView[] = []
  for (const m of messages) {
    const v = toHelperMessageView(m)
    if (v) out.push(v)
  }
  return out
}
