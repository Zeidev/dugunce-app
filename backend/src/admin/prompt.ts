/**
 * Gizli satır okuma — parolayı terminalde GÖSTERMEDEN okur.
 *
 * NEDEN AYRI MODÜL: CLI provizyonunun (`scripts/create-admin.ts`) parolayı
 * `readline` ile sorması yeterli DEĞİLDİ; `readline` varsayılan olarak
 * yazılanı EKRANA BASAR. Operatörün omzunun üzerinden bakan biri ya da
 * `tmux`/`screen` kaydı parolayı ele geçirir. Burada `setRawMode(true)`
 * ile echo kapatılır, karakterler hiçbir yere yazılmadan toplanır.
 *
 * TEST EDİLEBİLİRLİK: `process.stdin`/`process.stdout` doğrudan
 * kullanılmaz; bağımlılıklar parametre olarak alınır. Böylece testler
 * sahte bir TTY ile "gerçekten echo kapatıldı mı", "geri silme çalışıyor
 * mu", "Ctrl-C ham modu geri kapatıyor mu" sorularını sorabilir.
 *
 * GÜVENLİK: okunan değer HİÇBİR yere yazılmaz — ne ekrana, ne log'a.
 * Dönen string yalnız `hashPassword`'a gider.
 */

/** Girdi kaynağı — `process.stdin` (TTY) veya test sahtesi. */
export interface HiddenInputSource {
  isTTY?: boolean
  setRawMode?(mode: boolean): unknown
  setEncoding?(encoding: BufferEncoding): unknown
  resume?(): unknown
  pause?(): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  off?(event: 'data', listener: (chunk: string) => void): unknown
  removeListener?(event: 'data', listener: (chunk: string) => void): unknown
}

/** Çıktı hedefi — `process.stdout`. */
export interface HiddenOutputTarget {
  write(chunk: string): unknown
}

export interface HiddenLineIo {
  input: HiddenInputSource
  output: HiddenOutputTarget
}

/**
 * Kullanıcı Ctrl-C ile iptal etti.
 *
 * Ayrı hata tipi: CLI bunu "beklenen iptal" olarak ele alıp 130 ile
 * çıkar, yığın izi basmaz. Mesaj parolayı İÇERMEZ.
 */
export class PromptCancelledError extends Error {
  constructor(message = 'Girdi iptal edildi') {
    super(message)
    this.name = 'PromptCancelledError'
    Object.setPrototypeOf(this, PromptCancelledError.prototype)
  }
}

/** Ctrl-C (ETX). */
const CTRL_C = '\u0003'
/** Backspace — hem DEL (0x7f) hem BS (0x08) kabul edilir. */
const BACKSPACE = new Set(['\u007f', '\b'])

/**
 * İstemi yazar, girdiyi ECHO OLMADAN okur, Enter'da değeri döner.
 *
 * `isTTY` false ise (boru/otomasyon) ham mod AÇILMAZ — TTY olmayan bir
 * akışta `setRawMode` çağırmak hata verir. Bu durumda echo zaten yoktur.
 *
 * @throws {PromptCancelledError} Ctrl-C basıldığında.
 */
export function readHiddenLine(prompt: string, io: HiddenLineIo): Promise<string> {
  const { input, output } = io
  const isTTY = input.isTTY === true

  return new Promise<string>((resolve, reject) => {
    let value = ''
    let settled = false

    const restoreTerminal = (): void => {
      // HAM MOD HER DURUMDA GERİ KAPATILIR — başarı, iptal, hata.
      // Kapatılmazsa terminal "echo'suz" kalır ve operatör kabuğunda
      // yazdığını göremez (ekran bozuk görünür).
      if (isTTY && typeof input.setRawMode === 'function') input.setRawMode(false)
    }

    const detach = (): void => {
      if (typeof input.off === 'function') input.off('data', onData)
      else if (typeof input.removeListener === 'function') input.removeListener('data', onData)
      input.pause?.()
    }

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      detach()
      restoreTerminal()
      // İstem satır sonu olmadan yazıldı; imleç bir sonraki satıra geçsin.
      // Parola burada YAZILMAZ — yalnız yeni satır.
      if (isTTY) output.write('\n')
      fn()
    }

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (settled) return

        if (ch === '\n' || ch === '\r') {
          const entered = value
          finish(() => resolve(entered))
          return
        }

        if (ch === CTRL_C) {
          finish(() => reject(new PromptCancelledError()))
          return
        }

        if (BACKSPACE.has(ch)) {
          value = value.slice(0, -1)
          continue
        }

        // Diğer kontrol karakterleri (ok tuşları, Tab) yok sayılır:
        // ham modda bunlar da `data` olarak gelir ve parolaya karışırsa
        // operatör "doğru yazdım ama giriş yapamıyorum" durumuna düşer.
        if (ch < ' ') continue

        value += ch
      }
    }

    output.write(prompt)

    // UTF-8: parola Türkçe karakter içerebilir; tampon bayt değil karakter
    // tutmalı. `setEncoding` parçalanmış çok baytlı karakterleri birleştirir.
    if (typeof input.setEncoding === 'function') input.setEncoding('utf8')

    if (isTTY && typeof input.setRawMode === 'function') input.setRawMode(true)
    input.resume?.()
    input.on('data', onData)
  })
}
