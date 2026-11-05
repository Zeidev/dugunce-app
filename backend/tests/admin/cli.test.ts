/**
 * CLI provizyonu — `createAdminAccount` + gizli parola girişi.
 *
 * NEDEN AYRI DOSYA: ilk `SUPER_ADMIN` hesabını oluşturmanın BAŞKA yolu
 * yoktur. Web'den oluşturma ucu BİLEREK yoktur (yetki yükseltme yüzeyi
 * açmamak için); hesap yalnız sunucuya erişimi olan operatör tarafından,
 * komut satırından açılır. Bu dosya o yolun sözleşmesini kilitler:
 *
 * 1. AYNI e-posta REDDEDİLİR, üzerine YAZILMAZ (aksi hâlde parola
 *    sıfırlama ucu gibi çalışır ve hesap ele geçirilebilir).
 * 2. Zayıf parola `validatePasswordStrength` ile reddedilir (16+).
 * 3. Parola terminalde GÖRÜNMEZ (echo kapalı) ve hiçbir yere LOG'lanmaz
 *    — audit metadata'sına bile yazılmaz.
 * 4. Oluşturma `ADMIN_CREATED` audit'i yazar (SYSTEM, actorId yok).
 * 5. E-posta YAZARKEN girişle AYNI zincirle normalize edilir
 *    (`.trim().toLowerCase().normalize('NFC')`). Farklı olsaydı
 *    `Owner@X.com` ile açılan hesap `owner@x.com` ile ASLA giriş
 *    yapamazdı — sessiz, teşhisi zor bir hata sınıfı.
 * 6. Web'den oluşturma ucu YOK: `POST /api/v1/admin/auth/register` 404.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Mock } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import request from 'supertest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../src/db/schema.js'
import {
  createAdminAccount,
  loginAdmin,
  verifyPassword,
} from '../../src/admin/service.js'
import type { CreateAdminDeps } from '../../src/admin/service.js'
import { drizzleAdminDeps } from '../../src/admin/store.js'
import { drizzleCreateAdminDeps } from '../../src/admin/provision-store.js'
import { readHiddenLine } from '../../src/admin/prompt.js'
import { createApp } from '../../src/app.js'
import { runCli } from '../../src/admin/provision-cli.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../src/db/migrations')

/** 16+ karakter, harf + rakam — Task 2 kuralını sağlar. */
const PASSWORD = 'cok-guclu-BIR-parola-123'

// ---------------------------------------------------------------------------
// Servis testleri — SAHTE bağımlılıklar (DB yok)
// ---------------------------------------------------------------------------

/**
 * Sahte bağımlılıklar.
 *
 * DİKKAT: yalnız ÜÇ metot var (`findAdminByEmail`, `insertAdminAccount`,
 * `writeAudit`) ve DÖNÜŞTE `as` KAÇIŞI YOK. `CreateAdminDeps` dar bir
 * arayüz olduğu için bu nesne ona YAPISAL olarak uyuyor; arayüz bir gün
 * `AdminDeps`'e genişletilirse bu dosya DERLENMEZ ve daraltmanın
 * bozulduğu hemen görülür.
 */
