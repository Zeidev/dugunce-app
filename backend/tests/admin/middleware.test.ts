import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequireAdmin, requireRole } from '../../src/admin/middleware.js'
import { ADMIN_SESSION_COOKIE, SESSION_IDLE_MS } from '../../src/admin/session.js'
import { hashToken } from '../../src/lib/crypto.js'

/**
 * Admin oturum middleware'i — iki kimlik evreninin AYRILIĞI.
 *
 * Bu dosya güvenlik açısından kritiktir: buradaki bir gevşeme, yardımcı
 * (kullanıcı) kimliğiyle admin paneline giriş demektir (tam yetki
 * sızıntısı). Bu yüzden brief'teki 7 testin yanına, brief'te test
 * edilmeyen üç zorunlu davranış için ek testler konuldu:
 * boşta kalma zaman aşımı, kayan pencere ve token'ın hash'lenerek
 * aranması.
 */

function makeReq(cookieHeader?: string, csrfHeader?: string, method = 'GET') {
  return {
    method,
    headers: { cookie: cookieHeader, 'x-csrf-token': csrfHeader },
  } as any
}

function makeRes() {
  const res: any = { statusCode: 200, headers: {}, body: null }
  res.status = (c: number) => { res.statusCode = c; return res }
  res.json = (b: unknown) => { res.body = b; return res }
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res }
  res.end = () => res
  return res
}

describe('createRequireAdmin', () => {
  let deps: any
  let next: any

  beforeEach(() => {
    deps = {
      findSessionByHash: vi.fn(),
      touchSession: vi.fn().mockResolvedValue(undefined),
      // DİKKAT: brief'in mock'unda `deleteSession` YOKTU, ama askıya alma
      // testi `deps.deleteSession`'ın çağrıldığını doğruluyor — mock'ta
      // olmadan o test çalıştırılamaz (TypeError). Eklendi.
      deleteSession: vi.fn().mockResolvedValue(undefined),
      findAdminById: vi.fn().mockResolvedValue({
        id: 'a1', email: 'owner@t.local', role: 'SUPER_ADMIN', status: 'ACTIVE',
      }),
    }
    next = vi.fn()
  })

  it('cookie YOKSA 401 — admin ucuna erisilemez', async () => {
    const mw = createRequireAdmin(deps)
    const res = makeRes()
    await mw(makeReq(), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('KULLANICI bearer token i admin ucuna YETMEZ', async () => {
    // Kullanıcı token'ı `Authorization` başlığında; admin yalnız cookie
    // okur. Bearer varsa bile cookie yoksa 401.
    const mw = createRequireAdmin(deps)
    const req = makeReq(undefined, undefined)
    req.headers.authorization = 'Bearer kullanici-tokeni'
    const res = makeRes()
    await mw(req, res, next)
    expect(res.statusCode).toBe(401)
  })

  it('gecerli oturum req.admin doldurur', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    const mw = createRequireAdmin(deps)
    const req = makeReq(`${ADMIN_SESSION_COOKIE}=tok`)
    const res = makeRes()
    await mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.admin).toMatchObject({ adminId: 'a1', role: 'SUPER_ADMIN' })
  })

  it('suresi dolmus oturum 401', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() - 1000),
      lastUsedAt: new Date(),
    })
    const mw = createRequireAdmin(deps)
    const res = makeRes()
    await mw(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(401)
  })

  it('ASKIYA ALINMIS admin in MEVCUT oturumu da 401 (Review Focus #2)', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    deps.findAdminById.mockResolvedValue({
      id: 'a1', email: 'owner@t.local', role: 'SUPER_ADMIN', status: 'SUSPENDED',
    })
    const mw = createRequireAdmin(deps)
    const res = makeRes()
    await mw(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(403)
    expect(deps.deleteSession).toHaveBeenCalledWith('s1')
  })
})

