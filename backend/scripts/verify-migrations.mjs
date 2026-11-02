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
  const expectedTables = ['users']
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
