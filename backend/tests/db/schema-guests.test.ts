import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { guests, guestInvitations } from '../../src/db/schema.js'

/**
 * Davetli şeması — kolon tipleri ve kısıtlar.
 *
 * Bu testler DB'ye bağlanmaz; şema tanımının sözleşmeyi taşıdığını doğrular.
 * Gerçek SQL davranışı (composite FK, CASCADE) store testlerinde kanıtlanır.
 */

function cols(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns
}
function col(table: Parameters<typeof getTableConfig>[0], name: string) {
  const c = cols(table).find((x) => x.name === name)
  if (!c) throw new Error(`Kolon yok: ${name}`)
  return c
}
function uniqueNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).uniqueConstraints.map((u) => u.name)
}
function fkList(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys
}

describe('guests şeması', () => {
  it('wedding_id taşır (tenant izolasyonu)', () => {
    expect(col(guests, 'wedding_id').notNull).toBe(true)
  })

  it('COMPOSITE UNIQUE (id, wedding_id) — FK hedefi', () => {
    expect(uniqueNames(guests)).toContain('guests_id_wedding_unique')
  })

  it('phone nullable — telefonu olmayan davetli eklenebilir', () => {
    expect(col(guests, 'phone').notNull).toBe(false)
  })

  it('name zorunlu', () => {
    expect(col(guests, 'name').notNull).toBe(true)
  })

  it('side varsayılan BRIDE (davetli tarafı zorunlu)', () => {
    expect(col(guests, 'side').default).toBe('BRIDE')
  })

  it('rsvp varsayılan PENDING', () => {
    expect(col(guests, 'rsvp').default).toBe('PENDING')
  })

  it('invite_status varsayılan NOT_SENT', () => {
    expect(col(guests, 'invite_status').default).toBe('NOT_SENT')
  })

  it('deleted_at soft delete için nullable', () => {
    const c = col(guests, 'deleted_at')
    expect(c.notNull).toBe(false)
  })

  it('wedding_id indeksli (liste sorgusu)', () => {
    const idx = getTableConfig(guests).indexes.map((i) => i.config.name)
    expect(idx).toContain('guests_wedding_idx')
  })
})

describe('guest_invitations şeması', () => {
  it('token_hash kolonu VAR', () => {
    expect(cols(guestInvitations).map((c) => c.name)).toContain('token_hash')
  })

  it('HAM TOKEN kolonu YOK (SECURITY §1.2)', () => {
    const names = cols(guestInvitations).map((c) => c.name)
    expect(names).not.toContain('token')
  })

  it('token_hash UNIQUE — aynı token iki davetliye verilemez', () => {
    expect(col(guestInvitations, 'token_hash').isUnique).toBe(true)
  })

  it('allowed_party_size varsayılan 1', () => {
    expect(col(guestInvitations, 'allowed_party_size').default).toBe(1)
  })

  it('confirmed_party_size nullable — RSVP öncesi boş', () => {
    expect(col(guestInvitations, 'confirmed_party_size').notNull).toBe(false)
  })

  it('rsvp_source nullable (RSVP öncesi kimse yazmadı)', () => {
    expect(col(guestInvitations, 'rsvp_source').notNull).toBe(false)
  })

  it('expires_at zorunlu', () => {
    expect(col(guestInvitations, 'expires_at').notNull).toBe(true)
  })

  it('revoked_at nullable', () => {
    expect(col(guestInvitations, 'revoked_at').notNull).toBe(false)
  })

  it('COMPOSITE FK (guest_id, wedding_id) → guests(id, wedding_id)', () => {
    const fk = fkList(guestInvitations).find(
      (f) => f.getName() === 'guest_invitations_guest_fk',
    )
    expect(fk).toBeDefined()
    const ref = fk!.reference()
    expect(ref.columns.map((c) => c.name)).toEqual(['guest_id', 'wedding_id'])
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id', 'wedding_id'])
  })

  it('composite FK CASCADE — davetli silinince davetiye gider', () => {
    const fk = fkList(guestInvitations).find(
      (f) => f.getName() === 'guest_invitations_guest_fk',
    )
    expect(fk!.onDelete).toBe('cascade')
  })
})
