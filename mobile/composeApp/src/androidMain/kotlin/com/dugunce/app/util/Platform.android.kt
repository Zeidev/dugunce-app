package com.dugunce.app.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import com.dugunce.app.MainActivity

/**
 * Android pano/paylaşım uygulaması.
 *
 * `MainActivity` örneği `AppContextHolder` üzerinden tutulur — Compose
 * `commonMain`'den `Context` alamadığımız için tek köprü noktası burası.
 */
actual fun copyToClipboard(text: String): Boolean {
    val ctx = AppContextHolder.context ?: return false
    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
    cm.setPrimaryClip(ClipData.newPlainText("Davetiye bağlantısı", text))
    return true
}

actual fun shareText(text: String, subject: String): Boolean {
    val ctx = AppContextHolder.context ?: return false
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_SUBJECT, subject)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    ctx.startActivity(Intent.createChooser(intent, subject).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return true
}

/** Uygulama `Context`'i — `MainActivity.onCreate` içinde set edilir. */
object AppContextHolder {
    @Volatile
    var context: Context? = null
}
