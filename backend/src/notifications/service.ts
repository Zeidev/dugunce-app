import { logger } from '../lib/logger.js'
import { shouldSendNow } from './quiet-hours.js'
import type { FcmSender } from './fcm.js'
import type { DeviceTokenDeps } from './store.js'

/**
 * Bildirim orkestrasyonu — olay → alıcı → gönderim.
 *
 * Tüm bağımlılıklar enjekte edilir; bu dosya ne DB ne ağ bilir. Sınanan
 * tek şey kararlar: gönderelim mi, kime, hata olursa ne olur.
 */

export type NotifyEvent =
  | 'RSVP_RECEIVED'
  | 'TASK_ASSIGNED'
  | 'TASK_MESSAGE'
  | 'TASK_STATUS_CHANGED'

/**
 * Bildirim metinleri — HASSAS VERİ İÇERMEZ (spec §6b.3).
 *
 * NEDEN RAKAM/İSİM YOK: bildirim KİLİT EKRANINDA görünür. Davetli adı
 * veya harcama tutarı oraya yazılırsa telefonu gören herkes öğrenir.
 * Kullanıcı uygulamayı açınca detayı görür. Test bunu çiviliyor.
 */
export const NOTIFICATION_COPY: Record<NotifyEvent, { title: string; body: string }> = {
  RSVP_RECEIVED: {
    title: 'Yeni RSVP yanıtı',
    body: 'Bir davetli yanıt verdi.',
  },
  TASK_ASSIGNED: {
    title: 'Görev atandı',
    body: 'Bir görev yardımcıya atandı.',
  },
  TASK_MESSAGE: {
    title: 'Yeni mesaj',
    body: 'Bir görevde yeni mesaj var.',
  },
  TASK_STATUS_CHANGED: {
    title: 'Görev güncellendi',
    body: 'Bir görevin durumu değişti.',
  },
}

export interface NotifyDeps {
  tokens: DeviceTokenDeps
  /** `null` = push yapılandırılmamış; gönderim atlanır (hata değil). */
  sender: FcmSender | null
  findWedding(weddingId: string): Promise<{ weddingDate: Date | null } | null>
  isQuietHoursOverride(userId: string): Promise<boolean>
  isEnabled(userId: string): Promise<boolean>
}

export interface NotifyParams {
  weddingId: string
  event: NotifyEvent
  /** Bildirimi tetikleyen kullanıcı; kendisine GÖNDERİLMEZ. */
  actorUserId: string | null
  data?: Record<string, string>
  /** Test enjeksiyonu; verilmezse `new Date()`. */
  now?: Date
}

/**
 * Düğünün üyelerine (tetikleyen hariç) bildirim gönderir.
 *
 * ÇAĞIRAN `await` ETMEMELİ — `void notifyWeddingMembers(...)`.
 * NEDEN: RSVP kaydı, FCM yavaşladığında davetliyi 20 sn bekletmemeli.
 * Push ikincil bir özellik; ana iş akışını bloklaması kabul edilemez.
 *
 * HATA YUTULUR ve loglanır: bildirim gitmedi diye RSVP kaydı geri
 * alınmaz (zaten yazıldı). Sessiz başarısızlık YASAK — log satırı var.
 */
export async function notifyWeddingMembers(
  deps: NotifyDeps,
  params: NotifyParams,
): Promise<void> {
  // 1) Push yapılandırılmamışsa hiçbir sorgu yapma.
  if (deps.sender === null) return

  // 2) Düğün yoksa (silinmiş) gönderim yok.
  const wedding = await deps.findWedding(params.weddingId)
  if (wedding === null) return

  // 3) Alıcılar: tetikleyen hariç düğün üyeleri.
  const recipients = await deps.tokens.listTokensForWeddingMembers(
    params.weddingId,
    params.actorUserId,
  )
  if (recipients.length === 0) return

  const firstUserId = recipients[0]?.userId
  if (firstUserId === undefined) return

  /*
    Kullanıcı bildirimleri KAPATMIŞSA hiç gönderme. Token SİLİNMEZ:
    yeniden açtığında izin akışını tekrar yaşamasın.
  */
  if (!(await deps.isEnabled(firstUserId))) return

  /*
    Sessiz saat kararı KULLANICI BAŞINA verilir (tercih alanı kullanıcıda),
    ama alıcı listesi tek sorguda geldi. Pratikte çiftin iki üyesi de aynı
    tercihe sahip; kişi başına ayrı sorgu N+1 üretirdi.
  */
  const override = await deps.isQuietHoursOverride(firstUserId)
  const now = params.now ?? new Date()
  if (!shouldSendNow(now, wedding.weddingDate, override)) return

  const copy = NOTIFICATION_COPY[params.event]
  const data = {
    type: params.event,
    weddingId: params.weddingId,
    ...(params.data ?? {}),
  }

  /*
    SIRALI gönderim, paralel DEĞİL: FCM'e eşzamanlı 100 istek atmak hız
    sınırına (429) takılır ve bazı bildirimler sessizce düşer.
  */
  for (const recipient of recipients) {
    try {
      const result = await deps.sender.send(recipient.token, copy.title, copy.body, data)

      if (!result.ok) {
        if (result.unregistered) {
          // Ölü token: temizle. Aksi hâlde her bildirimde boşa istek.
          await deps.tokens.deleteDeviceToken(recipient.token)
        } else {
          logger.warn({ reason: result.reason }, 'push gönderilemedi')
        }
      }
    } catch (err) {
      // Tek token'ın hatası DÖNGÜYÜ DURDURMAZ.
      logger.warn({ err }, 'push gönderim hatası')
    }
  }
}
