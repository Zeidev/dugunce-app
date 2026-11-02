/**
 * Mesaj beyaz listesi — yardımcıya ham satır DÖNMEMELİ.
 *
 * Ham satır `wedding_id`, `task_id`, `sender_user_id`, `sender_helper_id`
 * taşır. Yardımcıya bunların hiçbiri gerekmez; yalnızca kim yazdı (rol
 * olarak) ve ne zaman.
 */

import { describe, it, expect } from 'vitest'
import { toHelperMessageView, HELPER_MESSAGE_FIELDS } from '../../src/messages/helper-view.js'

function makeMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    weddingId: 'w1',
    taskId: 't1',
    senderKind: 'COUPLE',
    senderUserId: 'u1',
    senderHelperId: null,
    body: 'Merhaba',
    createdAt: new Date('2026-07-01T10:00:00Z'),
    ...overrides,
  }
}

describe('toHelperMessageView', () => {
  it('id, senderKind, body, createdAt döner', () => {
    const v = toHelperMessageView(makeMsg() as never)!
    expect(v.id).toBe('m1')
    expect(v.senderKind).toBe('COUPLE')
    expect(v.body).toBe('Merhaba')
    expect(v.createdAt).toBeInstanceOf(Date)
  })

  it('wedding_id DÖNMEZ', () => {
    const v = toHelperMessageView(makeMsg() as never)!
    expect(JSON.stringify(v)).not.toContain('"w1"')
  })

  it('task_id DÖNMEZ', () => {
    const v = toHelperMessageView(makeMsg() as never)!
    expect(JSON.stringify(v)).not.toContain('"t1"')
  })

  it('sender_user_id DÖNMEZ (çiftin kimliği)', () => {
    const v = toHelperMessageView(makeMsg() as never)!
    expect(JSON.stringify(v)).not.toContain('"u1"')
  })

  it('sender_helper_id DÖNMEZ', () => {
    const v = toHelperMessageView(makeMsg({ senderHelperId: 'h9' }) as never)!
    expect(JSON.stringify(v)).not.toContain('"h9"')
  })

  it('yalnızca beyaz listedeki alanlar', () => {
    const v = toHelperMessageView(makeMsg() as never)!
    expect(Object.keys(v).sort()).toEqual([...HELPER_MESSAGE_FIELDS].sort())
  })

  it('null mesaj null döner', () => {
    expect(toHelperMessageView(null)).toBeNull()
  })
})