type Deps = CreateAdminDeps & {
  findAdminByEmail: Mock
  insertAdminAccount: Mock
  writeAudit: Mock
}

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    findAdminByEmail: vi.fn().mockResolvedValue(null),
    insertAdminAccount: vi.fn().mockResolvedValue({ id: 'a1' }),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('createAdminAccount', () => {
  it('gecerli parola ile hesap olusturur', async () => {
    const d = makeDeps()
    const r = await createAdminAccount(
      { email: 'owner@t.local', displayName: 'Ürün Sahibi', password: PASSWORD },
      d,
    )

    expect(r).toEqual({ id: 'a1' })
    // Parola DÜZ METİN olarak yazılmamalı; yalnız hash gitmeli.
    const values = d.insertAdminAccount.mock.calls[0]![0] as {
      email: string
      displayName: string
      passwordHash: string
    }
    expect(values.email).toBe('owner@t.local')
    expect(values.displayName).toBe('Ürün Sahibi')
    expect(values.passwordHash).toMatch(/^\$argon2id\$/)
    expect(values.passwordHash).not.toContain(PASSWORD)
    expect(await verifyPassword(values.passwordHash, PASSWORD)).toBe(true)
    // Dönen nesne de parola taşımaz.
    expect(JSON.stringify(r)).not.toContain(PASSWORD)
  })

  it('zayif parola reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createAdminAccount(
        { email: 'a@t.local', displayName: 'A', password: 'kisa' },
        d,
      ),
    ).rejects.toThrow(/16/)

    // Zayıf parolada HİÇBİR yazma yok: ne hesap ne audit.
    expect(d.insertAdminAccount).not.toHaveBeenCalled()
    expect(d.writeAudit).not.toHaveBeenCalled()
  })

  it('rakamsiz parola reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createAdminAccount(
        { email: 'a@t.local', displayName: 'A', password: 'parola-yok-rakam-yok' },
        d,
      ),
    ).rejects.toThrow(/rakam/i)
    expect(d.insertAdminAccount).not.toHaveBeenCalled()
  })

  it('AYNI e-posta varsa REDDEDER (uzerine yazmaz)', async () => {
    const d = makeDeps({
      findAdminByEmail: vi.fn().mockResolvedValue({
        id: 'mevcut',
        email: 'a@t.local',
        displayName: 'Eski',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$tuz$hash',
      }),
    })

    await expect(
      createAdminAccount(
        { email: 'a@t.local', displayName: 'Yeni', password: PASSWORD },
        d,
      ),
    ).rejects.toThrow(/zaten/i)

    // KRİTİK: yazma YOK. Insert edilseydi ya unique kısıtı patlar ya da
    // (upsert yazılsaydı) parola sessizce DEĞİŞİR, hesap ele geçirilirdi.
    expect(d.insertAdminAccount).not.toHaveBeenCalled()
    expect(d.writeAudit).not.toHaveBeenCalled()
  })

  it('e-postayi YAZARKEN girisle ayni sekilde normalize eder', async () => {
    const d = makeDeps()
    await createAdminAccount(
      { email: '  Owner@X.com ', displayName: 'A', password: PASSWORD },
      d,
    )
    // Sorgu da yazma da NORMALİZE e-posta ile.
    expect(d.findAdminByEmail).toHaveBeenCalledWith('owner@x.com')
    expect(d.insertAdminAccount.mock.calls[0]![0].email).toBe('owner@x.com')
  })

  it('olusturma audit e yazilir (ADMIN_CREATED, SYSTEM, actorId yok)', async () => {
    const d = makeDeps()
    await createAdminAccount(
      { email: 'owner@t.local', displayName: 'Ürün Sahibi', password: PASSWORD },
      d,
    )

    expect(d.writeAudit).toHaveBeenCalledTimes(1)
    const entry = d.writeAudit.mock.calls[0]![0] as {
      action: string
      actorType: string
      actorId: string | null
      targetType: string | null
      targetId: string | null
      metadata: Record<string, unknown> | null
    }
    expect(entry.action).toBe('ADMIN_CREATED')
    // Hesabı CLI açtı: aktör bir admin DEĞİL, sistemin kendisi.
    expect(entry.actorType).toBe('SYSTEM')
    expect(entry.actorId).toBeNull()
    expect(entry.targetId).toBe('a1')
    expect(entry.metadata).toMatchObject({ email: 'owner@t.local' })

    // PAROLA HİÇBİR ALANA YAZILMAZ — metadata, targetId, hiçbiri.
    expect(JSON.stringify(entry)).not.toContain(PASSWORD)
    expect(JSON.stringify(entry)).not.toContain('argon2')
  })

  it('gecersiz e-posta reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createAdminAccount(
        { email: 'gecersiz', displayName: 'A', password: PASSWORD },
        d,
      ),
    ).rejects.toThrow(/e-posta/i)
    expect(d.insertAdminAccount).not.toHaveBeenCalled()
  })

  it('bos gorunen ad reddedilir', async () => {
    const d = makeDeps()
    await expect(
      createAdminAccount(
        { email: 'a@t.local', displayName: '   ', password: PASSWORD },
        d,
      ),
    ).rejects.toThrow()
    expect(d.insertAdminAccount).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Gerçek PGlite — yazma ile okuma normalizasyonunun AYNI olduğunu kanıtlar
// ---------------------------------------------------------------------------

let pg: PGlite
let store: ReturnType<typeof drizzleAdminDeps>
let createDeps: ReturnType<typeof drizzleCreateAdminDeps>

beforeAll(async () => {
  pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const st of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(st)
    }
  }
  const db = drizzle(pg, { schema })
  store = drizzleAdminDeps(db as unknown as Parameters<typeof drizzleAdminDeps>[0])
  createDeps = drizzleCreateAdminDeps(
    db as unknown as Parameters<typeof drizzleCreateAdminDeps>[0],
  )
}, 120_000)

