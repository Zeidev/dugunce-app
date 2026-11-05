/**
 * Admin çekirdeği — parola hash'leme, parola güçlülüğü ve hesap kilidi.
 *
 * Kullanıcı (`users`) ve yardımcı (`helpers`) evrenlerinden TAMAMEN AYRI:
 * admin parolası Argon2id ile saklanır, magic-link token'ı ile ilgisi yoktur.
 * İki evren karışırsa tam yetki sızıntısı olur (Review Focus #1).
 *
 * Parola hash'i için Argon2id kullanılır — bu repoda İLK kullanım.
 * Varsayılan parametreler (Argon2id, 19 MiB, t=2, p=1) yeterlidir.
 */

import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'
import { logger } from '../lib/logger.js'
import { AppError } from '../lib/errors.js'

/** Yönetim parolası için asgari uzunluk — kullanıcı parolasından daha katı. */
export const MIN_ADMIN_PASSWORD_LENGTH = 16
/** Bu sayıya ulaşan ardışık hata hesabı kilitler. */
export const MAX_FAILED_ATTEMPTS = 5
/** Kilit süresi — 15 dakika. */
export const LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * ÜSTEL KİLİT TAVANI — 24 saat.
 *
 * Tek admin hesabı olduğu ve parola sıfırlama akışı bulunmadığı için
 * sabit 15 dk kilit yetersizdi: saldırgan 15 dakikada 5 istek atarak
 * hesabı sürekli kilitli tutabiliyordu (hız sınırı 10/15dk olduğu için
 * limitin ALTINDA kalıyordu). Kilit süresi her ardışık kilitte ikiye
 * katlanır.
 */
export const MAX_LOCK_DURATION_MS = 24 * 60 * 60 * 1000

/**
 * Ardışık kilit sayısına göre kilit süresi.
 *
 * @param lockoutCount Bu hesabın daha önce kaç kez kilitlendiği (0 = ilk).
 */
export function lockDurationFor(lockoutCount: number): number {
  const n = Math.max(0, Math.floor(lockoutCount))
  // 2^n taşmasın: 15dk * 2^10 zaten tavana yakın.
  const capped = Math.min(n, 10)
  return Math.min(LOCK_DURATION_MS * 2 ** capped, MAX_LOCK_DURATION_MS)
}

/**
 * Parolayı Argon2id ile hash'ler.
 *
 * Her çağrıda rastgele tuz üretilir; aynı parola iki farklı hash verir.
 * Düz metin ASLA saklanmaz, loglanmaz (Review Focus #4).
 */
export function hashPassword(plain: string): Promise<string> {
  // NFC NORMALİZASYONU ZORUNLU — Türkçe için hayati.
  //
  // "ş" tek kod noktası (U+015F) veya "s" + birleşik çengel (U+0073
  // U+0327) olarak yazılabilir. İkisi EKRANDA AYNI görünür ama farklı
  // baytlardır; normalize edilmezse doğru parola reddedilir.
  // Farklı işletim sistemi / klavye / IME girdileri bu farkı üretir.
  return argon2Hash(plain.normalize('NFC'))
}

/**
 * Parolayı hash ile doğrular.
 *
 * Bozuk/geçersiz hash'te fırlatmak yerine `false` döner: giriş akışı
 * tek bir "hatalı kimlik bilgisi" yoluna düşsün, hata tipi sızmasın.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    // `hashPassword` ile AYNI normalizasyon — aksi hâlde yazım ile
    // doğrulama farklı baytları karşılaştırır.
    return await argon2Verify(hash, plain.normalize('NFC'))
  } catch (err) {
    // Bozuk hash / argon2 hatası ile "yanlış parola" AYNI sonucu döner
    // (hata tipi sızmasın), ama LOG'A yazılır: aksi hâlde bozuk bir
    // kayıt sessizce sayaç artırır ve hesabı kalıcı kilitler.
    // Parola ASLA log'lanmaz.
    logger.error({ err }, 'admin parola doğrulaması başarısız (altyapı hatası)')
    return false
  }
}

/**
 * Parola güçlülüğü — uzunluk ≥ 16, en az bir harf, en az bir rakam.
 *
 * `reason` Türkçe ve kullanıcıya gösterilebilir; parolayı asla içermez.
 */
