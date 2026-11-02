import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  validateHelperInput,
  createHelper,
  listHelpers,
  renameHelper,
  revokeHelper,
  deleteHelper,
  FREE_HELPER_LIMIT,
  PREMIUM_HELPER_LIMIT,
  HelperLimitError,
} from '../../src/helpers/service.js'

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
    insertHelper: vi.fn().mockResolvedValue({ id: 'h1', displayName: 'Ayşe' }),
    listByWedding: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 'h1', displayName: 'Ayşe', tokenRevokedAt: null }),
    updateHelper: vi.fn().mockResolvedValue({ id: 'h1' }),
    revokeToken: vi.fn().mockResolvedValue(true),
    deleteHelper: vi.fn().mockResolvedValue(true),
    countHelpers: vi.fn().mockResolvedValue(0),
    getPlan: vi.fn().mockResolvedValue('FREE'),
    assertMember: vi.fn().mockResolvedValue(true),
    lockWeddingForUpdate: vi.fn().mockResolvedValue(undefined),
    /** Yardımcı silinmeden önce görev atamalarını boşaltır. */
    clearTaskAssignments: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

describe('validateHelperInput', () => {
  it('isim zorunlu', () => {
    expect(() => validateHelperInput({ displayName: '' })).toThrow(/zorunlu/i)
  })

  it('isim 60 karakteri aşamaz', () => {
    expect(() => validateHelperInput({ displayName: 'a'.repeat(61) })).toThrow(/60/)
  })

  it('boşluklar kırpılır', () => {
    expect(validateHelperInput({ displayName: '  Ayşe  ' }).displayName).toBe('Ayşe')
  })

  it('Türkçe karakterler korunur', () => {
    expect(validateHelperInput({ displayName: 'Şükrü Çağrı' }).displayName).toBe('Şükrü Çağrı')
  })

  it('60 karakter kabul edilir', () => {
    expect(() => validateHelperInput({ displayName: 'a'.repeat(60) })).not.toThrow()
  })
})

describe('limit sabitleri', () => {
  it('ücretsiz 1 yardımcı', () => {
    expect(FREE_HELPER_LIMIT).toBe(1)
  })

  it('premium 5 yardımcı', () => {
    expect(PREMIUM_HELPER_LIMIT).toBe(5)
  })
})

describe('createHelper', () => {
  it('yardımcı oluşturur, ham token BİR KEZ döner', async () => {
    const d = makeDeps()
    const r = await createHelper(
      { weddingId: 'w1', userId: 'u1', input: { displayName: 'Ayşe' } },
      d,
    )
    expect(r).not.toBeNull()
    expect(r!.token).toHaveLength(43)
    expect(r!.helper.id).toBe('h1')
  })

  it('DB\'ye yalnızca hash yazılır', async () => {
    const d = makeDeps()
    const r = await createHelper(
      { weddingId: 'w1', userId: 'u1', input: { displayName: 'Ayşe' } },
      d,
    )
    const written = d.insertHelper.mock.calls[0]![0] as Record<string, unknown>
    expect(written['accessTokenHash']).toBe(sha256(r!.token))
    expect(written).not.toHaveProperty('token')
  })

  it('iki yardımcı token\'ı asla aynı olmaz', async () => {
    const d = makeDeps()
    const a = await createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: 'A' } }, d)
    const b = await createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: 'B' } }, d)
    expect(a!.token).not.toBe(b!.token)
  })

  it('ücretsiz planda 1 yardımcı sınırı', async () => {
    const d = makeDeps({ countHelpers: vi.fn().mockResolvedValue(1) })
    await expect(
      createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: 'Ayşe' } }, d),
    ).rejects.toThrow(HelperLimitError)
  })

  it('premium planda 5 yardımcı', async () => {
    const d = makeDeps({
      countHelpers: vi.fn().mockResolvedValue(4),
      getPlan: vi.fn().mockResolvedValue('PREMIUM'),
    })
    await expect(
      createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: 'Ayşe' } }, d),
    ).resolves.toBeDefined()
  })

  it('premium 5. yardımcıdan sonra reddeder', async () => {
    const d = makeDeps({
      countHelpers: vi.fn().mockResolvedValue(5),
      getPlan: vi.fn().mockResolvedValue('PREMIUM'),
    })
    await expect(
      createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: 'Ayşe' } }, d),
    ).rejects.toThrow(HelperLimitError)
  })

  it('transaction içinde çalışır', async () => {
    const d = makeDeps()
    await createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: 'Ayşe' } }, d)
    expect(d.transaction).toHaveBeenCalled()
  })

  it('üyelik kontrolü yapılır (defense in depth)', async () => {
    const d = makeDeps({ assertMember: vi.fn().mockResolvedValue(false) })
    await expect(
      createHelper({ weddingId: 'w1', userId: 'yabanci', input: { displayName: 'Ayşe' } }, d),
    ).rejects.toThrow()
    expect(d.insertHelper).not.toHaveBeenCalled()
  })

  it('geçersiz girdi yazma yapmaz', async () => {
    const d = makeDeps()
    await expect(
      createHelper({ weddingId: 'w1', userId: 'u1', input: { displayName: '' } }, d),
    ).rejects.toThrow()
    expect(d.insertHelper).not.toHaveBeenCalled()
  })
})