afterAll(async () => {
  await pg?.close()
})

describe('createAdminAccount — gercek DB', () => {
  it('hesabi Argon2id hash ile yazar ve o hesap GIRIS yapabilir', async () => {
    const created = await createAdminAccount(
      { email: 'Owner@X.com', displayName: 'Ürün Sahibi', password: PASSWORD },
      createDeps,
    )
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)

    // DB'deki satır: e-posta NORMALİZE, parola HASH'li.
    const rows = await pg.query<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM admin_accounts WHERE id = $1',
      [created.id],
    )
    const row = rows.rows[0]!
    expect(row.email).toBe('owner@x.com')
    expect(row.password_hash).toMatch(/^\$argon2id\$/)
    expect(row.password_hash).not.toContain(PASSWORD)

    // ASIL HATA SINIFI: farklı büyük/küçük harf ve boşlukla giriş
    // yapılabilmeli. Normalizasyon yazma ile okuma arasında farklı
    // olsaydı bu giriş `null` dönerdi.
    const login = await loginAdmin(
      { email: '  OWNER@x.COM  ', password: PASSWORD },
      store,
    )
    expect(login).not.toBeNull()
    expect(login!.admin.email).toBe('owner@x.com')
  })

  it('NFD yazilmis Turkce e-posta NFC olarak saklanir ve bulunur', async () => {
    // "Şeyma" iki şekilde yazılabilir: tek kod noktası (U+015E) veya
    // "S" + birleşik çengel (U+0053 U+0327). Ekranda AYNI, baytlarda farklı.
    const nfd = 'S\u0327eyma@x.com'
    const nfc = 'Şeyma@x.com'
    expect(nfd).not.toBe(nfc)

    const created = await createAdminAccount(
      { email: nfd, displayName: 'Şeyma', password: PASSWORD },
      createDeps,
    )
    const stored = await pg.query<{ email: string }>(
      'SELECT email FROM admin_accounts WHERE id = $1',
      [created.id],
    )
    expect(stored.rows[0]!.email).toBe('şeyma@x.com')
    expect(stored.rows[0]!.email).toBe(stored.rows[0]!.email.normalize('NFC'))

    const login = await loginAdmin({ email: nfc, password: PASSWORD }, store)
    expect(login).not.toBeNull()
  })

  it('AYNI e-posta ikinci kez REDDEDILIR ve MEVCUT parola DEGISMEZ', async () => {
    const first = await createAdminAccount(
      { email: 'dup@t.local', displayName: 'İlk', password: PASSWORD },
      createDeps,
    )
    const before = await pg.query<{ password_hash: string }>(
      'SELECT password_hash FROM admin_accounts WHERE id = $1',
      [first.id],
    )

    // Farklı parola + farklı büyük/küçük harf: yine reddedilmeli.
    await expect(
      createAdminAccount(
        { email: 'DUP@T.local', displayName: 'İkinci', password: 'baska-BIR-parola-456' },
        createDeps,
      ),
    ).rejects.toThrow(/zaten/i)

    const after = await pg.query<{ password_hash: string; display_name: string }>(
      'SELECT password_hash, display_name FROM admin_accounts WHERE id = $1',
      [first.id],
    )
    // Hash AYNI — üzerine yazılmadı. Görünen ad da değişmedi.
    expect(after.rows[0]!.password_hash).toBe(before.rows[0]!.password_hash)
    expect(after.rows[0]!.display_name).toBe('İlk')
    // Tek satır kaldı: ikinci hesap AÇILMADI.
    const count = await pg.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM admin_accounts WHERE email = 'dup@t.local'",
    )
    expect(count.rows[0]!.c).toBe('1')
  })

  it('olusturma audit kaydi DB ye yazilir — SYSTEM, actorId NULL, parola YOK', async () => {
    const created = await createAdminAccount(
      { email: 'audit@t.local', displayName: 'Denetim', password: PASSWORD },
      createDeps,
    )

    const rows = await pg.query<{
      action: string
      actor_type: string
      actor_id: string | null
      target_id: string | null
      metadata: unknown
    }>(
      `SELECT action, actor_type, actor_id, target_id, metadata
         FROM audit_logs WHERE action = 'ADMIN_CREATED' AND target_id = $1`,
      [created.id],
    )
    const row = rows.rows[0]
    expect(row).toBeDefined()
    expect(row!.actor_type).toBe('SYSTEM')
    expect(row!.actor_id).toBeNull()
    expect(row!.target_id).toBe(created.id)
    expect(JSON.stringify(row!.metadata)).not.toContain(PASSWORD)
    expect(JSON.stringify(row!.metadata)).not.toContain('argon2')
  })
})

