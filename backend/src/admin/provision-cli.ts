#!/usr/bin/env node
/**
 * İlk SUPER_ADMIN hesabını oluşturan CLI (Task 8, spec §6.1).
 *
 * NEDEN CLI: Web'den admin oluşturma ucu BİLEREK YOKTUR. Böyle bir uç,
 * herkese açık bir "yetki yükseltme" yüzeyi demektir — korunması gereken
 * tek şey olsa bile bir gün yanlış middleware sırası ya da eksik CSRF
 * kontrolüyle panel ele geçirilebilir. Hesap yalnız sunucuya (SSH)
 * erişimi olan operatör tarafından açılır.
 *
 * NEDEN `src/` İÇİNDE (scripts/ DEĞİL): üretimde `npm ci --omit=dev`
 * çalışıyor, yani `tsx` YOK. `scripts/` dizini `tsconfig.json`'da
 * `exclude` edildiği için `tsc` oradaki dosyaları DERLEMEZ — CLI yalnız
 * `tsx` ile çalışır ve sunucuda hiç çalışmazdı. Bu modül `dist/`'e
 * derlenir; `scripts/create-admin.ts` yalnız geliştirme kolaylığı için
 * ince bir sarmalayıcıdır (aynı desen: `migrate.ts` ↔ `migrate-cli.ts`).
 *
 * KULLANIM
 *
 *   # geliştirme
 *   npx tsx scripts/create-admin.ts
 *   npx tsx scripts/create-admin.ts --email owner@dugunce.com.tr --name "Ürün Sahibi"
 *
 *   # üretim (derlenmiş)
 *   node dist/admin/provision-cli.js --email owner@dugunce.com.tr --name "Ürün Sahibi"
 *
 * Parola HER ZAMAN terminalden, ECHO KAPALI olarak sorulur. `--password`
 * diye bir bayrak YOKTUR ve bilinçli olarak eklenmez:
 *
 *   - `ps aux` çıktısında, `~/.bash_history`'de ve `journalctl`'de görünür,
 *   - CI log'larına kopyalanır.
 *
 * Otomasyon için `--password-stdin` vardır: parola STDIN'den okunur
 * (ör. `pass show admin | node dist/admin/provision-cli.js --password-stdin`),
 * yani süreç argümanlarında yine görünmez.
 *
 * ÇIKIŞ KODLARI
 *   0 — hesap oluşturuldu
 *   1 — doğrulama hatası (zayıf parola, aynı e-posta, bozuk e-posta…)
 *  130 — operatör Ctrl-C ile iptal etti
 */

// `dotenv/config` yan etki importu; SIRASI KRİTİK — `getDb()` ilk
// sorguda `loadEnv()` çağırıyor, yani .env bu import'tan SONRA okunmalı.
// Diğer CLI'larla (`migrate.ts`, `migrate-cli.ts`) aynı desen.
import 'dotenv/config'

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createAdminAccount, MIN_ADMIN_PASSWORD_LENGTH } from './service.js'
import type { CreateAdminDeps } from './service.js'
import { drizzleCreateAdminDeps } from './provision-store.js'
import { readHiddenLine, PromptCancelledError } from './prompt.js'
import { closeDb } from '../db/client.js'
import { AppError } from '../lib/errors.js'

/** Ayrıştırılmış komut satırı. */
export interface CliArgs {
  email?: string
  name?: string
  /** Parolayı terminal yerine STDIN'den oku (otomasyon). */
  passwordStdin: boolean
  help: boolean
}

/**
 * Kullanım hatası — operatörün komutu yanlış yazdığı durumlar.
 *
 * `AppError` DEĞİL: bu bir HTTP hatası değil, süreç seviyesinde bir
 * kullanım hatasıdır. CLI bunu yakalayıp yardım metnini basar.
 */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
    Object.setPrototypeOf(this, CliUsageError.prototype)
  }
}

const USAGE = `Kullanım: npx tsx scripts/create-admin.ts [seçenekler]
          (üretim: node dist/admin/provision-cli.js [seçenekler])

Seçenekler:
  --email <adres>      Yönetici e-postası (verilmezse sorulur)
  --name <ad>          Görünen ad (verilmezse sorulur)
  --password-stdin     Parolayı terminal yerine STDIN'den oku (otomasyon)
  -h, --help           Bu yardımı göster

Parola en az ${MIN_ADMIN_PASSWORD_LENGTH} karakter olmalı, en az bir harf ve
bir rakam içermeli. Parola terminalde GÖRÜNMEZ ve hiçbir yere log'lanmaz.`

/**
 * Argümanları ayrıştırır.
 *
 * `--password` KABUL EDİLMEZ: süreç argümanları `ps`/shell geçmişinde
 * görünür. Bilinmeyen bir bayrak sessizce yok sayılmaz — operatör
 * `--pasword` yazdığında "parolam neden sorulmuyor" durumuna düşmesin
 * diye kullanım hatası verilir.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { passwordStdin: false, help: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!

    if (arg === '-h' || arg === '--help') {
      args.help = true
      continue
    }
    if (arg === '--password-stdin') {
      args.passwordStdin = true
      continue
    }
    if (arg === '--email' || arg === '--name') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('-')) {
        throw new CliUsageError(`${arg} bir değer gerektirir`)
      }
      if (arg === '--email') args.email = value
      else args.name = value
      i += 1
      continue
    }
    if (arg === '--password') {
      throw new CliUsageError(
        '--password desteklenmiyor: parola süreç argümanlarında görünür. ' +
          'Etkileşimli sorulur; otomasyon için --password-stdin kullanın.',
      )
    }
    throw new CliUsageError(`Bilinmeyen seçenek: ${arg}`)
  }

  return args
}

/** Terminalden tek satır okur (echo AÇIK — yalnız e-posta/ad için). */
async function readVisibleLine(
  prompt: string,
  io: { input: NodeJS.ReadStream; output: NodeJS.WriteStream },
): Promise<string> {
  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({ input: io.input, output: io.output })
  try {
    return await rl.question(prompt)
  } finally {
    rl.close()
  }
}

