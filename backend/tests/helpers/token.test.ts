import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { resolveHelperToken, LAST_SEEN_THROTTLE_MS } from '../../src/helpers/token.js'

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    weddingId: 'w1',
    displayName: 'Ayşe',
    tokenRevokedAt: null,
    lastSeenAt: null,
    wedding: { id: 'w1', coupleNames: 'Elif & Mert', deletedAt: null },
    ...overrides,
  }
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    findByTokenHash: vi.fn().mockResolvedValue(makeRow()),
    touchLastSeen: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('resolveHelperToken (Review Focus #4)', () => {
  it('geçerli token yardımcıyı döner', async () => {
    const d = makeDeps()
    const r = await resolveHelperToken('raw-token', d)
    expect(r).not.toBeNull()
    expect(r!.id).toBe('h1')
  })

  it('sorgu HASH ile yapılır, ham token ile değil', async () => {
    const d = makeDeps()
    await resolveHelperToken('raw-token', d)
    expect(d.findByTokenHash).toHaveBeenCalledWith(sha256('raw-token'))
    expect(d.findByTokenHash).not.toHaveBeenCalledWith('raw-token')
  })

  it('bilinmeyen token null', async () => {
    const d = makeDeps({ findByTokenHash: vi.fn().mockResolvedValue(null) })
    expect(await resolveHelperToken('yok', d)).toBeNull()
  })

  it('revoke edilmiş token null', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(makeRow({ tokenRevokedAt: new Date() })),
    })
    expect(await resolveHelperToken('tok', d)).toBeNull()
  })

  it('silinmiş düğünün yardımcısı null', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ wedding: { id: 'w1', coupleNames: 'X', deletedAt: new Date() } }),
      ),
    })
    expect(await resolveHelperToken('tok', d)).toBeNull()
  })

  it('boş token null, sorgu YAPILMAZ', async () => {
    const d = makeDeps()
    expect(await resolveHelperToken('', d)).toBeNull()
    expect(d.findByTokenHash).not.toHaveBeenCalled()
  })
})

describe('last_seen_at — 5 dk throttle', () => {
  it('throttle sabiti 5 dakika', () => {
    expect(LAST_SEEN_THROTTLE_MS).toBe(5 * 60 * 1000)
  })

  it('hiç görülmemişse günceller', async () => {
    const d = makeDeps()
    await resolveHelperToken('tok', d)
    expect(d.touchLastSeen).toHaveBeenCalledWith('h1')
  })

  it('5 dakikadan eskiyse günceller', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ lastSeenAt: new Date(Date.now() - 6 * 60_000) }),
      ),
    })
    await resolveHelperToken('tok', d)
    expect(d.touchLastSeen).toHaveBeenCalled()
  })

  it('5 dakika içindeyse GÜNCELLEMEZ (gereksiz yazma yok)', async () => {
    const d = makeDeps({
      findByTokenHash: vi.fn().mockResolvedValue(
        makeRow({ lastSeenAt: new Date(Date.now() - 60_000) }),
      ),
    })
    await resolveHelperToken('tok', d)
    expect(d.touchLastSeen).not.toHaveBeenCalled()
  })

  it('touchLastSeen hatası çözümlemeyi ENGELLEMEZ', async () => {
    const d = makeDeps({
      touchLastSeen: vi.fn().mockRejectedValue(new Error('DB hatası')),
    })
    const r = await resolveHelperToken('tok', d)
    expect(r).not.toBeNull()  // yan etki kritik değil
  })
})
