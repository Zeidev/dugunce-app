import { describe, it, expect, vi } from 'vitest'
import {
  validateMessageBody,
  sendMessage,
  listMessages,
  MAX_MESSAGE_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MessageTooLongError,
} from '../../src/messages/service.js'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
    insertMessage: vi.fn().mockResolvedValue({ id: 'm1', body: 'merhaba' }),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    listByTask: vi.fn().mockResolvedValue([]),
    findTask: vi.fn().mockResolvedValue({
      id: 't1',
      weddingId: 'w1',
      assigneeHelperId: 'h1',
      assignedAt: new Date('2026-07-01T10:00:00Z'),
      deletedAt: null,
    }),
    ...overrides,
  }
}

describe('validateMessageBody', () => {
  it('boş gövde reddedilir', () => {
    expect(() => validateMessageBody('')).toThrow()
    expect(() => validateMessageBody('   ')).toThrow()
  })

  it('4000 karakter kabul edilir', () => {
    expect(validateMessageBody('a'.repeat(4000))).toHaveLength(4000)
  })

  it('4001 karakter reddedilir', () => {
    expect(() => validateMessageBody('a'.repeat(4001))).toThrow(MessageTooLongError)
  })

  it('baş/son boşluk kırpılır', () => {
    expect(validateMessageBody('  merhaba  ')).toBe('merhaba')
  })

  it('Türkçe karakterler korunur', () => {
    expect(validateMessageBody('Çiçek ısmarladım')).toBe('Çiçek ısmarladım')
  })
})

describe('sabitler', () => {
  it('max 4000 karakter', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(4000)
  })

  it('varsayılan sayfa 30', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(30)
  })

  it('azami sayfa 100', () => {
    expect(MAX_PAGE_SIZE).toBe(100)
  })
})

describe('sendMessage — idempotency (Review Focus #3)', () => {
  it('aynı idempotency_key ile ikinci kez YAZMAZ', async () => {
    const existing = { id: 'm-mevcut', body: 'merhaba' }
    const d = makeDeps({ findByIdempotencyKey: vi.fn().mockResolvedValue(existing) })
    const r = await sendMessage(
      {
        weddingId: 'w1', taskId: 't1',
        sender: { kind: 'COUPLE', userId: 'u1' },
        body: 'merhaba', idempotencyKey: 'key-1',
      },
      d,
    )
    expect(r).toEqual(existing)
    expect(d.insertMessage).not.toHaveBeenCalled()
  })

  it('farklı key ile yazar', async () => {
    const d = makeDeps()
    await sendMessage(
      {
        weddingId: 'w1', taskId: 't1',
        sender: { kind: 'COUPLE', userId: 'u1' },
        body: 'merhaba', idempotencyKey: 'key-2',
      },
      d,
    )
    expect(d.insertMessage).toHaveBeenCalled()
  })

  it('key yoksa her seferinde yazar', async () => {
    const d = makeDeps()
    await sendMessage(
      { weddingId: 'w1', taskId: 't1', sender: { kind: 'COUPLE', userId: 'u1' }, body: 'a' },
      d,
    )
    await sendMessage(
      { weddingId: 'w1', taskId: 't1', sender: { kind: 'COUPLE', userId: 'u1' }, body: 'a' },
      d,
    )
    expect(d.insertMessage).toHaveBeenCalledTimes(2)
  })

  it('idempotency kontrolü task kapsamlı', async () => {
    const d = makeDeps()
    await sendMessage(
      {
        weddingId: 'w1', taskId: 't1',
        sender: { kind: 'COUPLE', userId: 'u1' },
        body: 'x', idempotencyKey: 'k',
      },
      d,
    )
    expect(d.findByIdempotencyKey).toHaveBeenCalledWith('t1', 'k')
  })

  it('EŞZAMANLI çift gönderim: UNIQUE çakışması 500 değil, mevcut mesaj', async () => {
    // Senaryo: iki istek de findByIdempotencyKey kontrolünü boş geçti.
    // İkinci INSERT `messages_task_idem_unique` kısıtına çarpar. Kısıt
    // veriyi korur; servis kullanıcıya hata değil mevcut mesajı dönmeli.
    const writes: unknown[] = []
    const d = makeDeps({
      insertMessage: vi.fn(async (values: unknown) => {
        writes.push(values)
        if (writes.length === 2) throw new Error('duplicate key value violates unique constraint')
        return { id: 'm1', body: 'a' }
      }),
      // 1) ilk isteğin ön kontrolü: boş
      // 2) ikinci isteğin ön kontrolü: hâlâ boş (yarış)
      // 3) çakışmadan sonraki kontrol: mesaj orada
      findByIdempotencyKey: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'm1', body: 'a' }),
    })
    const params = {
      weddingId: 'w1', taskId: 't1',
      sender: { kind: 'COUPLE' as const, userId: 'u1' },
      body: 'a', idempotencyKey: 'k1',
    }
    const first = await sendMessage(params, d)
    const second = await sendMessage(params, d)
    expect(first!.id).toBe('m1')
    expect(second!.id).toBe('m1') // throw YOK
  })

  it('key yoksa çakışma hata olarak kalır (idempotency yok)', async () => {
    const d = makeDeps({
      insertMessage: vi.fn().mockRejectedValue(new Error('boom')),
    })
    await expect(
      sendMessage(
        { weddingId: 'w1', taskId: 't1', sender: { kind: 'COUPLE', userId: 'u1' }, body: 'a' },
        d,
      ),
    ).rejects.toThrow('boom')
  })
})

