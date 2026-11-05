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

describe('sizdirmazlik — TEST EDILMEMIS OLAN KRITIK NOKTALAR', () => {
  it('olmayan e-posta yolu ARGON2 MALIYETI oder (zamanlama sizmasin)', async () => {
    // NEDEN: dummy verify silinirse "olmayan e-posta" yolu argon2'yi
    // atlar ve ~20ms yerine ~0.03ms doner — saldirgan hangi e-postanin
    // kayitli oldugunu TEK istekle olcer.
    //
    // ESM'de `vi.spyOn` modul ad alanini yamamaz; bu yuzden davranisi
    // ZAMANLA dogruluyoruz: yol argon2 maliyeti odemeli.
    deps.findAdminByEmail.mockResolvedValue(null)

    const t0 = performance.now()
    await loginAdmin({ email: 'yok@t.local', password: 'herhangi-bir-sey' }, deps)
    const elapsed = performance.now() - t0

    // Argon2id varsayilan parametrelerde ~10-30ms. Dummy verify YOKSA
    // bu yol <1ms doner. Esik 5ms: gurultuye dayanikli, sizintiyi yakalar.
    expect(elapsed).toBeGreaterThan(5)
  })

  it('KILITLI hesapta recordSuccess CAGRILMAZ', async () => {
    // NEDEN: kilitliyken recordSuccess cagirilirsa failedAttempts
    // sifirlanir ve kilit fiilen kalkar — saldiri kolaylasir.
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    })
    await expect(
      loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps),
    ).rejects.toBeInstanceOf(AccountLockedError)
    expect(deps.recordSuccess).not.toHaveBeenCalled()
  })

  it('ASKIYA ALINMIS hesapta recordSuccess CAGRILMAZ', async () => {
    deps.findAdminByEmail.mockResolvedValue({
      ...(await deps.findAdminByEmail()),
      status: 'SUSPENDED',
    })
    await expect(
      loginAdmin({ email: 'owner@t.local', password: 'guclu-parola-123' }, deps),
    ).rejects.toBeInstanceOf(AccountSuspendedError)
    expect(deps.recordSuccess).not.toHaveBeenCalled()
  })

  it('yanlis parolada recordSuccess CAGRILMAZ', async () => {
    await loginAdmin({ email: 'owner@t.local', password: 'yanlis' }, deps)
    expect(deps.recordSuccess).not.toHaveBeenCalled()
  })

  it('email NFC + kucuk harfe normalize edilir (Turkce I sorunu)', async () => {
    // "İSMAİL@T.LOCAL" -> toLowerCase -> "i̇smail@t.local" (i + U+0307).
    // NFC bunu "ismail"e cevirmez ama en azindan TUTARLI olmali:
    // ayni normalize hem yazimda hem okumada uygulanir.
    deps.findAdminByEmail.mockResolvedValue(null)
    await loginAdmin({ email: '  OWNER@T.LOCAL  ', password: 'x' }, deps)
    const called = deps.findAdminByEmail.mock.calls[0][0] as string
    expect(called).toBe(called.trim())
    expect(called).toBe(called.toLowerCase())
    expect(called).toBe(called.normalize('NFC'))
  })

  it('NFD yazilmis e-postayi NFC ye cevirip ARAR (okuma tarafi)', async () => {
    // NEDEN AYRI TEST: yukarıdaki test `normalize` çağrısının VAR olduğunu
    // ölçer ama girdisinde birleşik işaret olmadığı için dönüşümü KANITLAMAZ
    // (no-op). Yazma tarafı NFC uygulayıp okuma tarafı uygulamasaydı hesap
    // NFD ile açılır, NFC ile ASLA bulunamazdı — sessiz, teşhisi zor hata.
    const nfd = 's\u0327eyma@t.local' // s + birleşik çengel
    const nfc = 'şeyma@t.local' // tek kod noktası
    expect(nfd).not.toBe(nfc)
    expect(nfd.normalize('NFC')).toBe(nfc)

    deps.findAdminByEmail.mockResolvedValue(null)
    await loginAdmin({ email: nfd, password: 'x' }, deps)
    expect(deps.findAdminByEmail).toHaveBeenCalledWith(nfc)
  })
})

describe('zamanlama simetrisi — yazma sayisi esit', () => {
  it('olmayan e-posta ve yanlis parola AYNI sayida DB yazimi yapar', async () => {
    // NEDEN: yanlış-parola yolu recordFailedAttempt + audit (2 yazma);
    // "hesap yok" yolu yalnız audit (1 yazma) yaparsa, gerçekçi bir
    // gidiş-dönüşte ~1.4ms fark oluşur ve örneklemeyle ölçülebilir —
    // saldırgan hesabın VAR olduğunu anlar.
    deps.findAdminByEmail.mockResolvedValue(null)
    await loginAdmin({ email: 'yok@t.local', password: 'x' }, deps)
    const unknownWrites = deps.recordFailedAttempt.mock.calls.length
    const unknownAudits = deps.writeAudit.mock.calls.length

    deps.recordFailedAttempt.mockClear()
    deps.writeAudit.mockClear()
    deps.findAdminByEmail.mockResolvedValue({
      id: 'a1', email: 'owner@t.local', displayName: 'O',
      passwordHash: await hashPassword('dogru-parola-1234'),
      role: 'SUPER_ADMIN', status: 'ACTIVE',
      failedAttempts: 0, lockedUntil: null, lastLoginAt: null,
    })
    await loginAdmin({ email: 'owner@t.local', password: 'yanlis' }, deps)
    const badPwWrites = deps.recordFailedAttempt.mock.calls.length
    const badPwAudits = deps.writeAudit.mock.calls.length

    expect(unknownWrites).toBe(badPwWrites)
    expect(unknownAudits).toBe(badPwAudits)
  })
})
