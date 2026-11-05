#!/usr/bin/env node
/**
 * Geliştirme sarmalayıcısı — asıl CLI `src/admin/provision-cli.ts`'te.
 *
 * NEDEN İNCE: `tsconfig.json` `scripts/` dizinini `exclude` ediyor, yani
 * buradaki kod `dist/`'e DERLENMEZ ve üretimde (`npm ci --omit=dev`, yani
 * `tsx` yok) ÇALIŞMAZ. Mantık bu yüzden `src/`'te duruyor; bu dosya
 * yalnız geliştirmede `npx tsx scripts/create-admin.ts` yazılabilsin diye
 * var (aynı desen: `scripts/migrate.ts` ↔ `src/db/migrate-cli.ts`).
 *
 * ÜRETİMDE KULLANIM:
 *   node dist/admin/provision-cli.js --email ... --name ...
 */

import { main } from '../src/admin/provision-cli.js'

void main(process.argv.slice(2))
