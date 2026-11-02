import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { helpers, tasks, messages } from '../../src/db/schema.js'

function cols(t: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(t).columns
}
function col(t: Parameters<typeof getTableConfig>[0], name: string) {
  const c = cols(t).find((x) => x.name === name)
  if (!c) throw new Error(`Kolon yok: ${name}`)
  return c
}
function uniques(t: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(t).uniqueConstraints.map((u) => u.name)
}
function fks(t: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(t).foreignKeys
}

describe('helpers semasi', () => {
  it('wedding_id tasir', () => {
    expect(col(helpers, 'wedding_id').notNull).toBe(true)
  })

  it('COMPOSITE UNIQUE (id, wedding_id)', () => {
    expect(uniques(helpers)).toContain('helpers_id_wedding_unique')
  })

  it('access_token_hash UNIQUE', () => {
    expect(col(helpers, 'access_token_hash').isUnique).toBe(true)
  })

  it('HAM token kolonu YOK (SECURITY 1.2)', () => {
    const names = cols(helpers).map((c) => c.name)
    expect(names).not.toContain('token')
    expect(names).toContain('access_token_hash')
  })

  it('token_revoked_at nullable', () => {
    expect(col(helpers, 'token_revoked_at').notNull).toBe(false)
  })

  it('last_seen_at nullable', () => {
    expect(col(helpers, 'last_seen_at').notNull).toBe(false)
  })

  it('yardimcinin KENDI kimligi users degil (created_by istisna)', () => {
    // `created_by` users'a referans verir — bu DOGRU: kimin olusturdugu.
    // Ama yardimcinin KENDISI users satirina sahip olmamali; bunu
    // access_token_hash kolonu garanti eder (hesap yok, sadece token).
    const refs = fks(helpers).map((f) => f.reference())
    const byTable = new Map<string, string[]>()
    for (const r of refs) {
      const name = getTableConfig(r.foreignTable).name
      byTable.set(name, r.columns.map((c) => c.name))
    }
    // users'a giden TEK referans created_by olmali
    expect(byTable.get('users')).toEqual(['created_by'])
    expect(byTable.has('weddings')).toBe(true)
    // Yardimciyi kimliklendiren kolon token hash'i, user id degil
    expect(cols(helpers).map((c) => c.name)).toContain('access_token_hash')
  })
})

describe('tasks semasi', () => {
  it('assignee_helper_id nullable', () => {
    expect(col(tasks, 'assignee_helper_id').notNull).toBe(false)
  })

  it('status varsayilan TODO', () => {
    expect(col(tasks, 'status').default).toBe('TODO')
  })

  it('priority varsayilan NORMAL', () => {
    expect(col(tasks, 'priority').default).toBe('NORMAL')
  })

  it('assigned_at nullable', () => {
    expect(col(tasks, 'assigned_at').notNull).toBe(false)
  })

  it('COMPOSITE UNIQUE (id, wedding_id)', () => {
    expect(uniques(tasks)).toContain('tasks_id_wedding_unique')
  })

  it('COMPOSITE FK (assignee_helper_id, wedding_id) -> helpers', () => {
    const fk = fks(tasks).find((f) => f.getName() === 'tasks_assignee_fk')
    expect(fk).toBeDefined()
    const ref = fk!.reference()
    expect(ref.columns.map((c) => c.name)).toEqual(['assignee_helper_id', 'wedding_id'])
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id', 'wedding_id'])
  })

  it('deleted_at soft delete', () => {
    expect(col(tasks, 'deleted_at').notNull).toBe(false)
  })
})

describe('messages semasi', () => {
  it('wedding_id ZORUNLU', () => {
    expect(col(messages, 'wedding_id').notNull).toBe(true)
  })

  it('task_id ZORUNLU', () => {
    expect(col(messages, 'task_id').notNull).toBe(true)
  })

  it('sender_kind ZORUNLU', () => {
    expect(col(messages, 'sender_kind').notNull).toBe(true)
  })

  it('sender_user_id ve sender_helper_id nullable', () => {
    expect(col(messages, 'sender_user_id').notNull).toBe(false)
    expect(col(messages, 'sender_helper_id').notNull).toBe(false)
  })

  it('body ZORUNLU', () => {
    expect(col(messages, 'body').notNull).toBe(true)
  })

  it('idempotency_key nullable', () => {
    expect(col(messages, 'idempotency_key').notNull).toBe(false)
  })

  it('UNIQUE (task_id, idempotency_key)', () => {
    expect(uniques(messages)).toContain('messages_task_idem_unique')
  })

  it('COMPOSITE FK (task_id, wedding_id) -> tasks CASCADE', () => {
    const fk = fks(messages).find((f) => f.getName() === 'messages_task_fk')
    expect(fk).toBeDefined()
    const ref = fk!.reference()
    expect(ref.columns.map((c) => c.name)).toEqual(['task_id', 'wedding_id'])
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id', 'wedding_id'])
    expect(fk!.onDelete).toBe('cascade')
  })

  it('sender_helper_id SET NULL (yardimci silinince mesaj kalir)', () => {
    const fk = fks(messages).find((f) => {
      const r = f.reference()
      return getTableConfig(r.foreignTable).name === 'helpers'
    })
    expect(fk).toBeDefined()
    expect(fk!.onDelete).toBe('set null')
  })
})
