import { describe, it, expect } from 'vitest'
import { toHelperTaskView, toHelperTaskList, HELPER_TASK_FIELDS } from '../../src/tasks/helper-view.js'

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    weddingId: 'w1',
    title: 'Çiçek siparişi',
    description: 'Beyaz gül, 200 adet',
    assigneeHelperId: 'h1',
    status: 'TODO',
    priority: 'HIGH',
    dueDate: new Date('2026-08-01T10:00:00Z'),
    assignedAt: new Date('2026-07-01T10:00:00Z'),
    createdBy: 'u1',
    deletedAt: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-02T10:00:00Z'),
    ...overrides,
  }
}

const wedding = {
  id: 'w1',
  coupleNames: 'Elif & Mert',
  weddingDate: new Date('2026-09-12T19:00:00Z'),
  venueName: 'Kır Düğün Salonu',
  deletedAt: null,
}

describe('toHelperTaskView — beyaz liste', () => {
  it('başlık, açıklama, durum, öncelik döner', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v.title).toBe('Çiçek siparişi')
    expect(v.description).toBe('Beyaz gül, 200 adet')
    expect(v.status).toBe('TODO')
    expect(v.priority).toBe('HIGH')
  })

  it('çift isimleri döner (kim için çalıştığını bilsin)', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v.coupleNames).toBe('Elif & Mert')
  })

  it('düğün tarihi ve mekân döner', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v.weddingDate).toBeInstanceOf(Date)
    expect(v.venueName).toBe('Kır Düğün Salonu')
  })

  it('wedding_id DÖNMEZ', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v).not.toHaveProperty('weddingId')
    expect(JSON.stringify(v)).not.toContain('"w1"')
  })

  it('created_by DÖNMEZ', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v).not.toHaveProperty('createdBy')
    expect(JSON.stringify(v)).not.toContain('"u1"')
  })

  it('assignee_helper_id DÖNMEZ (kendisi olduğunu bilmesi yeter)', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v).not.toHaveProperty('assigneeHelperId')
    expect(JSON.stringify(v)).not.toContain('"h1"')
  })

  it('assigned_at DÖNMEZ (iç mantık)', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v).not.toHaveProperty('assignedAt')
  })

  it('deletedAt DÖNMEZ', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(v).not.toHaveProperty('deletedAt')
  })

  it('yalnızca beyaz listedeki alanlar döner', () => {
    const v = toHelperTaskView(makeTask() as never, wedding as never)!
    expect(Object.keys(v).sort()).toEqual([...HELPER_TASK_FIELDS].sort())
  })

  it('silinmiş görev null döner', () => {
    expect(
      toHelperTaskView(makeTask({ deletedAt: new Date() }) as never, wedding as never),
    ).toBeNull()
  })

  it('null görev null döner', () => {
    expect(toHelperTaskView(null, wedding as never)).toBeNull()
  })
})

describe('toHelperTaskList', () => {
  it('listeyi çevirir', () => {
    const list = toHelperTaskList(
      [makeTask(), makeTask({ id: 't2' })] as never,
      wedding as never,
    )
    expect(list).toHaveLength(2)
  })

  it('silinmişleri filtreler', () => {
    const list = toHelperTaskList(
      [makeTask(), makeTask({ id: 't2', deletedAt: new Date() })] as never,
      wedding as never,
    )
    expect(list).toHaveLength(1)
  })
})
