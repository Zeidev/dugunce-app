import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loginAdmin, AccountLockedError, AccountSuspendedError, hashPassword } from '../../src/admin/service.js'

let deps: any

beforeEach(async () => {
  const hash = await hashPassword('guclu-parola-123')
  deps = {
    findAdminByEmail: vi.fn().mockResolvedValue({
      id: 'a1', email: 'owner@t.local', displayName: 'Owner',
      passwordHash: hash, role: 'SUPER_ADMIN', status: 'ACTIVE',
      failedAttempts: 0, lockedUntil: null, lastLoginAt: null,
    }),
    recordFailedAttempt: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({ id: 's1' }),
    findSessionByHash: vi.fn(),
    touchSession: vi.fn(),
    deleteSession: vi.fn(),
    writeAudit: vi.fn().mockResolvedValue(undefined),
  }
})

describe('loginAdmin', () => {
  it('dogru parola ile giris basarili', async () => {
    const r = await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(r).not.toBeNull()
    expect(r!.admin.email).toBe('owner@t.local')
    expect(deps.recordSuccess).toHaveBeenCalledWith('a1')
  })

  it('yanlis parola null doner ve deneme sayaci artar', async () => {
    const r = await loginAdmin({ email: 'owner@t.local', password: 'yanlis' }, deps)
    expect(r).toBeNull()
    expect(deps.recordFailedAttempt).toHaveBeenCalled()
  })

  it('OLMAYAN e-posta ile YANLIS PAROLA ayni sonucu verir (sizdirmaz)', async () => {
    deps.findAdminByEmail.mockResolvedValue(null)
    const a = await loginAdmin({ email: 'yok@t.local', password: 'herhangi' }, deps)
    expect(a).toBeNull()
    // Aynı hata tipi/mesajı — e-posta varlığı sızmaz.
  })

  it('askiya alinmis hesap giris yapamaz', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      status: 'SUSPENDED',
    })
    await expect(
      loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps),
    ).rejects.toBeInstanceOf(AccountSuspendedError)
  })

  it('kilitli hesap DOGRU parolayla bile reddedilir', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    })
    await expect(
      loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps),
    ).rejects.toBeInstanceOf(AccountLockedError)
  })

  it('kilit suresi dolmussa giris yapilabilir', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    })
    const r = await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(r).not.toBeNull()
  })

  it('donen admin nesnesi parola hash i ICERMEZ', async () => {
    const r = await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(JSON.stringify(r)).not.toContain('argon2')
    expect(r!.admin).not.toHaveProperty('passwordHash')
  })

  it('giris audit e yazilir', async () => {
    await loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps)
    expect(deps.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_LOGIN', actorType: 'ADMIN', actorId: 'a1' }),
    )
  })

  it('basarisiz giris de audit e yazilir', async () => {
    await loginAdmin({ email: 'owner@t.local', password: 'yanlis' }, deps)
    expect(deps.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_LOGIN_FAILED' }),
    )
  })
})
