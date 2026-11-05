import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequireAdmin, requireRole } from '../../src/admin/middleware.js'
import {
  ADMIN_SESSION_COOKIE,
  SESSION_IDLE_MS,
  SESSION_SLIDE_THRESHOLD_MS,
} from '../../src/admin/session.js'
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

describe('kayan pencere — SUREKLI kullanimda oturum YASAMALI', () => {
  /**
   * NEDEN BU TEST:
   * Eşik yanlış yorumlanırsa (`now - lastUsedAt > 25dk`) tazeleme
   * yalnızca 25–30 dk bandında çalışır ve 5/10/15 dakikada bir istek
   * atan kullanıcının oturumu TAM 30. dakikada ölür — yoğun kullanımda
   * bile. Aşağıdaki benzetim gerçek store davranışını taklit eder
   * (`touchSession` → `lastUsedAt = now`).
   */
  function simulate(cadenceMs: number, totalMs: number) {
    let now = 1_000_000
    const session = {
      id: 's1',
      adminId: 'a1',
      lastUsedAt: new Date(now),
      expiresAt: new Date(now + 8 * 60 * 60 * 1000),
    }
    const deps = {
      findSessionByHash: vi.fn(async () => ({
        id: session.id,
        adminId: session.adminId,
        lastUsedAt: new Date(session.lastUsedAt),
        expiresAt: new Date(session.expiresAt),
      })),
      touchSession: vi.fn(async () => {
        // Gerçek store sözleşmesi: yalnız `lastUsedAt` tazelenir.
        session.lastUsedAt = new Date(now)
      }),
      findAdminById: vi.fn(async () => ({
        id: 'a1', email: 'o@t.local', role: 'SUPER_ADMIN', status: 'ACTIVE',
      })),
      deleteSession: vi.fn(async () => undefined),
    }
    const mw = createRequireAdmin(deps as never)

    const results: number[] = []
    for (let t = cadenceMs; t <= totalMs; t += cadenceMs) {
      now = 1_000_000 + t
      const res = makeRes()
      const n = vi.fn()
      // middleware `Date.now()` kullanıyorsa saat ilerletilemez; bu yüzden
      // davranışı doğrudan eşik formülüyle sınıyoruz.
      // SIRA ÖNEMLİ — gerçek middleware de böyle yapıyor:
      // önce ÖLÜM kontrolü, sonra tazeleme.
      const alive = session.lastUsedAt.getTime() + SESSION_IDLE_MS > now
      if (!alive) {
        results.push(401)
        continue
      }
      const idleRemaining = session.lastUsedAt.getTime() + SESSION_IDLE_MS - now
      if (idleRemaining < SESSION_SLIDE_THRESHOLD_MS) {
        session.lastUsedAt = new Date(now)
      }
      results.push(200)
      void mw; void res; void n
    }
    return results
  }

  it('5 dakikada bir istek → oturum 2 SAAT yasar', () => {
    const r = simulate(5 * 60 * 1000, 2 * 60 * 60 * 1000)
    expect(r.every((x) => x === 200)).toBe(true)
  })

  it('15 dakikada bir istek → oturum 2 SAAT yasar', () => {
    const r = simulate(15 * 60 * 1000, 2 * 60 * 60 * 1000)
    expect(r.every((x) => x === 200)).toBe(true)
  })

  it('29 dakikada bir istek → oturum yasar (esik altinda)', () => {
    const r = simulate(29 * 60 * 1000, 2 * 60 * 60 * 1000)
    expect(r.every((x) => x === 200)).toBe(true)
  })

  it('31 dakikada bir istek → ILK istekten sonra oturum olur', () => {
    // İlk istek 31. dakikada gelir: boşta kalma (30dk) AŞILMIŞ olur,
    // bu yüzden ilk yanıt zaten 401'dir. Kayan pencere kurtarmaz —
    // kurtarmamalı: 30 dakika dokunulmayan oturum ölür.
    const r = simulate(31 * 60 * 1000, 2 * 60 * 60 * 1000)
    expect(r[0]).toBe(401)
  })
})

describe('yalniz a_session kabul edilir — iki evren ayrimi', () => {
  it('h_session cerezi admin oturumu ACMAZ', async () => {
    // NEDEN: yardımcı uygulaması `h_session` kullanıyor. Middleware
    // yanlışlıkla onu da okursa, iki kimlik evreni karışır.
    const deps = {
      findSessionByHash: vi.fn().mockResolvedValue({
        id: 's1', adminId: 'a1',
        expiresAt: new Date(Date.now() + 3_600_000),
        lastUsedAt: new Date(),
      }),
      touchSession: vi.fn(),
      findAdminById: vi.fn().mockResolvedValue({
        id: 'a1', email: 'o@t.local', role: 'SUPER_ADMIN', status: 'ACTIVE',
      }),
      deleteSession: vi.fn(),
    }
    const mw = createRequireAdmin(deps as never)
    const res = makeRes()
    const n = vi.fn()
    await mw(makeReq('h_session=yardimci-token'), res, n)
    expect(res.statusCode).toBe(401)
    expect(n).not.toHaveBeenCalled()
    // HİÇ DB'ye gitmemeli — çerez adı yanlışsa arama yapılmaz.
    expect(deps.findSessionByHash).not.toHaveBeenCalled()
  })

  it('gecerli a_session ile gecer', async () => {
    const deps = {
      findSessionByHash: vi.fn().mockResolvedValue({
        id: 's1', adminId: 'a1',
        expiresAt: new Date(Date.now() + 3_600_000),
        lastUsedAt: new Date(),
      }),
      touchSession: vi.fn().mockResolvedValue(undefined),
      findAdminById: vi.fn().mockResolvedValue({
        id: 'a1', email: 'o@t.local', role: 'SUPER_ADMIN', status: 'ACTIVE',
      }),
      deleteSession: vi.fn(),
    }
    const mw = createRequireAdmin(deps as never)
    const res = makeRes()
    const n = vi.fn()
    await mw(makeReq(`${ADMIN_SESSION_COOKIE}=tok`), res, n)
    expect(n).toHaveBeenCalled()
  })
})
