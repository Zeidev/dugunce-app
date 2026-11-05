import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, ApiError, onSessionExpired, clearCsrfToken, API_BASE } from './api'
import { loginErrorMessage } from './pages/login-messages'

/**
 * `api.ts` sözleşme testleri — AĞA ÇIKMAZ.
 *
 * NEDEN BU TESTLER VAR: panelin tamamı bu dosyanın üstünde duruyor ve
 * buradaki üç sessiz hata üretimde paneli kullanılamaz hâle getirir:
 *
 * 1. `credentials: 'include'` unutulursa üretimde (SPA `dugunce.com.tr/spa/`,
 *    API `api.dugunce.com.tr` — FARKLI ORIGIN) tarayıcı çerezleri göndermez;
 *    her istek 401 döner ama geliştirmede proxy sayesinde her şey çalışır.
 *    Yani hata YALNIZ canlıda görünür.
 * 2. CSRF başlığı gönderilmezse TÜM yazmalar 403 olur — panel salt-okunur
 *    kalır. `a_csrf` çerezi `Path=/api/v1/admin` + host-only olduğu için
 *    `document.cookie` ile OKUNAMAZ; token login/`me` gövdesinden gelip
 *    `sessionStorage`'da tutulmak ZORUNDA.
 * 3. 401'i "oturum düştü" saymak ile "parola yanlış" saymak ayrılmazsa
 *    yanlış parola girildiğinde uygulama oturum-düştü akışına girer ve
 *    giriş ekranı kendini sonsuz döngüde yeniden yükler.
 */

/** Testin yakaladığı tek bir istek — `RequestInit` yerine dar, okunur şekil. */
interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  credentials: string | undefined
}

let calls: CapturedRequest[] = []

/** `HeadersInit`'i `as` KULLANMADAN düz nesneye indirger. */
function normalizeHeaders(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (init === undefined) return out
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(init)) {
    for (const pair of init) {
      const [key, value] = pair
      if (key !== undefined && value !== undefined) out[key] = value
    }
    return out
  }
  for (const [key, value] of Object.entries(init)) out[key] = value
  return out
}

function capture(url: string, init: RequestInit): CapturedRequest {
  return {
    url,
    method: init.method ?? 'GET',
    headers: normalizeHeaders(init.headers),
    body: typeof init.body === 'string' ? init.body : null,
    credentials: init.credentials,
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.toString()
  if (typeof input === 'string') return input.toString()
  return input.url
}

/**
 * `fetch`'i sahte bir işleyiciyle değiştirir.
 *
 * GERÇEK `Response` kullanılır (elle yazılmış `{ ok, status }` nesnesi
 * değil): `api.ts` `res.ok`, `res.status` ve `res.text()` üzerinden
 * çalışıyor; sahte nesne bu üçünün birinde farklı davranırsa test yeşil
 * kalırken üretim kırılırdı.
 */
function stubFetch(handler: (req: CapturedRequest) => Response | Promise<Response>): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = capture(requestUrl(input), init ?? {})
    calls.push(req)
    return handler(req)
  })
  vi.stubGlobal('fetch', fn)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

const ADMIN = {
  id: 'a1',
  email: 'owner@t.local',
  displayName: 'Ürün Sahibi',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  lastLoginAt: null,
}