// ---------------------------------------------------------------------------
// Web'den oluşturma ucu YOK
// ---------------------------------------------------------------------------

describe('admin olusturma ucu HTTP de YOK', () => {
  it('POST /api/v1/admin/auth/register 404 doner', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/admin/auth/register')
      .send({ email: 'yeni@t.local', displayName: 'Yeni', password: PASSWORD })
    expect(res.status).toBe(404)
    // Gövde de hesap sızdırmaz: kimlik bilgisi hatası değil, "böyle uç yok".
    expect(res.body).not.toHaveProperty('admin')
    expect(res.body).not.toHaveProperty('id')
  })

  it('benzer olusturma yollari da 404 doner', async () => {
    const app = createApp()
    for (const path of [
      '/api/v1/admin/auth/signup',
      '/api/v1/admin/register',
      '/api/v1/admin/admins',
      '/api/v1/admin/auth/create',
    ]) {
      const res = await request(app)
        .post(path)
        .send({ email: 'yeni@t.local', displayName: 'Yeni', password: PASSWORD })
      expect(res.status, path).toBe(404)
    }
  })
})

// ---------------------------------------------------------------------------
// Gizli parola girişi — terminalde ECHO YOK
// ---------------------------------------------------------------------------

/** Sahte TTY girdisi — `process.stdin` yerine testte kullanılır. */
class FakeInput extends EventEmitter {
  isTTY = true
  isRaw = false
  rawModes: boolean[] = []
  encoding = ''
  paused = false

  setRawMode(mode: boolean): this {
    this.isRaw = mode
    this.rawModes.push(mode)
    return this
  }

  resume(): this {
    return this
  }

  pause(): this {
    this.paused = true
    return this
  }

  setEncoding(encoding: BufferEncoding): this {
    this.encoding = encoding
    return this
  }
}

function makeIo(): { input: FakeInput; output: { write(chunk: string): boolean }; written: string[] } {
  const input = new FakeInput()
  const written: string[] = []
  return {
    input,
    written,
    output: {
      write(chunk: string): boolean {
        written.push(chunk)
        return true
      },
    },
  }
}

