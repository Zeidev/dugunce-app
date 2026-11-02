import { describe, it, expect, vi } from 'vitest'
import {
  validateTaskInput,
  createTask,
  listTasks,
  updateTask,
  assignTask,
  deleteTask,
  FREE_TASK_LIMIT,
  TaskLimitError,
} from '../../src/tasks/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
    insertTask: vi.fn().mockResolvedValue({ id: 't1', title: 'Görev', status: 'TODO' }),
    listByWedding: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 't1', title: 'Görev', assigneeHelperId: null }),
    updateTask: vi.fn().mockResolvedValue({ id: 't1' }),
    softDelete: vi.fn().mockResolvedValue(true),
    countTasks: vi.fn().mockResolvedValue(0),
    getPlan: vi.fn().mockResolvedValue('FREE'),
    assertMember: vi.fn().mockResolvedValue(true),
    lockWeddingForUpdate: vi.fn().mockResolvedValue(undefined),
    findHelper: vi.fn().mockResolvedValue({ id: 'h1', tokenRevokedAt: null }),
    ...overrides,
  }
}

describe('validateTaskInput', () => {
  it('başlık zorunlu', () => {
    expect(() => validateTaskInput({ title: '' })).toThrow(/zorunlu/i)
  })

  it('başlık 200 karakteri aşamaz', () => {
    expect(() => validateTaskInput({ title: 'a'.repeat(201) })).toThrow(/200/)
  })

  it('açıklama 2000 karakteri aşamaz', () => {
    expect(() =>
      validateTaskInput({ title: 'X', description: 'a'.repeat(2001) }),
    ).toThrow(/2000/)
  })

  it('status varsayılan TODO', () => {
    expect(validateTaskInput({ title: 'X' }).status).toBe('TODO')
  })

  it('geçersiz status reddedilir', () => {
    expect(() => validateTaskInput({ title: 'X', status: 'BELKI' })).toThrow()
  })

  it('priority varsayılan NORMAL', () => {
    expect(validateTaskInput({ title: 'X' }).priority).toBe('NORMAL')
  })

  it('geçersiz priority reddedilir', () => {
    expect(() => validateTaskInput({ title: 'X', priority: 'ACIL' })).toThrow()
  })

  it('Türkçe karakterler korunur', () => {
    expect(validateTaskInput({ title: 'Çiçek siparişi' }).title).toBe('Çiçek siparişi')
  })
})

describe('limit sabitleri', () => {
  it('ücretsiz 1 görev', () => {
    expect(FREE_TASK_LIMIT).toBe(1)
  })
})

describe('createTask', () => {
  it('görev oluşturur', async () => {
    const d = makeDeps()
    const t = await createTask(
      { weddingId: 'w1', userId: 'u1', input: { title: 'Çiçek' } },
      d,
    )
    expect(t.id).toBe('t1')
    expect(d.insertTask).toHaveBeenCalled()
  })

  it('ücretsiz planda 1 görev sınırı', async () => {
    const d = makeDeps({ countTasks: vi.fn().mockResolvedValue(1) })
    await expect(
      createTask({ weddingId: 'w1', userId: 'u1', input: { title: 'X' } }, d),
    ).rejects.toThrow(TaskLimitError)
  })

  it('premium planda sınırsız', async () => {
    const d = makeDeps({
      countTasks: vi.fn().mockResolvedValue(500),
      getPlan: vi.fn().mockResolvedValue('PREMIUM'),
    })
    await expect(
      createTask({ weddingId: 'w1', userId: 'u1', input: { title: 'X' } }, d),
    ).resolves.toBeDefined()
  })

  it('üyelik kontrolü (defense in depth)', async () => {
    const d = makeDeps({ assertMember: vi.fn().mockResolvedValue(false) })
    await expect(
      createTask({ weddingId: 'w1', userId: 'yabanci', input: { title: 'X' } }, d),
    ).rejects.toThrow()
    expect(d.insertTask).not.toHaveBeenCalled()
  })
})

