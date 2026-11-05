package com.lumibyte.dugunce.push

import android.Manifest
import android.os.Build
import com.dugunce.app.util.AppContextHolder
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Android — FCM.
 *
 * İKİ SESSİZ TUZAK burada kapatılıyor:
 *
 * 1. `google-services.json` YOKSA `FirebaseMessaging.getInstance()`
 *    FIRLATIR. Dosya `.gitignore`'da (proje kimliği taşır): depoyu
 *    klonlayan herkesde ve CI'da yoktur. `runCatching` bunu `null`'a
 *    çevirir → push sessizce kapalı, uygulama çalışır.
 *
 * 2. Android 13+ (API 33) `POST_NOTIFICATIONS` ÇALIŞMA ZAMANI izni
 *    ister. `minSdk` 26 olduğu için sürüm kontrolü şart; altında izin
 *    kavramı yok ve `true` dönmek doğru.
 */
actual object PushNotifications {
    actual suspend fun requestPermission(): Boolean {
        // API 33 altında bildirim izni diye bir şey yok.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true

        val activity = AppContextHolder.activity ?: return false
        return PermissionRequester.request(activity, Manifest.permission.POST_NOTIFICATIONS)
    }

    actual suspend fun currentToken(): String? = runCatching {
        suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    // `isSuccessful` false ise (ağ yok, yapılandırma
                    // bozuk) token yok — çökme değil.
                    val token = if (task.isSuccessful) task.result else null
                    if (cont.isActive) cont.resume(token)
                }
        }
    }.getOrNull()
}