beforeEach(() => {
  calls = []
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

// ---------------------------------------------------------------------------
// 1. İstek sözleşmesi — credentials, CSRF, base URL
// ---------------------------------------------------------------------------

describe('api — istek sözleşmesi', () => {
  it("HER istekte credentials: 'include' gönderir", async () => {
    // NEDEN: üretimde SPA ve API farklı origin. Bu satır olmadan tarayıcı
    // çerez göndermez; geliştirmede proxy yüzünden sorun GÖRÜNMEZ.
    stubFetch(() => jsonResponse({ admin: ADMIN }))
    await api.me()

    stubFetch(() => jsonResponse({ users: { total: 0, newLast7Days: 0 }, weddings: { total: 0, active: 0, premium: 0, free: 0 }, guests: { total: 0, attending: 0, declined: 0, pending: 0 }, recentAudit: [] }))
    await api.overview()

    expect(calls.length).toBe(2)
    for (const req of calls) {
      expect(req.credentials).toBe('include')
    }
  })

  it('yazma isteğinde X-CSRF-Token başlığını sessionStorage değerinden alır', async () => {
    sessionStorage.setItem('csrfToken', 'tok-abc-123')
    stubFetch(() => jsonResponse({ user: { id: 'u1', email: 'a@b.c', displayName: 'A', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', weddingCount: 0 } }))

    await api.setUserStatus('u1', 'SUSPENDED')

    const req = calls[0]
    expect(req).toBeDefined()
    expect(req?.method).toBe('PATCH')
    expect(req?.headers['X-CSRF-Token']).toBe('tok-abc-123')
  })

  it('okuma isteğinde CSRF başlığı GÖNDERMEZ (gerek yok, yüzey küçük kalsın)', async () => {
    sessionStorage.setItem('csrfToken', 'tok-abc-123')
    stubFetch(() => jsonResponse({ admin: ADMIN }))

    await api.me()

    expect(calls[0]?.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('geliştirmede göreli, üretimde mutlak API kökü kullanır', async () => {
    // Vitest `import.meta.env.PROD === false` ile çalışır → göreli yol.
    // Üretimde mutlak URL şart: SPA farklı origin'de.
    expect(API_BASE).toBe('/api/v1/admin')

    stubFetch(() => jsonResponse({ admin: ADMIN }))
    await api.me()
    expect(calls[0]?.url).toBe('/api/v1/admin/auth/me')
  })
})

// ---------------------------------------------------------------------------
// 2. Oturum — CSRF saklama ve 401 ayrımı
// ---------------------------------------------------------------------------

describe('api — oturum', () => {
  it('login yanıt gövdesindeki csrfToken ı sessionStorage a yazar', async () => {
    // NEDEN GÖVDEDEN: `a_csrf` çerezi `Path=/api/v1/admin` + host-only;
    // SPA `document.cookie` ile göremez. Backend token'ı gövdede veriyor.
    stubFetch(() => jsonResponse({ admin: ADMIN, csrfToken: 'tok-login-1' }))

    const admin = await api.login('owner@t.local', 'parola-123')

    expect(admin.email).toBe('owner@t.local')
    expect(sessionStorage.getItem('csrfToken')).toBe('tok-login-1')
  })

  it('me gövdesindeki csrfToken ı tazeler (sayfa yenileme sonrası yazma çalışsın)', async () => {
    stubFetch(() => jsonResponse({ admin: ADMIN, csrfToken: 'tok-me-2' }))

    await api.me()

    expect(sessionStorage.getItem('csrfToken')).toBe('tok-me-2')
  })

  it('me csrfToken DÖNDÜRMEZSE mevcut değeri silmez', async () => {
    // Backend `csrfToken`'ı yalnız çerez varsa ekliyor; alan yoksa
    // sessionStorage'daki değer korunmalı, aksi hâlde sonraki yazma 403 olur.
    sessionStorage.setItem('csrfToken', 'tok-korunmali')
    stubFetch(() => jsonResponse({ admin: ADMIN }))

    await api.me()

    expect(sessionStorage.getItem('csrfToken')).toBe('tok-korunmali')
  })

  it('başarılı logout csrfToken ı temizler', async () => {
    sessionStorage.setItem('csrfToken', 'tok-logout')
    stubFetch(() => new Response(null, { status: 204 }))

    await api.logout()

    expect(sessionStorage.getItem('csrfToken')).toBeNull()
    expect(calls[0]?.headers['X-CSRF-Token']).toBe('tok-logout')
  })

  it('oturum isteği 401 dönerse oturum-düştü olayını tetikler', async () => {
    const onExpired = vi.fn()
    const off = onSessionExpired(onExpired)
    stubFetch(() => errorResponse(401, 'UNAUTHORIZED', 'Oturum gerekli'))

    await expect(api.overview()).rejects.toBeInstanceOf(ApiError)

    expect(onExpired).toHaveBeenCalledTimes(1)
    off()
  })

  it('LOGIN 401 "parola yanlış"tır — oturum-düştü olayı TETİKLENMEZ', async () => {
    // NEDEN KRİTİK: bu ayrım yoksa yanlış parola girildiğinde uygulama
    // "oturum düştü" sanıp giriş ekranını yeniden yükler; kullanıcı hata
    // mesajını göremez.
    const onExpired = vi.fn()
    const off = onSessionExpired(onExpired)
    stubFetch(() => errorResponse(401, 'INVALID_CREDENTIALS', 'E-posta veya parola hatalı'))

    await expect(api.login('owner@t.local', 'yanlis')).rejects.toBeInstanceOf(ApiError)

    expect(onExpired).not.toHaveBeenCalled()
    off()
  })

  it('olay aboneliği iptal edilebiliyor (sızıntı yok)', async () => {
    const onExpired = vi.fn()
    const off = onSessionExpired(onExpired)
    off()
    stubFetch(() => errorResponse(401, 'UNAUTHORIZED', 'Oturum gerekli'))

    await expect(api.overview()).rejects.toBeInstanceOf(ApiError)

    expect(onExpired).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. Hata çevirimi
// ---------------------------------------------------------------------------

describe('api — hata çevirimi', () => {
  it('hata gövdesini ApiError a çevirir (status + code + message)', async () => {
    stubFetch(() => errorResponse(403, 'CSRF_INVALID', 'CSRF doğrulaması başarısız'))

    const err = await api.setUserStatus('u1', 'SUSPENDED').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err instanceof ApiError ? err : null
    expect(apiErr?.status).toBe(403)
    expect(apiErr?.code).toBe('CSRF_INVALID')
    expect(apiErr?.message).toBe('CSRF doğrulaması başarısız')
  })

  it('204 boş gövdede JSON ayrıştırma hatası vermez', async () => {
    // Backend `/auth/logout` 204 döner; `.json()` çağrılsaydı
    // "Unexpected end of JSON input" fırlardı.
    stubFetch(() => new Response(null, { status: 204 }))

    await expect(api.logout()).resolves.toBeUndefined()
  })

  it('boş 200 gövdesinde de patlamaz', async () => {
    stubFetch(() => new Response('', { status: 200 }))

    await expect(api.logout()).resolves.toBeUndefined()
  })

  it('bozuk JSON gövdesini ApiError a çevirir (ham SyntaxError sızmaz)', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 200 }))

    const err = await api.me().catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err instanceof ApiError ? err : null
    expect(apiErr?.code).toBe('INVALID_RESPONSE')
  })

  it('ağ hatasını (fetch reject) ApiError a çevirir', async () => {
    // NEDEN: guard "401 dışındaki hatalarda login'e ATMA" diyor; ham
    // `TypeError: Failed to fetch` bunu ayırt edemezdi.
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    const err = await api.me().catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err instanceof ApiError ? err : null
    expect(apiErr?.code).toBe('NETWORK_ERROR')
    expect(apiErr?.message).toContain('ulaşılamadı')
  })
})

// ---------------------------------------------------------------------------
// 4. Uçlar — yol, sorgu ve gövde şekilleri
// ---------------------------------------------------------------------------

describe('api — uçlar', () => {
  it('users sorgu parametrelerini doğru kurar ve sayfayı döner', async () => {
    stubFetch(() =>
      jsonResponse({
        items: [
          { id: 'u1', email: 'a@b.c', displayName: 'Ayşe', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', weddingCount: 2 },
        ],
        nextCursor: 'u1',
      }),
    )

    const page = await api.users({ limit: 25, q: 'ayşe', cursor: 'abc' })

    const url = new URL(calls[0]?.url ?? '', 'http://localhost')
    expect(url.pathname).toBe('/api/v1/admin/users')
    expect(url.searchParams.get('limit')).toBe('25')
    expect(url.searchParams.get('q')).toBe('ayşe')
    expect(url.searchParams.get('cursor')).toBe('abc')
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.weddingCount).toBe(2)
    expect(page.nextCursor).toBe('u1')
  })

  it('tanımsız filtreler sorgu dizesine YAZILMAZ (backend `q=` boşunu yok sayar ama gereksiz)', async () => {
    stubFetch(() => jsonResponse({ items: [], nextCursor: null }))

    await api.users({ limit: 50 })

    const url = new URL(calls[0]?.url ?? '', 'http://localhost')
    expect(url.searchParams.has('q')).toBe(false)
    expect(url.searchParams.has('cursor')).toBe(false)
    expect(url.searchParams.get('limit')).toBe('50')
  })

  it('nextCursor null korunur (undefined ile karışmaz)', async () => {
    // "Daha fazla" butonu `nextCursor === null` iken gizlenir; `undefined`
    // dönerse karşılaştırma yanlış çalışır ve buton sonsuza kadar görünür.
    stubFetch(() => jsonResponse({ items: [], nextCursor: null }))

    const page = await api.weddings({ plan: 'PREMIUM' })

    expect(page.nextCursor).toBeNull()
    expect(calls[0]?.url).toContain('plan=PREMIUM')
  })

  it('setUserStatus gövdesinde YALNIZ status gönderir', async () => {
    // Backend `PATCH /users/:id` gövdesinde tek anahtar bekliyor; fazlası 400.
    stubFetch(() =>
      jsonResponse({ user: { id: 'u1', email: 'a@b.c', displayName: 'A', status: 'SUSPENDED', createdAt: '2026-01-01T00:00:00.000Z', weddingCount: 0 } }),
    )

    await api.setUserStatus('u1', 'SUSPENDED')

    expect(calls[0]?.url).toBe('/api/v1/admin/users/u1')
    expect(calls[0]?.body).toBe(JSON.stringify({ status: 'SUSPENDED' }))
  })

  it('setPlan PATCH /weddings/:id/plan adresine {plan} gönderir', async () => {
    stubFetch(() =>
      jsonResponse({ wedding: { id: 'w1', coupleNames: 'A & B', weddingDate: '2026-09-12T19:00:00.000Z', plan: 'PREMIUM', guestCount: 0, memberCount: 0, createdAt: '2026-01-01T00:00:00.000Z' } }),
    )

    const wedding = await api.setPlan('w1', 'PREMIUM')

    expect(calls[0]?.method).toBe('PATCH')
    expect(calls[0]?.url).toBe('/api/v1/admin/weddings/w1/plan')
    expect(calls[0]?.body).toBe(JSON.stringify({ plan: 'PREMIUM' }))
    expect(wedding.plan).toBe('PREMIUM')
  })

  it('audit action filtresini sorguya koyar', async () => {
    stubFetch(() => jsonResponse({ items: [], nextCursor: null }))

    await api.audit({ action: 'ADMIN_LOGIN', limit: 20 })

    const url = new URL(calls[0]?.url ?? '', 'http://localhost')
    expect(url.pathname).toBe('/api/v1/admin/audit-logs')
    expect(url.searchParams.get('action')).toBe('ADMIN_LOGIN')
  })

  it('overview yanıtını olduğu gibi döner (guests bir NESNE)', async () => {
    // Backend `countGuests()` `{total, attending, declined, pending}` döner
    // ve route bunu olduğu gibi yayınlar — spec §6.2 ile aynı.
    stubFetch(() =>
      jsonResponse({
        users: { total: 42, newLast7Days: 5 },
        weddings: { total: 38, active: 36, premium: 3, free: 35 },
        guests: { total: 620, attending: 210, declined: 40, pending: 370 },
        recentAudit: [],
      }),
    )

    const overview = await api.overview()

    expect(overview.users.total).toBe(42)
    expect(overview.guests.attending).toBe(210)
    expect(overview.recentAudit).toEqual([])
  })

  it('tanınmayan yanıt şekli ApiError üretir (sessizce boş nesne dönmez)', async () => {
    stubFetch(() => jsonResponse({ items: 'bu-dizi-degil', nextCursor: null }))

    const err = await api.users({ limit: 10 }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err instanceof ApiError ? err : null
    expect(apiErr?.code).toBe('INVALID_RESPONSE')
  })
})

// ---------------------------------------------------------------------------
// 5. Giriş hata mesajları — 423 ve 403 AYRI anlatılmalı
// ---------------------------------------------------------------------------

describe('loginErrorMessage', () => {
  it('423 ACCOUNT_LOCKED için kilit mesajı verir', () => {
    const msg = loginErrorMessage(new ApiError(423, 'ACCOUNT_LOCKED', 'Hesap kilitli'))
    expect(msg).toContain('kilit')
    expect(msg).not.toBe('E-posta veya parola hatalı.')
  })

  it('403 ACCOUNT_SUSPENDED için askıya alma mesajı verir', () => {
    const msg = loginErrorMessage(new ApiError(403, 'ACCOUNT_SUSPENDED', 'Hesap askıda'))
    expect(msg).toContain('askıya')
  })

  it('401 INVALID_CREDENTIALS için genel kimlik mesajı verir', () => {
    const msg = loginErrorMessage(new ApiError(401, 'INVALID_CREDENTIALS', 'E-posta veya parola hatalı'))
    expect(msg).toBe('E-posta veya parola hatalı.')
  })

  it('429 RATE_LIMITED için bekleme mesajı verir', () => {
    const msg = loginErrorMessage(new ApiError(429, 'RATE_LIMITED', 'Çok fazla istek'))
    expect(msg).toContain('deneme')
  })

  it('ağ hatasında bağlantı mesajı verir (401 muamelesi YAPMAZ)', () => {
    const msg = loginErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamadı'))
    expect(msg).toContain('ulaşılamadı')
  })

  it('bilinmeyen hatada sunucunun kullanıcıya dönük mesajını kullanır', () => {
    const msg = loginErrorMessage(new ApiError(400, 'BAD_REQUEST', 'E-posta ve parola gerekli'))
    expect(msg).toBe('E-posta ve parola gerekli')
  })

  it('ApiError olmayan değerde genel mesaj verir', () => {
    expect(loginErrorMessage('tuhaf')).toContain('Beklenmeyen')
  })
})

// ---------------------------------------------------------------------------
// 6. CSRF temizleme yardımcısı (Layout çıkış akışı kullanır)
// ---------------------------------------------------------------------------

describe('clearCsrfToken', () => {
  it('sessionStorage daki token ı siler', () => {
    sessionStorage.setItem('csrfToken', 'tok-sil')
    clearCsrfToken()
    expect(sessionStorage.getItem('csrfToken')).toBeNull()
  })
})
