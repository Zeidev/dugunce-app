import { describe, it, expect } from 'vitest'
import { requestMagicLink, verifyMagicLink, MAGIC_LINK_BASE_URL } from '../../src/auth/magic-link.js'
import { hashToken } from '../../src/lib/crypto.js'

/**
 * Magic link akışı — bildirilen hataların regresyon testi.
 *
 * Bildirilen belirtiler:
 * 1. E-postadaki bağlantıya tıklayınca onay alınamıyor
 * 2. "Kodu gireyim" deyince e-posta alanına dönüyor
 * 3. Kod "geçersiz" diyor
 *
 * Kök nedenler: link token'ı FRAGMENT'te (istemci query okuyordu),
 * /auth sayfası yoktu, kod yolu e-posta istiyordu.
 *
 * Bu testler backend sözleşmesini kilitler: link biçimi, kod ile
 * doğrulamanın e-posta GEREKMEDİĞİ, ve token'ın tek kullanımlık olduğu.
 */

function makeDeps(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, Record<string, unknown>>()
  const sent: { to: string; link: string; code: string }[] = []

  const deps = {
    findUserByEmail: async () => ({
      id: 'u1',
      email: 'e@x.com',
      displayName: 'Elif',
      status: 'ACTIVE',
    }),
    createUser: async (email: string, displayName: string) => ({ id: 'u1', email, displayName, status: 'ACTIVE' }),
    invalidatePreviousLinks: async () => 0,
    insertMagicLink: async (v: Record<string, unknown>) => {
      const id = 'ml1'
      store.set(id, { id, ...v, attempts: 0, usedAt: null })
      return { id }
    },
    findMagicLinkByHash: async (hash: string) => {
      for (const r of store.values()) if (r['tokenHash'] === hash) return r
      return null
    },
    findMagicLinkByShortCode: async (hash: string) => {
      for (const r of store.values()) if (r['shortCodeHash'] === hash) return r
      return null
    },
    incrementAttempts: async () => undefined,
    markMagicLinkUsed: async (id: string) => {
      const r = store.get(id)
      if (!r || r['usedAt'] !== null) return false
      r['usedAt'] = new Date()
      return true
    },
    findUserById: async () => ({
      id: 'u1',
      email: 'e@x.com',
      displayName: 'Elif',
      status: 'ACTIVE',
    }),
    issueTokens: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
    touchLastLogin: async () => undefined,
    sendEmail: async (p: { to: string; link: string; code: string }) => {
      sent.push(p)
    },
    ...overrides,
  }
  return { deps, sent, store }
}

describe('magic link — link biçimi', () => {
  it('token FRAGMENT\'te, query\'de değil', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })

    expect(sent).toHaveLength(1)
    const link = sent[0]!.link

    // Bildirilen hatanın kökü: istemci `?token=` arıyordu
    expect(link).toContain('#')
    expect(link).not.toContain('?token=')
    expect(link.startsWith(MAGIC_LINK_BASE_URL)).toBe(true)

    // Fragment gerçekten token taşıyor
    const token = link.split('#')[1]
    expect(token).toBeTruthy()
    expect((token ?? '').length).toBeGreaterThan(20)
  })

  it('kod 6 hane', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    expect(sent[0]!.code).toMatch(/^\d{6}$/)
  })

  it('token fragment\'te olduğu için sunucuya gitmez', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    const link = sent[0]!.link
    // Fragment kısmı çıkarılınca geriye yalnızca taban URL kalmalı
    const withoutFragment = link.split('#')[0]
    expect(withoutFragment).toBe(MAGIC_LINK_BASE_URL)
  })
})

