/**
 * CLI provizyon deposu — hesap YAZMA yolu.
 *
 * NEDEN AYRI DOSYA: `store.ts` (Task 5) gözden geçirilmiş ve dondurulmuş
 * bir sözleşmedir; içinde hesap OLUŞTURAN hiçbir fonksiyon YOKTUR ve
 * olmamalıdır. Hesap açma yetkisi oturum middleware'ini tüketen her yere
 * yayılırsa "web'den admin oluşturma ucu yok" kuralı yalnız route
 * katmanında kalır — bir gün biri `store.insertAdminAccount`'u bir
 * uçtan çağırır ve yetki yükseltme yüzeyi açılır.
 *
 * Bu dosya YALNIZ CLI tarafından import edilir (`scripts/create-admin.ts`)
 * ve `AdminDeps`'e DAHİL DEĞİLDİR. Route katmanının elinde bu fonksiyon
 * yoktur; tip düzeyinde ulaşamaz.
 *
 * `findAdminByEmail` ve `writeAudit` burada TEKRAR YAZILMAZ —
 * `drizzleAdminDeps`'ten gelir. Normalizasyon (`normalizeEmail`) ve audit
 * şeması tek kaynaktan beslenir; ayrışırsa CLI ile giriş farklı e-posta
 * yazar/arar ve hesap bulunamaz (gerçek hata sınıfı, Task 8 notu).
 */

import { getDb } from '../db/client.js'
import { adminAccounts } from '../db/schema.js'
import { drizzleAdminDeps } from './store.js'
import { AppError } from '../lib/errors.js'
import { normalizeAdminEmail, isUniqueViolation } from './service.js'
import type { CreateAdminDeps } from './service.js'

/** Testlerin PGlite bağlantısı enjekte edebilmesi için. */
type Db = ReturnType<typeof getDb>

/**
 * NOT: 23505 (`unique_violation`) çevirisi BURADA DEĞİL, `service.ts`
 * içindedir — `isUniqueViolation` oradan import edilir. Sebep:
 * `CreateAdminDeps` dar bir arayüzdür ve bu store onun TEK uygulaması
 * değildir (test sahtesi, gelecekte bir tohumlama betiği). Çeviri yalnız
 * burada olsaydı başka bir uygulama ham PostgreSQL hatası sızdırır ve
 * operatör anlamlı mesajı görmezdi. Buradaki `catch` yalnız erken
 * yakalayan bir GÜVENLİK AĞIDIR — aynı hatayı üretir, davranış farkı yok.
 */

/**
 * Provizyon bağımlılıkları.
 *
 * Dönüş tipi `CreateAdminDeps` — `insertAdminAccount` DIŞINDA yazma yolu
 * YOKTUR. `updateAdminPassword` gibi bir fonksiyon bilinçli olarak
 * eklenmedi: bu CLI parola sıfırlama aracı DEĞİLDİR.
 */
export function drizzleCreateAdminDeps(dbOverride?: Db): CreateAdminDeps {
  const db = dbOverride ?? getDb()
  const base = drizzleAdminDeps(db as Parameters<typeof drizzleAdminDeps>[0])

  return {
    // Okuma ve audit TEK kaynaktan — kopyalanmaz.
    findAdminByEmail: base.findAdminByEmail,
    writeAudit: base.writeAudit,

    /**
     * Hesabı ekler. GÜNCELLEMEZ: `onConflictDoUpdate` YOK.
     *
     * `email` burada da normalize edilir — çağıran (`createAdminAccount`)
     * zaten normalize ediyor, ama bu fonksiyon başka bir yerden
     * çağrılırsa (ör. gelecekte bir tohumlama betiği) aynı hata sınıfı
     * tekrar doğmasın. Normalizasyon iki kez uygulanabilir bir işlemdir.
     *
     * `role` / `status` verilmez: DB varsayılanları (`SUPER_ADMIN`,
     * `ACTIVE`) geçerlidir. Sütunları açıkça yazsaydık şema varsayılanı
     * değiştiğinde CLI sessizce ESKİ değeri yazmaya devam ederdi.
     */
    async insertAdminAccount(values) {
      try {
        const rows = await db
          .insert(adminAccounts)
          .values({
            email: normalizeAdminEmail(values.email),
            displayName: values.displayName,
            passwordHash: values.passwordHash,
          })
          .returning({ id: adminAccounts.id })

        const row = rows[0]
        if (!row) throw new Error('Yönetici hesabı oluşturulamadı')
        return { id: row.id }
      } catch (err) {
        // Yarış durumu: arada başka bir süreç aynı e-postayı açtı.
        // Çağıranın `findAdminByEmail` kontrolü geçmişti; son söz DB'nin.
        if (isUniqueViolation(err)) {
          throw AppError.conflict(
            'Bu e-posta ile bir yönetici hesabı zaten var. Mevcut hesap korunur.',
            'ADMIN_EMAIL_EXISTS',
          )
        }
        throw err
      }
    },
  }
}
