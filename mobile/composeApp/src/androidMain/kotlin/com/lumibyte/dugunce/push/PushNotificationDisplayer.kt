package com.lumibyte.dugunce.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Bildirimi sistem tepsisine koyar.
 *
 * KANAL (Android 8+): kanal olmadan bildirim GÖSTERİLMEZ ve hata da
 * verilmez — sessiz kaybolur. Bu yüzden her gösterimden önce kanal
 * oluşturuluyor (`CREATE IF NOT EXISTS` davranışı).
 *
 * İZİN (Android 13+): `POST_NOTIFICATIONS` verilmemişse
 * `NotificationManagerCompat.notify` sessizce hiçbir şey yapmaz. Burada
 * açıkça kontrol ediliyor ki log'da görülsün.
 */
internal object PushNotificationDisplayer {
    private const val CHANNEL_ID = "dugunce_events"
    private const val CHANNEL_NAME = "Düğün hareketleri"
    private const val NOTIFICATION_ID = 1001

    fun show(context: Context, title: String, body: String, deepLink: String?) {
        createChannel(context)

        val intent = buildIntent(context, deepLink)
        val pending = PendingIntent.getActivity(
            context,
            0,
            intent,
            // `IMMUTABLE` ZORUNLU (Android 12+): değiştirilebilir
            // PendingIntent, başka uygulamanın içeriğini değiştirmesine
            // açık — güvenlik açığı.
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        // İzin yoksa notify() zaten no-op; burada açık kontrol log için.
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // Android 13+ izin yarışı: izin verilmemişse fırlatır.
            // Bildirim gösterilemez ama uygulama ÇÖKMEMELİ.
        }
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "RSVP yanıtları ve görev hareketleri"
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Deep link varsa `dugunce://` intent'i, yoksa uygulamayı açan
     * varsayılan intent.
     *
     * NEDEN deep link `MainActivity.handleIntent` ile aynı şema:
     * bildirim için ayrı bir gezinme mekanizması yazmak, iki yolun
     * zamanla ayrışmasına yol açardı.
     */
    private fun buildIntent(context: Context, deepLink: String?): Intent {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (deepLink === null || launch === null) {
            return launch ?: Intent()
        }
        return Intent(Intent.ACTION_VIEW, Uri.parse(deepLink), context, MainActivityClass)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    /** `MainActivity` sınıfı — döngüsel import olmasın diye geç çözülür. */
    private val MainActivityClass: Class<*>
        get() = Class.forName("com.lumibyte.dugunce.MainActivity")
}