/** STDIN'in tamamını tek satır olarak okur (`--password-stdin`). */
async function readStdinLine(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of input) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  // Yalnız SON satır sonu kırpılır: parolanın kendisi boşlukla
  // başlayabilir/bitemez, onu `trim()` ile bozmak yanlış olurdu.
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
}

/**
 * Parolayı iki kez sorar ve eşleştiğini doğrular.
 *
 * İKİ KEZ SORMAK ZORUNLU: echo kapalı olduğu için operatör yazdığını
 * GÖREMEZ; tek seferlik giriş bir yazım hatasını (ve dolayısıyla
 * girilemeyen bir hesabı) sessizce üretir. Parola sıfırlama akışı
 * olmadığı için bu hesap kurtarılamaz.
 */
async function promptPasswordTwice(
  io: { input: NodeJS.ReadStream; output: NodeJS.WriteStream },
): Promise<string> {
  const first = await readHiddenLine('Parola: ', io)
  const second = await readHiddenLine('Parola (tekrar): ', io)
  if (first !== second) {
    throw new CliUsageError('Parolalar eşleşmedi. Hiçbir hesap oluşturulmadı.')
  }
  return first
}

/** İnsan-okur hata mesajı — parola ASLA buraya girmez. */
function describeError(err: unknown): string {
  if (err instanceof AppError) return err.message
  if (err instanceof CliUsageError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * CLI gövdesi — test edilebilir olsun diye süreç girişinden ayrı.
 *
 * @returns Süreç çıkış kodu.
 */
export async function runCli(
  argv: readonly string[],
  io: { input: NodeJS.ReadStream; output: NodeJS.WriteStream } = {
    input: process.stdin,
    output: process.stdout,
  },
  /**
   * Test enjeksiyonu — verilmezse gerçek Drizzle deposu.
   *
   * NEDEN VAR: CLI'nin kablolaması (argüman → servis → store → audit)
   * gerçek bir PostgreSQL olmadan da kanıtlanabilmeli. Testler PGlite
   * deposu geçer; üretim yolu (`drizzleCreateAdminDeps()`) değişmez.
   */
  depsFactory: () => CreateAdminDeps = () => drizzleCreateAdminDeps(),
): Promise<number> {
  const args = parseArgs(argv)

  if (args.help) {
    io.output.write(`${USAGE}\n`)
    return 0
  }

  // `--password-stdin` ile e-posta/ad SORULAMAZ: STDIN bir boru hattıdır
  // ve `readline` ondan parolayı "e-posta" olarak okur. Sonuç: parola
  // ekrana basılır (echo açık readline) ve geçersiz e-posta hatası verir.
  // Operatörün parolası hem ifşa olur hem de işe yaramaz.
  if (args.passwordStdin && (args.email === undefined || args.name === undefined)) {
    throw new CliUsageError(
      '--password-stdin ile --email ve --name ZORUNLUDUR ' +
        '(STDIN parolaya ayrılmıştır, soru sorulamaz).',
    )
  }

  // E-posta ve görünen ad etkileşimli sorulabilir; parola HER ZAMAN
  // gizli okunur (bayrakla bile olsa argümandan gelmez).
  const email = args.email ?? (await readVisibleLine('E-posta: ', io)).trim()
  const displayName = args.name ?? (await readVisibleLine('Görünen ad: ', io)).trim()

  const password = args.passwordStdin
    ? await readStdinLine(io.input)
    : await promptPasswordTwice(io)

  const created = await createAdminAccount(
    { email, displayName, password },
    depsFactory(),
  )

  // ÇIKTI PAROLA İÇERMEZ — yalnız kimlik ve sonraki adım.
  io.output.write(
    [
      '',
      'Yönetici hesabı oluşturuldu.',
      `  id:      ${created.id}`,
      `  e-posta: ${email.trim().toLowerCase().normalize('NFC')}`,
      '',
      'Giriş: POST /api/v1/admin/auth/login',
      '',
    ].join('\n'),
  )

  return 0
}

/**
 * Süreç giriş noktası — yığın izi basmaz, çıkış kodunu ayarlar.
 *
 * `process.exit` ÖNCESİ `closeDb()`: açık postgres bağlantısı süreci
 * asılı bırakır (serv00'da Passenger altında özellikle).
 */
export async function main(argv: readonly string[]): Promise<never> {
  try {
    const code = await runCli(argv)
    await closeDb()
    process.exit(code)
  } catch (err) {
    await closeDb().catch(() => {})

    if (err instanceof PromptCancelledError) {
      process.stderr.write('\nİptal edildi. Hiçbir hesap oluşturulmadı.\n')
      process.exit(130)
    }

    // Hata mesajı parola İÇERMEZ: `AppError` mesajları yalnız kural
    // metni taşır, `validatePasswordStrength` gerekçesi de parolayı
    // yansıtmaz.
    process.stderr.write(`\nHATA: ${describeError(err)}\n`)
    if (err instanceof CliUsageError) process.stderr.write(`\n${USAGE}\n`)
    process.exit(1)
  }
}

// --- CLI giriş noktası ---
//
// Yalnız DOĞRUDAN çalıştırıldığında (`node dist/admin/provision-cli.js`)
// devreye girer; modül import edildiğinde ÇALIŞMAMALI — aksi hâlde testler
// gerçek DB'ye bağlanır ve `process.exit` çağırır.
const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectRun) {
  void main(process.argv.slice(2))
}
