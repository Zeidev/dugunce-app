import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Push tetikleyicileri — YAPISAL doğrulama.
 *
 * NEDEN DAVRANIŞ TESTİ DEĞİL: bu route'lar gerçek DB + auth ister;
 * uçtan uca kurmak push bağlantısını değil tüm uygulamayı sınamak
 * olurdu. Burada iki kritik kural çivileniyor:
 *
 * 1. Her çağrı `void` ile — `await` edilirse FCM yavaşladığında ana iş
 *    akışı (RSVP kaydı, görev güncellemesi) bloklanır.
 * 2. Doğru olay adı kullanılıyor.
 *
 * `void` kuralı davranış testiyle yakalanamaz: `await` de "çalışır",
 * sadece yavaşlar. Statik kontrol tek güvenilir yol.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('push tetikleyicileri', () => {
  it('invitations.ts RSVP sonrası notify çağırır ve BLOKLAMAZ', () => {
    // RSVP PUBLIC route'ta: `POST /invitations/:token/rsvp`
    // (guests.ts değil — o çift tarafı CRUD'u).
    const src = read('src/routes/invitations.ts')
    expect(src).toMatch(/RSVP_RECEIVED/)
    // BLOKLAMAMA: `void` ile başlayan promise zinciri. `await
    // notifyWeddingMembers` olsaydı FCM yavaşladığında davetli yanıt
    // ekranında beklerdi.
    expect(src).toMatch(/void deps\s*\.\s*findWeddingIdByInvitation|void notifyWeddingMembers\(/)
    expect(src).not.toMatch(/await notifyWeddingMembers\(/)
  })

  it('tasks.ts görev atama ve durum için notify çağırır', () => {
    const src = read('src/routes/tasks.ts')
    expect(src).toMatch(/TASK_ASSIGNED/)
    expect(src).toMatch(/TASK_STATUS_CHANGED/)
    expect(src).not.toMatch(/await notifyWeddingMembers\(/)
  })

  it('tasks.ts ÇİFT mesajında bildirim GÖNDERMEZ (tek yön)', () => {
    /*
      SPEC §5.3: "Bildirim yalnız YARDIMCI yazdığında gider: çift kendi
      yazdığı mesajın bildirimini almamalı, ve yardımcının hesabı
      olmadığı için ona push gönderilemez."

      `tasks.ts` çift tarafı route'ları içerir (`sender.kind: 'COUPLE'`).
      Burada bildirim OLURSA çift kendi mesajının bildirimini alır.
      TASK_MESSAGE yalnız `helper-app.ts`'te olmalı.

      NOT: planın ilk hâli burada TASK_MESSAGE bekliyordu; spec §5.3
      bağlayıcı olduğu için beklenti tersine çevrildi.
    */
    const src = read('src/routes/tasks.ts')
    expect(src).not.toMatch(/TASK_MESSAGE/)
  })

  it('helper-app.ts yardımcı mesajında notify çağırır', () => {
    const src = read('src/routes/helper-app.ts')
    expect(src).toMatch(/void notifyWeddingMembers\(/)
    expect(src).toMatch(/TASK_MESSAGE/)
    expect(src).not.toMatch(/await notifyWeddingMembers\(/)
  })

  it('hiçbir route await notifyWeddingMembers kullanmaz', () => {
    for (const f of ['src/routes/invitations.ts', 'src/routes/tasks.ts', 'src/routes/helper-app.ts']) {
      expect(read(f)).not.toMatch(/await notifyWeddingMembers\(/)
    }
  })
})