describe('listHelpers', () => {
  it('sorgu weddingId + userId ile (IDOR)', async () => {
    const d = makeDeps()
    await listHelpers({ weddingId: 'w1', userId: 'u1' }, d)
    expect(d.listByWedding).toHaveBeenCalledWith('w1', 'u1')
  })
})

describe('renameHelper', () => {
  it('ismi değiştirir', async () => {
    const d = makeDeps()
    const r = await renameHelper(
      { weddingId: 'w1', userId: 'u1', helperId: 'h1', displayName: 'Yeni' },
      d,
    )
    expect(r).not.toBeNull()
    expect(d.updateHelper).toHaveBeenCalled()
  })

  it('üye olunmayan yardımcı null döner (404)', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await renameHelper(
      { weddingId: 'w1', userId: 'yabanci', helperId: 'h1', displayName: 'X' },
      d,
    )
    expect(r).toBeNull()
  })
})

describe('revokeHelper', () => {
  it('token\'ı iptal eder', async () => {
    const d = makeDeps()
    const r = await revokeHelper({ weddingId: 'w1', userId: 'u1', helperId: 'h1' }, d)
    expect(r).toBe(true)
    expect(d.revokeToken).toHaveBeenCalledWith('h1')
  })

  it('üye olunmayan yardımcı iptal edilemez', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await revokeHelper({ weddingId: 'w1', userId: 'yabanci', helperId: 'h1' }, d)
    expect(r).toBe(false)
    expect(d.revokeToken).not.toHaveBeenCalled()
  })
})

describe('deleteHelper', () => {
  it('önce görev atamalarını boşaltır, sonra siler', async () => {
    const d = makeDeps()
    await deleteHelper({ weddingId: 'w1', userId: 'u1', helperId: 'h1' }, d)

    // Composite FK NO ACTION olduğu için atamalar önce boşaltılmalı
    expect(d.clearTaskAssignments).toHaveBeenCalledWith('h1', expect.anything())
    expect(d.deleteHelper).toHaveBeenCalledWith('h1', expect.anything())

    const clearOrder = d.clearTaskAssignments.mock.invocationCallOrder[0]!
    const deleteOrder = d.deleteHelper.mock.invocationCallOrder[0]!
    expect(clearOrder).toBeLessThan(deleteOrder)
  })

  it('transaction içinde (atomik)', async () => {
    const d = makeDeps()
    await deleteHelper({ weddingId: 'w1', userId: 'u1', helperId: 'h1' }, d)
    expect(d.transaction).toHaveBeenCalled()
  })

  it('üye olunmayan yardımcı silinemez', async () => {
    const d = makeDeps({ findById: vi.fn().mockResolvedValue(null) })
    const r = await deleteHelper({ weddingId: 'w1', userId: 'yabanci', helperId: 'h1' }, d)
    expect(r).toBe(false)
    expect(d.deleteHelper).not.toHaveBeenCalled()
  })
})
