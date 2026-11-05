package com.lumibyte.dugunce.push

import android.app.Activity
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Çalışma zamanı izni isteği — coroutine'e köprü.
 *
 * NEDEN GEREKLİ: `ActivityResultContracts.RequestPermission` callback
 * tabanlı; Compose tarafı `suspend` istiyor. Bu sarmalayıcı callback'i
 * `suspendCancellableCoroutine`'e bağlar.
 *
 * NEDEN AYRI DOSYA: `PushNotifications.android.kt` FCM'e odaklı kalsın;
 * izin akışı ayrı sınanabilir bir sorumluluk.
 */
internal object PermissionRequester {
    /**
     * İzni ister; sonucu döner.
     *
     * Zaten verilmişse hemen `true` — sistem diyalogu açılmaz.
     *
     * `requestCode` SABİT: aynı anda iki farklı izin istenmiyor (yalnız
     * bildirim). Dinamik kod üretmek, kayıt defterini yönetmeyi
     * gerektirirdi.
     */
    suspend fun request(activity: Activity, permission: String): Boolean {
        if (ContextCompat.checkSelfPermission(activity, permission) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return true
        }

        val component = activity as? ComponentActivity ?: return false

        return suspendCancellableCoroutine { cont ->
            val launcher = component.activityResultRegistry.register(
                "dugunce-permission-$permission",
                ActivityResultContracts.RequestPermission(),
            ) { granted ->
                if (cont.isActive) cont.resume(granted)
            }
            launcher.launch(permission)
        }
    }

    /**
     * Kullanıcı izni KALICI olarak reddettiyse `true`.
     *
     * NEDEN: bu durumda tekrar istemek sistem diyalogu açmaz, hiçbir şey
     * olmaz — kullanıcı "butona bastım, bir şey olmadı" der. Çağıran bu
     * durumda ayarlara yönlendirme metni göstermeli.
     */
    fun isPermanentlyDenied(activity: Activity, permission: String): Boolean =
        !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission) &&
            ContextCompat.checkSelfPermission(activity, permission) !=
            PackageManager.PERMISSION_GRANTED
}