describe('readHiddenLine — parola ekrana YAZILMAZ', () => {
  it('girilen parolayi dondurur ama terminale YAZMAZ', async () => {
    const { input, output, written } = makeIo()
    const p = readHiddenLine('Parola: ', { input, output })

    input.emit('data', 'gizli')
    input.emit('data', '-parola-123\r')

    await expect(p).resolves.toBe('gizli-parola-123')
    // Ekrana yalnız istem ve satır sonu gider.
    expect(written.join('')).toBe('Parola: \n')
    expect(written.join('')).not.toContain('gizli')
    expect(written.join('')).not.toContain('parola-123')
  })

  it('raw mod acilir ve kapanir (echo gercekten kapatilir)', async () => {
    const { input, output } = makeIo()
    const p = readHiddenLine('Parola: ', { input, output })
    input.emit('data', 'abc\r')
    await p
    expect(input.rawModes).toEqual([true, false])
  })

  it('geri silme karakteri desteklenir', async () => {
    const { input, output } = makeIo()
    const p = readHiddenLine('Parola: ', { input, output })
    input.emit('data', 'gizlix\u007f\r')
    await expect(p).resolves.toBe('gizli')
  })

  it('Ctrl-C iptal eder ve degeri sizdirmaz', async () => {
    const { input, output, written } = makeIo()
    const p = readHiddenLine('Parola: ', { input, output })
    input.emit('data', 'gizli\u0003')
    await expect(p).rejects.toThrow(/iptal/i)
    expect(written.join('')).not.toContain('gizli')
    // Ham mod geri kapatılmalı — aksi hâlde terminal bozuk kalır.
    expect(input.rawModes).toEqual([true, false])
  })

  it('TTY olmayan girdide de okur (pipe ile otomasyon)', async () => {
    const { input, output } = makeIo()
    input.isTTY = false
    const p = readHiddenLine('Parola: ', { input, output })
    input.emit('data', 'pipe-parola-123\n')
    await expect(p).resolves.toBe('pipe-parola-123')
    expect(input.rawModes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// CLI kablolaması — argüman → servis → store → audit
// ---------------------------------------------------------------------------

describe('create-admin CLI', () => {
  /**
   * Sahte terminal.
   *
   * `runCli` gerçek `process.stdin`/`stdout`'a dokunmasın diye enjekte
   * edilir; aksi hâlde testler terminal durumunu (raw mode) bozar.
   */
  function makeCliIo(): {
    io: { input: NodeJS.ReadStream; output: NodeJS.WriteStream }
    written: string[]
  } {
    const written: string[] = []
    const output = {
      write(chunk: string): boolean {
        written.push(chunk)
        return true
      },
    } as unknown as NodeJS.WriteStream
    return { io: { input: process.stdin, output }, written }
  }

  /** STDIN yerine geçen akış — `--password-stdin` yolu için. */
  function stdinWith(text: string): NodeJS.ReadStream {
    return Readable.from([Buffer.from(text, 'utf8')]) as unknown as NodeJS.ReadStream
  }

  it('--email/--name/--password-stdin ile hesap olusturur, parolayi YAZMAZ', async () => {
    const email = `cli${Date.now()}@t.local`
    const { written } = makeCliIo()
    const io = { input: stdinWith(`${PASSWORD}\n`), output: {
      write(chunk: string): boolean {
        written.push(chunk)
        return true
      },
    } as unknown as NodeJS.WriteStream }

    const code = await runCli(
      ['--email', email, '--name', 'CLI Kullanıcı', '--password-stdin'],
      io,
      () => createDeps,
    )

    expect(code).toBe(0)
    const out = written.join('')
    expect(out).toContain('Yönetici hesabı oluşturuldu')
    // ÇIKTI PAROLA İÇERMEZ — ne düz metin ne hash.
    expect(out).not.toContain(PASSWORD)
    expect(out).not.toContain('argon2')

    // Gerçekten yazıldı ve giriş yapılabiliyor.
    const login = await loginAdmin({ email, password: PASSWORD }, store)
    expect(login).not.toBeNull()
  })

  it('--password reddedilir (surec argumaninda parola gorunur)', async () => {
    const { io } = makeCliIo()
    await expect(
      runCli(['--email', 'a@t.local', '--name', 'A', '--password', PASSWORD], io, () => createDeps),
    ).rejects.toThrow(/password/i)
  })

  it('bilinmeyen secenek sessizce yok sayilmaz', async () => {
    const { io } = makeCliIo()
    await expect(runCli(['--pasword', 'x'], io, () => createDeps)).rejects.toThrow(/Bilinmeyen/i)
  })

  it('--help hesap olusturmadan 0 doner', async () => {
    const { io, written } = makeCliIo()
    const code = await runCli(['--help'], io, () => createDeps)
    expect(code).toBe(0)
    expect(written.join('')).toContain('Kullanım')
  })

  it('zayif parolada hesap ACILMAZ ve hata parolayi yansitmaz', async () => {
    const email = `zayif${Date.now()}@t.local`
    const { written } = makeCliIo()
    const io = {
      input: stdinWith('kisa\n'),
      output: { write: (c: string) => { written.push(c); return true } } as unknown as NodeJS.WriteStream,
    }

    await expect(
      runCli(['--email', email, '--name', 'A', '--password-stdin'], io, () => createDeps),
    ).rejects.toThrow(/16/)

    // Hiç hesap açılmadı.
    expect(await store.findAdminByEmail(email)).toBeNull()
  })
})

describe('create-admin CLI — STDIN guvenligi', () => {
  function cliIo(input: NodeJS.ReadStream): {
    io: { input: NodeJS.ReadStream; output: NodeJS.WriteStream }
    written: string[]
  } {
    const written: string[] = []
    return {
      written,
      io: {
        input,
        output: {
          write(chunk: string): boolean {
            written.push(chunk)
            return true
          },
        } as unknown as NodeJS.WriteStream,
      },
    }
  }

  it('--password-stdin e-posta/ad yoksa REDDEDER (parola e-posta sanilmasin)', async () => {
    // Boru hattında STDIN paroladır; `readline` ondan soru sorarsa parola
    // hem ekrana basılır hem e-posta olarak kullanılır.
    const { io, written } = cliIo(
      Readable.from([Buffer.from(`${PASSWORD}\n`)]) as unknown as NodeJS.ReadStream,
    )

    await expect(runCli(['--password-stdin'], io, () => createDeps)).rejects.toThrow(
      /--email ve --name/i,
    )
    expect(written.join('')).not.toContain(PASSWORD)
  })
})

describe('create-admin CLI — etkilesimli parola', () => {
  /**
   * Sıraya dizilmiş sahte TTY.
   *
   * `runCli` etkileşimli yolda parolayı İKİ kez sorar; her `on('data')`
   * çağrısında sıradaki parçayı asenkron olarak yayar. Gerçek TTY
   * davranışını (raw mode + echo kapalı) taklit eder.
   */
  function queuedTty(chunks: string[]): {
    input: NodeJS.ReadStream
    written: string[]
    rawModes: boolean[]
  } {
    const written: string[] = []
    const rawModes: boolean[] = []
    let idx = 0

    class QueuedTty extends EventEmitter {
      isTTY = true
      isRaw = false
      setRawMode(mode: boolean): this {
        this.isRaw = mode
        rawModes.push(mode)
        return this
      }
      setEncoding(): this { return this }
      resume(): this { return this }
      pause(): this { return this }
    }

    const tty = new QueuedTty()
    const originalOn = tty.on.bind(tty)
    tty.on = ((event: string, listener: (chunk: string) => void) => {
      originalOn(event, listener)
      if (event === 'data') {
        const chunk = chunks[idx++]
        if (chunk !== undefined) setImmediate(() => tty.emit('data', chunk))
      }
      return tty
    }) as typeof tty.on

    return {
      input: tty as unknown as NodeJS.ReadStream,
      written,
      rawModes,
    }
  }

  it('parolalar eslesmezse hesap ACILMAZ', async () => {
    const email = `uyusmaz${Date.now()}@t.local`
    const tty = queuedTty([`${PASSWORD}\r`, 'baska-BIR-parola-456\r'])

    const io = {
      input: tty.input,
      output: {
        write(chunk: string): boolean {
          tty.written.push(chunk)
          return true
        },
      } as unknown as NodeJS.WriteStream,
    }

    await expect(
      runCli(['--email', email, '--name', 'A'], io, () => createDeps),
    ).rejects.toThrow(/eşleşmedi/i)

    // Hiç hesap açılmadı — yazım hatasıyla girilemez bir hesap bırakılmaz.
    expect(await store.findAdminByEmail(email)).toBeNull()
    // Parolalar ekrana basılmadı.
    const out = tty.written.join('')
    expect(out).not.toContain(PASSWORD)
    expect(out).not.toContain('baska-BIR-parola-456')
    // Ham mod her iki soruda da açılıp kapatıldı.
    expect(tty.rawModes).toEqual([true, false, true, false])
  })

  it('eslesen parolada hesap acilir ve parola ekrana YAZILMAZ', async () => {
    const email = `uyusan${Date.now()}@t.local`
    const tty = queuedTty([`${PASSWORD}\r`, `${PASSWORD}\r`])
    const io = {
      input: tty.input,
      output: {
        write(chunk: string): boolean {
          tty.written.push(chunk)
          return true
        },
      } as unknown as NodeJS.WriteStream,
    }

    const code = await runCli(['--email', email, '--name', 'A'], io, () => createDeps)
    expect(code).toBe(0)
    expect(tty.written.join('')).not.toContain(PASSWORD)

    // Gerçekten giriş yapılabiliyor.
    const login = await loginAdmin({ email, password: PASSWORD }, store)
    expect(login).not.toBeNull()
  })
})

describe('non-TTY: SESSIZ basari YOK (gercek hata)', () => {
  /**
   * NEDEN BU TEST:
   * `rl.question()` bir EOF akışında hiç çözülmüyordu; Node olay
   * döngüsü boşalıp süreç **exit 0** ile çıkıyordu — hiçbir hesap
   * oluşturulmadan "başarılı" görünüyordu. İlk kurulumda tam da en
   * kötü anda sessiz başarısızlık.
   */
  it('TTY yokken (stdin kapalı) SIFIR-DISI kod dondurur', async () => {
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/create-admin.ts'],
      { input: '', encoding: 'utf8', timeout: 20_000, cwd: process.cwd() },
    )
    // Sessiz başarı YASAK: ya hata kodu ya da gerçek bir hesap.
    expect(r.status).not.toBe(0)
    expect(String(r.stderr ?? '')).toMatch(/kapand|TTY|stdin/i)
  }, 25_000)
})

describe('23505 YARIS korumasi — TOCTOU penceresi', () => {
  /**
   * NEDEN: `findAdminByEmail` "yok" dedikten sonra araya giren başka
   * bir ekleme olursa, INSERT 23505 (unique violation) fırlatır.
   * Yakalanmazsa kullanıcı ham PostgreSQL hatası görür; yakalanırsa
   * anlamlı `ADMIN_EMAIL_EXISTS` döner. Bu koruma test edilmiyordu —
   * silinse tüm testler yeşil kalıyordu.
   */
  it('on-kontrol yalan soylese bile unique ihlali ADMIN_EMAIL_EXISTS olur', async () => {
    const d = makeDeps({
      // On-kontrol "yok" diyor ama INSERT patlayacak.
      findAdminByEmail: vi.fn().mockResolvedValue(null),
      insertAdminAccount: vi.fn().mockRejectedValue(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      ),
    })

    await expect(
      createAdminAccount(
        { email: 'a@t.local', displayName: 'A', password: 'guclu-parola-123' },
        d,
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_EMAIL_EXISTS' })
  })

  it('GERCEK DB: yarisi kaybeden INSERT ADMIN_EMAIL_EXISTS dondurur', async () => {
    // Yukarıdaki test sahte bir 23505 fırlatır — çevirinin çağıranda
    // olduğunu kanıtlar. Bu test ise GERÇEK PostgreSQL hatasının
    // (PGlite) aynı yola düştüğünü kanıtlar: sürücü hatayı `cause`
    // içine sararsa `isUniqueViolation` onu bulmalı, aksi hâlde
    // operatör ham "duplicate key value..." metnini görür.
    await createAdminAccount(
      { email: 'race@t.local', displayName: 'İlk', password: PASSWORD },
      createDeps,
    )

    // On-kontrolü ATLA: doğrudan store'a yaz, UNIQUE kısıtı devreye girsin.
    const deps: Parameters<typeof createAdminAccount>[1] = {
      // "Yok" diyen bir okuma — yarış penceresini taklit eder.
      findAdminByEmail: async () => null,
      writeAudit: createDeps.writeAudit,
      insertAdminAccount: createDeps.insertAdminAccount,
    }

    await expect(
      createAdminAccount(
        { email: 'RACE@t.local', displayName: 'İkinci', password: PASSWORD },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_EMAIL_EXISTS', statusCode: 409 })
  })
})
