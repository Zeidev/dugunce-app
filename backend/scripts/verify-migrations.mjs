#!/usr/bin/env node
/**
 * Migration SQL doğrulama — gerçek PostgreSQL (WASM) üzerinde.
 *
 * Amaç: PostgreSQL kurulu olmayan geliştirme makinelerinde migration SQL'inin
 * gerçekten çalıştığını, idempotent olduğunu ve şemanın beklendiği gibi
 * oluştuğunu doğrulamak.
 *
 * Bu bir BİRİM TESTİ DEĞİL — CI'da gerçek PostgreSQL service container
 * kullanılır. Bu araç yerel geliştirmede hızlı geri bildirim içindir.
 *
 * Kullanım:
 *   node scripts/verify-migrations.mjs
 *
 * Gereksinim: `npm i -D @electric-sql/pglite`
 */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations')

let failures = 0
const ok = (msg) => console.log(`  ✅ ${msg}`)
const bad = (msg) => { console.log(`  ❌ ${msg}`); failures++ }

console.log('==========================================')
console.log(' Migration SQL doğrulama (PGlite)')
console.log('==========================================\n')

const db = new PGlite()

try {
  // --- Migration dosyalarını bul ---
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    bad('Hiç migration dosyası bulunamadı')
    process.exit(1)
  }
  console.log(`[1] ${files.length} migration dosyası bulundu\n`)

  // --- Her migration'ı çalıştır ---
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)

    console.log(`[2] ${file} — ${statements.length} statement`)
    for (const stmt of statements) {
      await db.exec(stmt)
    }
    ok('çalıştı')

    // --- İdempotency: tekrar çalıştır ---
    for (const stmt of statements) {
      await db.exec(stmt)
    }
    ok('idempotent (ikinci kez de çalıştı)')
  }

  // --- Şema doğrula ---
  console.log('\n[3] Şema doğrulama')
  const expectedTables = [
    'users',
    'refresh_tokens',
    'magic_link_tokens',
    'weddings',
    'wedding_members',
    'invites',
  ]
  for (const table of expectedTables) {
    const r = await db.query(
      `SELECT to_regclass('public.${table}') AS t`,
    )
    if (r.rows[0]?.t === table) ok(`${table} tablosu mevcut`)
    else bad(`${table} tablosu YOK`)
  }

  // --- users kolonları ---
  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
  `)
  const names = cols.rows.map((r) => r.column_name)
  const required = ['id', 'email', 'display_name', 'email_verified_at', 'status', 'created_at', 'updated_at']
  const missing = required.filter((c) => !names.includes(c))
  if (missing.length === 0) ok(`users: ${required.length} zorunlu kolon mevcut`)
  else bad(`users: eksik kolonlar → ${missing.join(', ')}`)

  // --- Auth tabloları kolon kontrolü ---
  const tableColumns = {
    refresh_tokens: ['id', 'user_id', 'token_hash', 'expires_at', 'revoked_at'],
    magic_link_tokens: ['id', 'user_id', 'token_hash', 'short_code_hash', 'attempts', 'expires_at', 'used_at'],
    weddings: ['id', 'couple_names', 'wedding_date', 'timezone', 'plan', 'status'],
    wedding_members: ['id', 'wedding_id', 'user_id', 'role'],
    invites: ['id', 'wedding_id', 'code', 'role', 'expires_at', 'used_at'],
  }
  for (const [table, expected] of Object.entries(tableColumns)) {
    const r = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
    `, [table])
    const have = r.rows.map((x) => x.column_name)
    const miss = expected.filter((c) => !have.includes(c))
    if (miss.length === 0) ok(`${table}: ${expected.length} zorunlu kolon`)
    else bad(`${table}: eksik → ${miss.join(', ')}`)
  }

  // --- UTF-8 ---
  console.log('\n[4] UTF-8')
  const tr = await db.query(`SELECT 'şğıöçüİŞĞÜÖÇ'::text AS t`)
  if (tr.rows[0]?.t === 'şğıöçüİŞĞÜÖÇ') ok('Türkçe karakter round-trip doğru')
  else bad(`Türkçe karakter bozuldu: ${tr.rows[0]?.t}`)

  const enc = await db.query(`SHOW server_encoding`)
  const encoding = String(Object.values(enc.rows[0] ?? {})[0] ?? '').toLowerCase()
  if (encoding === 'utf8') ok(`encoding: ${encoding}`)
  else bad(`encoding UTF-8 değil: ${encoding}`)

  // --- UUID default ---
  console.log('\n[5] UUID ve constraint')
  const ins = await db.query(
    `INSERT INTO users (email, display_name) VALUES ('verify@test.local','Verify') RETURNING id, status`,
  )
  if (ins.rows[0]?.id) ok(`uuid default çalışıyor (${String(ins.rows[0].id).slice(0, 8)}...)`)
  else bad('uuid default üretmedi')

  if (ins.rows[0]?.status === 'ACTIVE') ok('status default ACTIVE')
  else bad(`status default yanlış: ${ins.rows[0]?.status}`)

  // --- Unique constraint ---
  try {
    await db.query(
      `INSERT INTO users (email, display_name) VALUES ('verify@test.local','Tekrar')`,
    )
    bad('unique constraint çalışmadı — aynı e-posta iki kez eklendi')
  } catch {
    ok('unique constraint çalışıyor')
  }

  // --- İndeksler ---
  const idx = await db.query(
    `SELECT indexname FROM pg_indexes WHERE tablename='users' ORDER BY indexname`,
  )
  const idxNames = idx.rows.map((r) => r.indexname)
  const expectedIdx = ['users_status_idx', 'users_created_at_idx']
  const missingIdx = expectedIdx.filter((i) => !idxNames.includes(i))
  if (missingIdx.length === 0) ok(`indeksler: ${expectedIdx.join(', ')}`)
  else bad(`eksik indeksler: ${missingIdx.join(', ')}`)

  // --- [6] İlişkiler ve CASCADE ---
  console.log('\n[6] İlişkiler ve CASCADE')

  const uid = ins.rows[0].id

  // Düğün default'ları
  const w = await db.query(
    `INSERT INTO weddings (couple_names, wedding_date)
     VALUES ('E & M','2026-09-12T19:00:00Z')
     RETURNING id, plan, status, timezone`,
  )
  const wid = w.rows[0].id
  if (w.rows[0].plan === 'FREE') ok('weddings.plan default FREE')
  else bad(`plan default yanlış: ${w.rows[0].plan}`)
  if (w.rows[0].status === 'ACTIVE') ok('weddings.status default ACTIVE')
  else bad(`status default yanlış: ${w.rows[0].status}`)
  if (w.rows[0].timezone === 'Europe/Istanbul') ok('timezone default Europe/Istanbul')
  else bad(`timezone default yanlış: ${w.rows[0].timezone}`)

  // Üyelik
  await db.query(
    `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'OWNER')`,
    [wid, uid],
  )
  ok('wedding_members kaydı eklendi')

  // (wedding_id, user_id) unique
  try {
    await db.query(
      `INSERT INTO wedding_members (wedding_id, user_id, role) VALUES ($1,$2,'CO_OWNER')`,
      [wid, uid],
    )
    bad('unique (wedding_id,user_id) çalışmadı — çift üyelik eklendi')
  } catch {
    ok('unique (wedding_id,user_id) çalışıyor')
  }

  // Davet kodu
  await db.query(
    `INSERT INTO invites (wedding_id, code, role, expires_at)
     VALUES ($1,$2,'CO_OWNER', now() + interval '10 minutes')`,
    [wid, 'ABC2345'],
  )
  ok('davet kodu eklendi')

  try {
    await db.query(
      `INSERT INTO invites (wedding_id, code, role) VALUES ($1,$2,'CO_OWNER')`,
      [wid, 'ABC2345'],
    )
    bad('invites.code unique çalışmadı')
  } catch {
    ok('invites.code unique çalışıyor')
  }

  // Refresh token + CASCADE
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1,$2, now() + interval '90 days')`,
    [uid, 'dummy-hash'],
  )
  ok('refresh_token eklendi')

  // --- [7] Davetli şeması (Aşama 4) ---
  console.log('\n[7] Davetli şeması')

  const guest = await db.query(
    `INSERT INTO guests (wedding_id, name, side) VALUES ($1,'Ayşe','BRIDE')
     RETURNING id, rsvp, invite_status, phone, deleted_at`,
    [wid],
  )
  const gid = guest.rows[0].id
  if (guest.rows[0].rsvp === 'PENDING') ok('guests.rsvp default PENDING')
  else bad(`rsvp default yanlış: ${guest.rows[0].rsvp}`)
  if (guest.rows[0].invite_status === 'NOT_SENT') ok('guests.invite_status default NOT_SENT')
  else bad(`invite_status default yanlış: ${guest.rows[0].invite_status}`)
  if (guest.rows[0].phone === null) ok('guests.phone nullable')
  else bad('phone beklenmedik şekilde dolu')

  // Davetiye
  const invRow = await db.query(
    `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
     VALUES ($1,$2,'test-token-hash', now() + interval '90 days')
     RETURNING id, allowed_party_size, confirmed_party_size`,
    [wid, gid],
  )
  const invId = invRow.rows[0].id
  if (invRow.rows[0].allowed_party_size === 1) ok('allowed_party_size default 1')
  else bad(`allowed_party_size default yanlış: ${invRow.rows[0].allowed_party_size}`)
  if (invRow.rows[0].confirmed_party_size === null) ok('confirmed_party_size nullable')
  else bad('confirmed_party_size beklenmedik şekilde dolu')

  // token_hash UNIQUE
  try {
    await db.query(
      `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
       VALUES ($1,$2,'test-token-hash', now() + interval '90 days')`,
      [wid, gid],
    )
    bad('token_hash UNIQUE çalışmadı — aynı hash iki kez yazıldı')
  } catch {
    ok('token_hash UNIQUE çalışıyor')
  }

  // Ham token kolonu OLMAMALI
  const invCols = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='guest_invitations'`,
  )
  const colNames = invCols.rows.map((r) => r.column_name)
  if (!colNames.includes('token')) ok('ham token kolonu YOK (SECURITY §1.2)')
  else bad('guest_invitations.token kolonu var — ham token saklanıyor!')
  if (colNames.includes('token_hash')) ok('token_hash kolonu VAR')
  else bad('token_hash kolonu yok')

  // COMPOSITE FK: yanlış wedding_id reddedilmeli
  const otherWedding = await db.query(
    `INSERT INTO weddings (couple_names, wedding_date)
     VALUES ('X & Y','2027-01-01') RETURNING id`,
  )
  try {
    await db.query(
      `INSERT INTO guest_invitations (wedding_id, guest_id, token_hash, expires_at)
       VALUES ($1,$2,'wrong-wedding-hash', now() + interval '1 day')`,
      [otherWedding.rows[0].id, gid],
    )
    bad('COMPOSITE FK çalışmadı — yanlış wedding_id kabul edildi')
  } catch {
    ok('COMPOSITE FK yanlış wedding_id reddediyor')
  }

  // CASCADE: davetli silinince davetiye gider
  await db.query(`DELETE FROM guests WHERE id=$1`, [gid])
  const afterG = await db.query(
    `SELECT count(*)::int AS c FROM guest_invitations WHERE id=$1`,
    [invId],
  )
  if (afterG.rows[0].c === 0) ok('CASCADE: davetli → davetiye silindi')
  else bad(`CASCADE çalışmadı: ${afterG.rows[0].c} davetiye kaldı`)

  await db.query(`DELETE FROM weddings WHERE id=$1`, [otherWedding.rows[0].id])

  // --- [8] Yardımcı ve görev şeması (Aşama 5) ---
  console.log('\n[8] Yardımcı ve görev şeması')

  const hlp = await db.query(
    `INSERT INTO helpers (wedding_id, display_name, access_token_hash)
     VALUES ($1,'Ayşe','verify-hash-1') RETURNING id, token_revoked_at, last_seen_at`,
    [wid],
  )
  const hid = hlp.rows[0].id
  if (hlp.rows[0].token_revoked_at === null) ok('helpers.token_revoked_at nullable')
  else bad('token_revoked_at beklenmedik şekilde dolu')

  // Ham token kolonu OLMAMALI
  const hCols = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='helpers'`,
  )
  const hNames = hCols.rows.map((r) => r.column_name)
  if (!hNames.includes('token')) ok('helpers: ham token kolonu YOK (SECURITY §1.2)')
  else bad('helpers.token kolonu var — ham token saklanıyor!')

  // access_token_hash UNIQUE
  try {
    await db.query(
      `INSERT INTO helpers (wedding_id, display_name, access_token_hash)
       VALUES ($1,'İkinci','verify-hash-1')`,
      [wid],
    )
    bad('access_token_hash UNIQUE çalışmadı')
  } catch {
    ok('access_token_hash UNIQUE çalışıyor')
  }

  // Görev
  const tsk = await db.query(
    `INSERT INTO tasks (wedding_id, title, assignee_helper_id, assigned_at)
     VALUES ($1,'Görev',$2, now()) RETURNING id, status, priority, assigned_at`,
    [wid, hid],
  )
  const tid = tsk.rows[0].id
  if (tsk.rows[0].status === 'TODO') ok('tasks.status default TODO')
  else bad(`status default yanlış: ${tsk.rows[0].status}`)
  if (tsk.rows[0].priority === 'NORMAL') ok('tasks.priority default NORMAL')
  else bad(`priority default yanlış: ${tsk.rows[0].priority}`)
  if (tsk.rows[0].assigned_at !== null) ok('tasks.assigned_at yazıldı')
  else bad('assigned_at yazılmadı')

  // COMPOSITE FK: yanlış wedding_id ile atama reddedilmeli
  const otherW = await db.query(
    `INSERT INTO weddings (couple_names, wedding_date) VALUES ('X & Y','2027-02-02') RETURNING id`,
  )
  try {
    await db.query(
      `INSERT INTO tasks (wedding_id, title, assignee_helper_id)
       VALUES ($1,'Yanlış',$2)`,
      [otherW.rows[0].id, hid],
    )
    bad('COMPOSITE FK çalışmadı — yanlış wedding_id kabul edildi')
  } catch {
    ok('COMPOSITE FK yanlış wedding_id reddediyor')
  }
  await db.query(`DELETE FROM weddings WHERE id=$1`, [otherW.rows[0].id])

  // Mesaj CHECK kısıtları
  await db.query(
    `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body)
     VALUES ($1,$2,'COUPLE',$3,'merhaba')`,
    [wid, tid, uid],
  )
  ok('messages kaydı eklendi')

  try {
    await db.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, sender_user_id, body)
       VALUES ($1,$2,'COUPLE',$3,$4)`,
      [wid, tid, uid, 'a'.repeat(4001)],
    )
    bad('body CHECK çalışmadı — 4001 karakter kabul edildi')
  } catch {
    ok('body CHECK 4001 karakteri reddediyor')
  }

  // sender_kind yalnızca COUPLE | HELPER olabilir.
  // NOT: "sender_helper_id dolu olmalı" kuralı KULLANILAMAZ — FK
  // ON DELETE SET NULL ile çelişir (mesajı olan yardımcı silinemez).
  try {
    await db.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, body)
       VALUES ($1,$2,'ADMIN','gecersiz kind')`,
      [wid, tid],
    )
    bad('sender_kind CHECK çalışmadı — geçersiz değer kabul edildi')
  } catch {
    ok('sender_kind CHECK geçersiz değeri reddediyor')
  }

  // NULL sender id KABUL edilmeli (yardımcı silinince geçmiş kalır)
  try {
    await db.query(
      `INSERT INTO messages (wedding_id, task_id, sender_kind, body)
       VALUES ($1,$2,'HELPER','yardımcı silinmiş')`,
      [wid, tid],
    )
    ok('sender_helper_id NULL kabul ediliyor (geçmiş korunur)')
  } catch {
    bad('sender_helper_id NULL reddedildi — SET NULL FK ile çelişki')
  }

  // CASCADE: görev silinince mesajlar gider
  await db.query(`DELETE FROM tasks WHERE id=$1`, [tid])
  const afterT = await db.query(
    `SELECT count(*)::int AS c FROM messages WHERE task_id=$1`,
    [tid],
  )
  if (afterT.rows[0].c === 0) ok('CASCADE: görev → mesajlar silindi')
  else bad(`CASCADE çalışmadı: ${afterT.rows[0].c} mesaj kaldı`)

  // Düğün silinince üyelik + davet CASCADE
  await db.query(`DELETE FROM weddings WHERE id=$1`, [wid])
  const afterW = await db.query(
    `SELECT
       (SELECT count(*)::int FROM wedding_members WHERE wedding_id=$1) AS members,
       (SELECT count(*)::int FROM invites WHERE wedding_id=$1) AS invites`,
    [wid],
  )
  const { members, invites: invCount } = afterW.rows[0]
  if (members === 0 && invCount === 0) ok('CASCADE: düğün → üyelik + davet silindi')
  else bad(`CASCADE çalışmadı: üyelik=${members}, davet=${invCount}`)

  // Kullanıcı silinince refresh_token CASCADE
  await db.query(`DELETE FROM users WHERE id=$1`, [uid])
  const afterU = await db.query(
    `SELECT count(*)::int AS c FROM refresh_tokens WHERE user_id=$1`,
    [uid],
  )
  if (afterU.rows[0].c === 0) ok('CASCADE: kullanıcı → refresh_token silindi')
  else bad(`CASCADE çalışmadı: ${afterU.rows[0].c} refresh_token kaldı`)

} finally {
  await db.close()
}

console.log('\n==========================================')
if (failures === 0) {
  console.log(' 🎉 TÜM DOĞRULAMALAR GEÇTİ')
  process.exit(0)
} else {
  console.log(` ⚠️  ${failures} DOĞRULAMA BAŞARISIZ`)
  process.exit(1)
}