describe('sendMessage — doğrulama', () => {
  it('boş gövde yazma yapmaz', async () => {
    const d = makeDeps()
    await expect(
      sendMessage(
        { weddingId: 'w1', taskId: 't1', sender: { kind: 'COUPLE', userId: 'u1' }, body: '' },
        d,
      ),
    ).rejects.toThrow()
    expect(d.insertMessage).not.toHaveBeenCalled()
  })

  it('silinmiş göreve mesaj yazılamaz', async () => {
    const d = makeDeps({
      findTask: vi.fn().mockResolvedValue({ id: 't1', deletedAt: new Date() }),
    })
    const r = await sendMessage(
      { weddingId: 'w1', taskId: 't1', sender: { kind: 'COUPLE', userId: 'u1' }, body: 'x' },
      d,
    )
    expect(r).toBeNull()
  })

  it('olmayan göreve mesaj yazılamaz', async () => {
    const d = makeDeps({ findTask: vi.fn().mockResolvedValue(null) })
    const r = await sendMessage(
      { weddingId: 'w1', taskId: 't1', sender: { kind: 'COUPLE', userId: 'u1' }, body: 'x' },
      d,
    )
    expect(r).toBeNull()
  })

  it('sender_kind sunucuda belirlenir', async () => {
    const d = makeDeps()
    await sendMessage(
      { weddingId: 'w1', taskId: 't1', sender: { kind: 'HELPER', helperId: 'h1' }, body: 'x' },
      d,
    )
    const values = d.insertMessage.mock.calls[0]![0] as Record<string, unknown>
    expect(values['senderKind']).toBe('HELPER')
    expect(values['senderHelperId']).toBe('h1')
    expect(values['senderUserId']).toBeNull()
  })
})

describe('listMessages — yeniden atama sınırı (Review Focus #1)', () => {
  it('yardımcı YALNIZCA assigned_at SONRASI mesajları görür', async () => {
    const d = makeDeps()
    await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'HELPER', helperId: 'h1' } },
      d,
    )
    const opts = d.listByTask.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['since']).toEqual(new Date('2026-07-01T10:00:00Z'))
  })

  it('çift TÜM mesajları görür (sınır yok)', async () => {
    const d = makeDeps()
    await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'COUPLE', userId: 'u1' } },
      d,
    )
    const opts = d.listByTask.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['since']).toBeNull()
  })

  it('atanmamış görevin mesajlarını yardımcı GÖREMEZ', async () => {
    const d = makeDeps({
      findTask: vi.fn().mockResolvedValue({
        id: 't1', weddingId: 'w1', assigneeHelperId: null, assignedAt: null, deletedAt: null,
      }),
    })
    const r = await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'HELPER', helperId: 'h1' } },
      d,
    )
    expect(r).toEqual([])
    expect(d.listByTask).not.toHaveBeenCalled()
  })

  it('atanmış ama assignedAt NULL ise de GÖREMEZ (savunma derinliği)', async () => {
    // Bu durum normalde oluşmaz (assignTask ikisini birlikte yazar), ama
    // eski veri veya doğrudan SQL müdahalesi ile oluşabilir. `since=null`
    // filtreyi devre dışı bırakacağı için AYRI kontrol şart.
    const d = makeDeps({
      findTask: vi.fn().mockResolvedValue({
        id: 't1',
        weddingId: 'w1',
        assigneeHelperId: 'h1',   // atanmış görünüyor
        assignedAt: null,          // ama tarih yok
        deletedAt: null,
      }),
    })
    const r = await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'HELPER', helperId: 'h1' } },
      d,
    )
    expect(r).toEqual([])
    expect(d.listByTask).not.toHaveBeenCalled()
  })

  it('başka yardımcının görevinin mesajlarını GÖREMEZ', async () => {
    const d = makeDeps()
    const r = await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'HELPER', helperId: 'h-baska' } },
      d,
    )
    expect(r).toEqual([])
    expect(d.listByTask).not.toHaveBeenCalled()
  })
})

describe('listMessages — sayfalama (Review Focus #5)', () => {
  it('varsayılan 30', async () => {
    const d = makeDeps()
    await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'COUPLE', userId: 'u1' } },
      d,
    )
    const opts = d.listByTask.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['limit']).toBe(DEFAULT_PAGE_SIZE)
  })

  it('100\'den fazla istenirse 100', async () => {
    const d = makeDeps()
    await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'COUPLE', userId: 'u1' }, limit: 500 },
      d,
    )
    const opts = d.listByTask.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['limit']).toBe(MAX_PAGE_SIZE)
  })

  it('before cursor iletilir', async () => {
    const d = makeDeps()
    await listMessages(
      { weddingId: 'w1', taskId: 't1', viewer: { kind: 'COUPLE', userId: 'u1' }, before: 'm5' },
      d,
    )
    const opts = d.listByTask.mock.calls[0]![2] as Record<string, unknown>
    expect(opts['before']).toBe('m5')
  })

  it('limit 0 veya negatif reddedilir', async () => {
    const d = makeDeps()
    await expect(
      listMessages(
        { weddingId: 'w1', taskId: 't1', viewer: { kind: 'COUPLE', userId: 'u1' }, limit: 0 },
        d,
      ),
    ).rejects.toThrow()
  })
})