export function validatePasswordStrength(
  plain: string,
): { ok: true } | { ok: false; reason: string } {
  if (plain.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Parola en az ${MIN_ADMIN_PASSWORD_LENGTH} karakter olmalı`,
    }
  }
  if (!/\p{L}/u.test(plain)) {
    return { ok: false, reason: 'Parola en az bir harf içermeli' }
  }
  if (!/\p{N}/u.test(plain)) {
    return { ok: false, reason: 'Parola en az bir rakam içermeli' }
  }
  return { ok: true }
}

/**
 * Hesabın şu anki kilit durumu.
 *
 * `lockedUntil` geçmişte kaldıysa kilit kendiliğinden düşer — ayrı bir
 * temizleme işi gerekmez. `failedAttempts` tek başına kilit sebebi değildir;
 * kilit yalnızca `lockedUntil` ile ifade edilir.
 */
export function computeLockState(
  admin: { failedAttempts: number; lockedUntil: Date | null },
  now: Date = new Date(),
): 'OK' | 'LOCKED' {
  if (!admin.lockedUntil) return 'OK'
  return admin.lockedUntil.getTime() > now.getTime() ? 'LOCKED' : 'OK'
}

/**
 * Bir sonraki başarısız giriş denemesinin durumu.
 *
 * SAYAÇ KİLİT DOLUNCA SIFIRLANIR. Aksi hâlde şu ölümcül döngü oluşur:
 *
 *   1. 5 hatalı deneme → kilit (15 dk), `failedAttempts = 5`
 *   2. Kilit dolar, sayaç hâlâ 5 (yalnız `lockedUntil` geçmişte)
 *   3. TEK bir hatalı deneme → sayaç 6 → YENİDEN 15 dk kilit
 *
 * Yani saldırgan 15 dakikada bir istek atarak TEK admin hesabını kalıcı
 * olarak kilitleyebilir — parola sıfırlama akışı da yok. Kullanıcı
 * doğrulandı: bu senaryo gerçekti.
 *
 * Çözüm: `current` zaten `MAX_FAILED_ATTEMPTS` veya üzerindeyse (yani
 * önceki kilit dolmuş ve sayaç temizlenmemişse) sayaç 1'den başlar.
 * Kilit kararı yine `lockedUntil` üzerinden verilir.
 */
export function nextFailedState(
  current: number,
  now: Date = new Date(),
  /** Bu hesabın daha önce kaç kez kilitlendiği — üstel geri çekilme için. */
  lockoutCount: number = 0,
): { failedAttempts: number; lockedUntil: Date | null; lockoutCount: number } {
  // Önceki kilit dönemi bittiyse sayaç YENİDEN başlar.
  const base = current >= MAX_FAILED_ATTEMPTS ? 0 : current
  const failedAttempts = base + 1

  if (failedAttempts < MAX_FAILED_ATTEMPTS) {
    return { failedAttempts, lockedUntil: null, lockoutCount }
  }

  // Kilit devreye giriyor — süre ardışık kilit sayısıyla ÜSTEL artar.
  // Sabit 15 dk, 15 dakikada 5 istek atan bir saldırganın tek admin
  // hesabını kalıcı kilitlemesine izin veriyordu.
  const nextCount = lockoutCount + 1
  const lockedUntil = new Date(now.getTime() + lockDurationFor(lockoutCount))
  return { failedAttempts, lockedUntil, lockoutCount: nextCount }
}

// ---------------------------------------------------------------------------
// Giriş akışı — spec §6.1
// ---------------------------------------------------------------------------

/**
 * Giriş denemesinde dönen admin görünümü.
 *
 * SIRF BEYAZ LİSTE: `passwordHash`, `totpSecret`, `recoveryCodes` YOK.
 * Bu nesne doğrudan HTTP yanıtına yazılır; satırı `...row` ile yaymak
 * parola hash'ini istemciye sızdırır.
 */
export interface AdminRecord {
  id: string
  email: string
  displayName: string
  role: string
  status: string
  failedAttempts: number
  lockedUntil: Date | null
  lastLoginAt: Date | null
}

/**
 * `admin_accounts` satırı — SADECE servis içinde kullanılır.
 *
 * `AdminRecord`'u BİLEREK GENİŞLETMEZ. Genişletseydi "satır = güvenli
 * görünüm" izlenimi doğar ve `...row` yaymak makul görünürdü; oysa satır
 * `passwordHash` taşır. Ayrı tip tutmak dönüşümün açıkça yazılmasını
 * zorunlu kılar (bkz. `toAdminRecord`).
 */
export interface AdminAccountRow {
  id: string
  email: string
  displayName: string
  role: string
  status: string
  failedAttempts: number
  lockedUntil: Date | null
  lastLoginAt: Date | null
  passwordHash: string
  /** v1'de kullanılmaz — 2FA sonraki tur. Okunmaz, sızdırılmaz. */
  totpSecret?: string | null
  recoveryCodes?: unknown
}

/** `findSessionByHash` dönüşü — oturum middleware'i (Task 4) tüketir. */
export interface AdminSessionRow {
  id: string
  adminId: string
  expiresAt: Date
  lastUsedAt: Date
}

/** `createSession` girdisi — HAM token değil, yalnız hash'leri taşır. */
export interface CreateSessionValues {
  adminId: string
  sessionHash: string
  csrfHash: string
  ip?: string | null
  userAgent?: string | null
  expiresAt: Date
}

/**
 * Audit kaydı girdisi.
 *
 * `metadata`'ya parola, parola hash'i, oturum token'ı veya TOTP secret
 * ASLA yazılmaz (Review Focus #4). Parola denemesi zaten hiçbir alana
 * konmaz — yalnız "kim, hangi e-posta, hangi sebep" yazılır.
 */
export interface AuditEntry {
  action: string
  actorType: 'ADMIN' | 'USER' | 'SYSTEM'
  actorId: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
  ip?: string | null
}

/**
 * Giriş akışının veri erişim bağımlılıkları.
 *
 * Store (Task 5) bu arayüzü implement eder; testler sahte nesne geçer.
 * Servis Drizzle'ı doğrudan görmez — böylece giriş akışı DB olmadan
 * test edilebilir.
 */
export interface AdminDeps {
  findAdminByEmail(email: string): Promise<AdminAccountRow | null>
  recordFailedAttempt(
    adminId: string,
    state: { failedAttempts: number; lockedUntil: Date | null },
  ): Promise<void>
  /** failedAttempts=0, lockedUntil=null, lastLoginAt=now yazar. */
  recordSuccess(adminId: string): Promise<void>
  createSession(values: CreateSessionValues): Promise<{ id: string }>
  findSessionByHash(hash: string): Promise<AdminSessionRow | null>
  touchSession(id: string, expiresAt: Date): Promise<void>
  deleteSession(id: string): Promise<void>
  writeAudit(entry: AuditEntry): Promise<void>
}

/**
 * Hesap kilitli — spec §6.1 `423 ACCOUNT_LOCKED`.
 *
 * `AppError`'dan türer ki merkezi hata yakalayıcı doğru HTTP kodunu
 * kendiliğinden üretsin; route katmanı eşleme yapmak zorunda kalmaz.
 */
export class AccountLockedError extends AppError {
  constructor(lockedUntil: Date | null = null, now: Date = new Date()) {
    const minutes =
      lockedUntil && lockedUntil.getTime() > now.getTime()
        ? Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000)
        : null
    super(
      423,
      'ACCOUNT_LOCKED',
      minutes
        ? `Hesap geçici olarak kilitli. ${minutes} dakika sonra tekrar deneyin.`
        : 'Hesap geçici olarak kilitli. Lütfen daha sonra tekrar deneyin.',
    )
    // DİKKAT: `AppError` yapıcısı `setPrototypeOf(this, AppError.prototype)`
    // çağırır — alt sınıfın prototipini EZER. Geri kurulmazsa
    // `instanceof AccountLockedError` false olur ve testler/route'lar
    // hatayı tanıyamaz.
    Object.setPrototypeOf(this, AccountLockedError.prototype)
    this.name = 'AccountLockedError'
  }
}

/**
 * Hesap askıya alınmış — spec §6.1 `403`.
 *
 * Kilitli hesaptan ÖNCE kontrol edilir: askıya alınmış hesap, kilit
 * süresi dolmuş olsa bile giriş yapamaz.
 */
export class AccountSuspendedError extends AppError {
  constructor() {
    super(403, 'ACCOUNT_SUSPENDED', 'Bu hesap askıya alınmış. Destek ile iletişime geçin.')
    Object.setPrototypeOf(this, AccountSuspendedError.prototype)
    this.name = 'AccountSuspendedError'
  }
}

/**
 * Sabit "sahte" parola hash'i — ZAMANLAMA EŞİTLEMESİ için.
 *
 * Var olmayan bir e-postayla yapılan deneme, argon2 ÇALIŞTIRMADAN
 * dönerse yanıt süresi ~0 ms olur; var olan hesapta ~20 ms. Fark
 * ölçülebilir ve "bu e-posta kayıtlı mı" sorusunu yanıtlar
 * (kullanıcı sayımı / hedefli saldırı).
 *
 * Bu yüzden hesap bulunamadığında da bu hash'e karşı `verifyPassword`
 * çağrılır. Hash, atılmış rastgele bir değere aittir: hiçbir parola
 * `true` döndürmez. Gizli DEĞİLDİR — sadece iş yükü üretir.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$1qftIc8xa+sVJlF5+CVyJQ$nb1xOtpvlhrCS6ysiBdoapAjvMxdmf5qPcVka0zTeHM'

/**
 * Satırdan istemciye giden görünümü kurar — ALAN ALAN.
 *
 * `...row` ASLA: yeni bir gizli sütun eklendiğinde sessizce sızardı.
 * Giriş başarılı olduğu için sayaç sıfırlanmış, kilit kalkmış ve
 * `lastLoginAt` şimdi olarak döner — DB'de yazılan durum budur.
 */
function toAdminRecord(row: AdminAccountRow, now: Date): AdminRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: now,
  }
}

/**
 * Başarısız deneme audit'i.
 *
 * `actorId` bilinmeyen e-postada `null` — ama denenen e-posta `metadata`'da
 * kalır, aksi hâlde kaba kuvvet denemesinin HANGİ hesaba yapıldığı
 * kayıtta görünmezdi. Parola/hash/token yazılmaz.
 */
async function writeFailedAudit(
  deps: AdminDeps,
  args: { email: string; reason: string; ip?: string | undefined; actorId?: string | null },
): Promise<void> {
  await deps.writeAudit({
    action: 'ADMIN_LOGIN_FAILED',
    actorType: 'ADMIN',
    actorId: args.actorId ?? null,
    metadata: { email: args.email, reason: args.reason },
    ...(args.ip ? { ip: args.ip } : {}),
  })
}

/**
 * Yönetici girişi.
 *
 * Sıra KESİN (spec §6.1) — kilit kontrolü parola doğrulamasından ÖNCE
 * gelir, aksi hâlde kilitli hesap doğru parolayla giriş yapabilirdi.
 *
 * Var olmayan e-posta ile yanlış parola AYIRT EDİLEMEZ: ikisi de `null`
 * döner, ikisi de aynı audit'i yazar, ikisi de argon2 maliyetini öder.
 *
 * Dönüş: `{ admin }` veya `null`. Kilitli/askıya alınmış hesapta
 * `AccountLockedError` / `AccountSuspendedError` fırlar.
 *
 * NOT: oturum (çerez) ÜRETMEZ — `createSession` çağrısı route katmanının
 * işidir (Task 7), çünkü ham token yalnız orada bilinir ve cookie yazılır.
 */
/**
 * Var olmayan hesap için SAHTE yazma — yalnız zamanlama simetrisi için.
 *
 * Hiçbir satır yazmaz; gerçek bir `recordFailedAttempt` çağrısının
 * gidiş-dönüş maliyetini taklit eder. Amacı "hesap yok" ile "yanlış
 * parola" yollarının AYNI sayıda DB işlemi yapması.
 */
async function dummyFailedAttempt(deps: AdminDeps): Promise<void> {
  // Sabit bir UUID'ye karşı güncelleme: hiçbir satırla eşleşmez,
  // dolayısıyla yan etkisi yoktur ama sorgu maliyeti gerçektir.
  await deps.recordFailedAttempt('00000000-0000-0000-0000-000000000000', {
    failedAttempts: 1,
    lockedUntil: null,
  })
}

export async function loginAdmin(
  params: { email: string; password: string; ip?: string },
  deps: AdminDeps,
  now: Date = new Date(),
): Promise<{ admin: AdminRecord } | null> {
  // 1. E-posta normalizasyonu — parola ile aynı NFC gerekçesi: Türkçe
  //    karakterler iki farklı kod noktası dizisiyle yazılabilir.
  const email = params.email.trim().toLowerCase().normalize('NFC')

  const row = await deps.findAdminByEmail(email)

  // 2. Hesap yok → SAHTE doğrulama + audit + null.
  if (!row) {
    // Argon2 maliyeti ödenir: yanıt süresi var olan hesapla aynı kalır.
    await verifyPassword(DUMMY_PASSWORD_HASH, params.password)
    // SAHTE YAZMA: yanlış-parola yolu `recordFailedAttempt` + audit olmak
    // üzere İKİ yazma yapar. Yalnız audit yazarsak "hesap yok" yolu bir
    // yazma daha hızlı kalır ve zamanlama farkı (gerçekçi 3ms gidiş-dönüş
    // ile ~1.4ms, örneklemeyle ölçülebilir) hesabın VAR olduğunu sızdırır.
    // Var olmayan bir kimliğe yazma denemesi aynı maliyeti üretir.
    await writeFailedAudit(deps, {
      email,
      reason: 'UNKNOWN_EMAIL',
      ip: params.ip,
      actorId: null,
    })
    await dummyFailedAttempt(deps)
    return null
  }

  // 3. Askıya alınmış hesap — kilit kontrolünden ÖNCE.
  if (row.status !== 'ACTIVE') {
    await writeFailedAudit(deps, {
      email,
      reason: 'SUSPENDED',
      ip: params.ip,
      actorId: row.id,
    })
    throw new AccountSuspendedError()
  }

  // 4. Kilit kontrolü — parola doğrulamasından ÖNCE.
  if (computeLockState(row, now) === 'LOCKED') {
    await writeFailedAudit(deps, {
      email,
      reason: 'LOCKED',
      ip: params.ip,
      actorId: row.id,
    })
    throw new AccountLockedError(row.lockedUntil, now)
  }

  // 5. Parola.
  const ok = await verifyPassword(row.passwordHash, params.password)
  if (!ok) {
    const state = nextFailedState(row.failedAttempts, now, row.lockoutCount ?? 0)
    await deps.recordFailedAttempt(row.id, state)
    await writeFailedAudit(deps, {
      email,
      reason: 'BAD_PASSWORD',
      ip: params.ip,
      actorId: row.id,
    })
    return null
  }

  // 6. Başarı — sayaç sıfırlanır, audit yazılır, beyaz liste döner.
  await deps.recordSuccess(row.id)
  await deps.writeAudit({
    action: 'ADMIN_LOGIN',
    actorType: 'ADMIN',
    actorId: row.id,
    ...(params.ip ? { ip: params.ip } : {}),
  })
  return { admin: toAdminRecord(row, now) }
}