describe('requireRole', () => {
  // DİKKAT: brief'te `next` bir önceki describe'ın içinde tanımlıydı,
  // burada kapsam dışı kalıyordu (ReferenceError). Burada tanımlandı.
  let next: any
  beforeEach(() => { next = vi.fn() })

  it('rol uyusmazsa 403', () => {
    const res = makeRes()
    requireRole('SUPER_ADMIN')({ admin: { role: 'VIEWER' } } as any, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('rol uyusursa gecer', () => {
    const n = vi.fn()
    requireRole('SUPER_ADMIN')({ admin: { role: 'SUPER_ADMIN' } } as any, makeRes(), n)
    expect(n).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Brief'te test edilmeyen ZORUNLU davranışlar (görev tanımı md. 2-4)
// ---------------------------------------------------------------------------

describe('createRequireAdmin — oturum ömrü', () => {
  let deps: any
  let next: any

  beforeEach(() => {
    deps = {
      findSessionByHash: vi.fn(),
      touchSession: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      findAdminById: vi.fn().mockResolvedValue({
        id: 'a1', email: 'owner@t.local', role: 'SUPER_ADMIN', status: 'ACTIVE',
      }),
    }
    next = vi.fn()
  })

  it('BOŞTA kalma süresi (30dk) aşılırsa 401', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 8 * 3_600_000),
      lastUsedAt: new Date(Date.now() - SESSION_IDLE_MS - 1_000),
    })
    const res = makeRes()
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('token HAM değil HASH ile aranır', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), makeRes(), next)
    expect(deps.findSessionByHash).toHaveBeenCalledWith(hashToken('tok'))
    expect(deps.findSessionByHash).not.toHaveBeenCalledWith('tok')
  })

  it('oturum kaydı yoksa 401', async () => {
    deps.findSessionByHash.mockResolvedValue(null)
    const res = makeRes()
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('admin silinmişse 401 ve oturum silinir', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    deps.findAdminById.mockResolvedValue(null)
    const res = makeRes()
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.statusCode).toBe(401)
    expect(deps.deleteSession).toHaveBeenCalledWith('s1')
  })

  it('askıya alınan oturum ACCOUNT_SUSPENDED koduyla 403 döner', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    deps.findAdminById.mockResolvedValue({
      id: 'a1', email: 'owner@t.local', role: 'SUPER_ADMIN', status: 'SUSPENDED',
    })
    const res = makeRes()
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(res.body?.error?.code).toBe('ACCOUNT_SUSPENDED')
    expect(next).not.toHaveBeenCalled()
  })

  it('401 yanıtı token içermez', async () => {
    const res = makeRes()
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=gizli-token`), res, next)
    expect(JSON.stringify(res.body)).not.toContain('gizli-token')
  })

  it('KAYAN PENCERE: 25dk eşiği geçilince touchSession çağrılır', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 7 * 3_600_000),
      lastUsedAt: new Date(Date.now() - 26 * 60 * 1000),
    })
    const res = makeRes()
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, next)
    expect(next).toHaveBeenCalled()
    expect(deps.touchSession).toHaveBeenCalledTimes(1)
    const [id, expiresAt] = deps.touchSession.mock.calls[0]
    expect(id).toBe('s1')
    // Yeni bitiş ~ now + 30dk (mutlak tavan uzak olduğu için sınırlamaz)
    expect((expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + SESSION_IDLE_MS - 5_000)
  })

  it('KAYAN PENCERE mutlak tavanı (expiresAt) AŞMAZ', async () => {
    const absoluteCap = new Date(Date.now() + 10 * 60 * 1000)
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: absoluteCap,
      lastUsedAt: new Date(Date.now() - 26 * 60 * 1000),
    })
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), makeRes(), next)
    expect(deps.touchSession).toHaveBeenCalledWith('s1', absoluteCap)
  })

  it('TAZE oturumda touchSession çağrılmaz (yazma yükü)', async () => {
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(Date.now() - 60_000),
    })
    await createRequireAdmin(deps)(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), makeRes(), next)
    expect(deps.touchSession).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('Bearer VARSA DA oturum ÇEREZDEN çözülür — bearer değeri hiç kullanılmaz', async () => {
    // Bu test, "bearer'a düşme" (fallback) regresyonunu yakalar: çerez
    // geçerliyken bile arama YALNIZ çerez değerinin hash'i ile yapılmalı.
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    const req = makeReq(`${ADMIN_SESSION_COOKIE}=cerez-tokeni`)
    req.headers.authorization = 'Bearer bearer-tokeni'
    await createRequireAdmin(deps)(req, makeRes(), next)
    expect(deps.findSessionByHash).toHaveBeenCalledWith(hashToken('cerez-tokeni'))
    expect(deps.findSessionByHash).not.toHaveBeenCalledWith(hashToken('bearer-tokeni'))
    expect(next).toHaveBeenCalled()
  })

  it('SADECE Bearer varsa DB ye HİÇ gidilmez (fallback regresyonu)', async () => {
    // Brief'in testinde `findSessionByHash` mock'u boş döndüğü için,
    // "çerez yoksa bearer'a düş" hatası da 401 verir ve testi GEÇERDİ.
    // Burada mock GEÇERLİ bir oturum döndürüyor: fallback varsa istek
    // 200/next() ile geçer, yoksa 401'de kalır. Ayrıca DB'ye hiç
    // gidilmemesi, bearer'ın hiç okunmadığının kanıtıdır.
    deps.findSessionByHash.mockResolvedValue({
      id: 's1', adminId: 'a1',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: new Date(),
    })
    const req = makeReq(undefined, undefined)
    req.headers.authorization = 'Bearer kullanici-tokeni'
    const res = makeRes()
    await createRequireAdmin(deps)(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
    expect(deps.findSessionByHash).not.toHaveBeenCalled()
  })

  it('bozuk çerez başlığı 401 (çökme yok)', async () => {
    const res = makeRes()
    await createRequireAdmin(deps)(
      makeReq(`${ADMIN_SESSION_COOKIE}=%E0%A4%A`), res, next,
    )
    expect(res.statusCode).toBe(401)
  })
})

describe('requireRole — eksik bağlam', () => {
  it('req.admin yoksa 403', () => {
    const res = makeRes()
    requireRole('SUPER_ADMIN')({} as any, res, vi.fn())
    expect(res.statusCode).toBe(403)
  })
})