describe('assignTask — assigned_at kritik', () => {
  it('atama yapılınca assigned_at YAZILIR', async () => {
    const d = makeDeps()
    await assignTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', helperId: 'h1' }, d)
    const values = d.updateTask.mock.calls[0]![1] as Record<string, unknown>
    expect(values['assignedAt']).toBeInstanceOf(Date)
    expect(values['assigneeHelperId']).toBe('h1')
  })

  it('YENİDEN atamada assigned_at GÜNCELLENİR (Review Focus #1)', async () => {
    // Eski atama zamanı korunursa yeni yardımcı önceki konuşmayı görür
    const d = makeDeps({
      findById: vi.fn().mockResolvedValue({
        id: 't1',
        assigneeHelperId: 'h-eski',
        assignedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    })
    await assignTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', helperId: 'h-yeni' }, d)

    const values = d.updateTask.mock.calls[0]![1] as Record<string, unknown>
    const newAssignedAt = values['assignedAt'] as Date
    expect(newAssignedAt.getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00Z').getTime(),
    )
  })

  it('atama kaldırılınca assigned_at NULL olur', async () => {
    const d = makeDeps()
    await assignTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', helperId: null }, d)
    const values = d.updateTask.mock.calls[0]![1] as Record<string, unknown>
    expect(values['assignedAt']).toBeNull()
    expect(values['assigneeHelperId']).toBeNull()
  })

  it('revoke edilmiş yardımcıya atanamaz', async () => {
    const d = makeDeps({
      findHelper: vi.fn().mockResolvedValue({ id: 'h1', tokenRevokedAt: new Date() }),
    })
    await expect(
      assignTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', helperId: 'h1' }, d),
    ).rejects.toThrow(/erişimi kapatılmış/i)
  })

  it('başka düğünün yardımcısı bulunamaz', async () => {
    const d = makeDeps({ findHelper: vi.fn().mockResolvedValue(null) })
    await expect(
      assignTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', helperId: 'h-yabanci' }, d),
    ).rejects.toThrow(/bulunamadı/i)
  })

  it('üye olunmayan görev null döner (404)', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await assignTask(
      { weddingId: 'w1', userId: 'yabanci', taskId: 't1', helperId: 'h1' },
      d,
    )
    expect(r).toBeNull()
  })
})

describe('updateTask', () => {
  it('status değiştirir', async () => {
    const d = makeDeps()
    await updateTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', patch: { status: 'DOING' } }, d)
    expect(d.updateTask).toHaveBeenCalled()
  })

  it('geçersiz status reddedilir', async () => {
    const d = makeDeps()
    await expect(
      updateTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', patch: { status: 'X' } }, d),
    ).rejects.toThrow()
  })

  it('boş patch hata fırlatır', async () => {
    const d = makeDeps()
    await expect(
      updateTask({ weddingId: 'w1', userId: 'u1', taskId: 't1', patch: {} }, d),
    ).rejects.toThrow(/boş/i)
  })

  it('üye olunmayan görev null döner', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await updateTask(
      { weddingId: 'w1', userId: 'yabanci', taskId: 't1', patch: { status: 'DONE' } },
      d,
    )
    expect(r).toBeNull()
  })

  it('assignee bu yoldan değiştirilemez (assignTask kullanılmalı)', async () => {
    const d = makeDeps()
    await expect(
      updateTask(
        { weddingId: 'w1', userId: 'u1', taskId: 't1', patch: { assigneeHelperId: 'h2' } },
        d,
      ),
    ).rejects.toThrow(/atama/i)
  })
})

describe('deleteTask', () => {
  it('soft delete çağırır', async () => {
    const d = makeDeps()
    const ok = await deleteTask({ weddingId: 'w1', userId: 'u1', taskId: 't1' }, d)
    expect(ok).toBe(true)
    expect(d.softDelete).toHaveBeenCalledWith('t1')
  })

  it('üye olunmayan görev silinemez', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const ok = await deleteTask({ weddingId: 'w1', userId: 'yabanci', taskId: 't1' }, d)
    expect(ok).toBe(false)
    expect(d.softDelete).not.toHaveBeenCalled()
  })
})
