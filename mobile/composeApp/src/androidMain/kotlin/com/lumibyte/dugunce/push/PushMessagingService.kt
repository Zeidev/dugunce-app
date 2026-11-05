package com.lumibyte.dugunce.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM alıcısı — bildirim gösterimi ve token yenileme.
 *
 * NEDEN GEREKLİ: FCM `notification` yükünü uygulama ARKA PLANDAYKEN
 * sistem kendisi gösterir; ÖN PLANDAYKEN GÖSTERMEZ. Ayrıca bildirime
 * dokunulduğunda doğru düğüne gitmek için `data` yükü işlenmeli.
 *
 * Manifest'te `com.google.firebase.MESSAGING_EVENT` intent-filter'ı ile
 * kayıtlı (`check-push-gradle.mjs` bunu doğruluyor).
 */
class PushMessagingService : FirebaseMessagingService() {

    /**
     * FCM token'ı yenilendiğinde çağrılır.
     *
     * NEDEN ÖNEMLİ: token değişirse ESKİ token ölür ve sunucu ona
     * gönderim yapmaya devam ederse hiçbir bildirim ulaşmaz. Yeni token
     * sunucuya kaydedilmeli.
     *
     * Kayıt burada doğrudan yapılmıyor: `DeviceRegistrar` bir `PushApi`
     * (Repository) istiyor ve servis onu tutmuyor. Token bir kanala
     * bırakılıyor; uygulama açılışında kayıt zaten tekrar deneniyor
     * (idempotent upsert). Böylece burada yanlış kullanıcıyla
     * ilişkilendirme riski yok.
     */
    override fun onNewToken(token: String) {
        PushTokenBus.publish(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val weddingId = extractWeddingId(message.data)
        PushNotificationDisplayer.show(
            context = this,
            title = message.notification?.title ?: "Düğünce",
            body = message.notification?.body ?: "Yeni bir hareket var.",
            deepLink = notificationDeepLink(weddingId),
        )
    }
}
