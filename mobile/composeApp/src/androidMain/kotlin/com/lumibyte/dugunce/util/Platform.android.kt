package com.lumibyte.dugunce.util

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Android pano/paylaşım uygulaması.
 *
 * Compose `commonMain`'den `Context` alamadığımız için tek köprü noktası
 * `AppContextHolder`.
 *
 * ÖNEMLİ: paylaşım için `applicationContext` YETMEZ.
 * `startActivity` uygulama bağlamıyla çağrıldığında Android bir Activity
 * başlatmaz ve hata da fırlatmaz — çağrı sessizce yok sayılır. Kullanıcı
 * "butona bastım, hiçbir şey olmadı" der (bildirilen hata). Bu yüzden
 * `MainActivity` kendi örneğini de kaydeder ve paylaşım onun üzerinden
 * yapılır.
 */
actual fun copyToClipboard(text: String): Boolean {
    val ctx = AppContextHolder.context ?: return false
    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
    cm.setPrimaryClip(ClipData.newPlainText("Davetiye bağlantısı", text))
    return true
}

/**
 * Sistem paylaşım menüsünü açar.
 *
 * @return menü gerçekten açıldıysa `true`.
 */
actual fun shareText(text: String, subject: String): Boolean {
    // Activity bağlamı öncelikli — `applicationContext` ile Activity
    // başlatılamaz (sessiz başarısızlık).
    val ctx = AppContextHolder.activity ?: AppContextHolder.context ?: return false

    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_SUBJECT, subject)
    }
    val chooser = Intent.createChooser(send, subject)

    // Activity yoksa (teorik) NEW_TASK gerekir; varsa eklemek zararsız.
    if (ctx !is Activity) chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    return try {
        ctx.startActivity(chooser)
        true
    } catch (e: Exception) {
        // Aktivite bulunamazsa veya başka bir sorun olursa sessizce
        // yutma — kullanıcı neden bir şey olmadığını bilmeli.
        Log.w("Dugunce", "Paylaşım menüsü açılamadı", e)
        false
    }
}

/**
 * URL'yi sistemde açar.
 *
 * `wa.me` bağlantısı WhatsApp kuruluysa doğrudan uygulamayı açar;
 * değilse tarayıcıya düşer (WhatsApp Web).
 */
actual fun openUrl(url: String): Boolean {
    val ctx = AppContextHolder.activity ?: AppContextHolder.context ?: return false

    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
    if (ctx !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    return try {
        ctx.startActivity(intent)
        true
    } catch (e: Exception) {
        Log.w("Dugunce", "Bağlantı açılamadı: $url", e)
        false
    }
}

/**
 * Uygulama bağlamları.
 *
 * `context` = `applicationContext` (pano, dosya vb. için yeterli).
 * `activity` = `MainActivity` örneği; paylaşım gibi UI başlatan
 * işlemler için ZORUNLU.
 */
object AppContextHolder {
    @Volatile
    var context: Context? = null

    @Volatile
    var activity: Activity? = null
}