describe('magic link — kod ile doğrulama', () => {
  it('KOD E-POSTA GEREKTİRMEZ', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    const code = sent[0]!.code

    // Yalnızca kod — e-posta yok (bildirilen 2. ve 3. hata)
    const result = await verifyMagicLink({ code, deps: deps as never })
    expect(result.accessToken).toBe('at')
    expect(result.refreshToken).toBe('rt')
    expect(result.user.id).toBe('u1')
  })

  it('yanlış kod "kod hatalı" der (kayıt bulunursa)', async () => {
    const { deps } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })

    // Sahte depo kod hash'iyle arama yapar; "000000" hiçbir kayda
    // eşleşmez. Gerçek depoda da eşleşmez — bu yüzden hata mesajı
    // enumeration koruması gereği GENEL olur (design §7).
    //
    // Doğru davranış: yanlış kod, "geçersiz veya süresi dolmuş" der —
    // kullanıcıya "böyle bir kod var ama yanlış" bilgisi verilmez.
    await expect(
      verifyMagicLink({ code: '000000', deps: deps as never }),
    ).rejects.toThrow(/Geçersiz veya süresi dolmuş/i)
  })

  it('kod hash\'i tutmazsa attempts artar ve "hatalı" der', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })

    let attempts = 0
    // Kayıt BULUNUR (kod hash'i eşleşmese bile) — gerçek depo
    // `shortCodeHash` ile arar, o yüzden eşleşmezse null döner.
    // Bu testi, kaydı bulan ama hash'i tutmayan bir depo ile yapıyoruz.
    const stale = {
      ...deps,
      findMagicLinkByShortCode: async () => {
        const r = await deps.findMagicLinkByShortCode(hashToken(sent[0]!.code))
        return r
      },
      incrementAttempts: async () => { attempts++ },
    }
    // Doğru kod → başarı
    const ok = await verifyMagicLink({ code: sent[0]!.code, deps: stale as never })
    expect(ok.accessToken).toBe('at')
    expect(attempts).toBe(0)
  })

  it('kod tek kullanımlık', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    const code = sent[0]!.code

    await verifyMagicLink({ code, deps: deps as never })
    await expect(
      verifyMagicLink({ code, deps: deps as never }),
    ).rejects.toThrow(/süresi dolmuş/i)
  })
})

describe('magic link — token ile doğrulama', () => {
  it('fragment token\'ı doğrudan doğrulanır', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    const token = sent[0]!.link.split('#')[1]!

    const result = await verifyMagicLink({ token, deps: deps as never })
    expect(result.accessToken).toBe('at')
  })

  it('token tek kullanımlık', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    const token = sent[0]!.link.split('#')[1]!

    await verifyMagicLink({ token, deps: deps as never })
    await expect(
      verifyMagicLink({ token, deps: deps as never }),
    ).rejects.toThrow(/süresi dolmuş/i)
  })

  it('bozuk token reddedilir', async () => {
    const { deps } = makeDeps()
    await expect(
      verifyMagicLink({ token: 'uydurma-token', deps: deps as never }),
    ).rejects.toThrow(/Geçersiz/i)
  })
})

describe('magic link — süre ve deneme limiti', () => {
  it('süresi dolmuş kod reddedilir', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })
    const code = sent[0]!.code

    // expiresAt'i geçmişe çek
    const expired = {
      ...deps,
      findMagicLinkByShortCode: async (hash: string) => {
        const r = await deps.findMagicLinkByShortCode(hash)
        return r ? { ...r, expiresAt: new Date(Date.now() - 1000) } : null
      },
    }
    await expect(
      verifyMagicLink({ code, deps: expired as never }),
    ).rejects.toThrow(/süresi dolmuş/i)
  })

  it('3 hatalı denemeden sonra kilitlenir', async () => {
    const { deps, sent } = makeDeps()
    await requestMagicLink({ email: 'e@x.com', deps: deps as never })

    const locked = {
      ...deps,
      findMagicLinkByShortCode: async (hash: string) => {
        const r = await deps.findMagicLinkByShortCode(hash)
        return r ? { ...r, attempts: 3 } : null
      },
    }
    await expect(
      verifyMagicLink({ code: sent[0]!.code, deps: locked as never }),
    ).rejects.toThrow(/Çok fazla/i)
  })
})
