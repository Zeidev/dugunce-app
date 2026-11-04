package com.dugunce.app.ui.components

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext

/**
 * Android: rehberden ÇOKLU kişi seçimi.
 *
 * NEDEN ÖZEL CONTRACT:
 * `ActivityResultContracts.PickContact` yalnız TEK kişi seçtirir;
 * `PickMultipleContacts` activity 1.13.0'da YOK. Kullanıcı "tek tek
 * girmek imkansız" dediği için çoklu seçim şart.
 *
 * `ACTION_PICK` + `EXTRA_ALLOW_MULTIPLE` rehberin kendi seçim ekranını
 * açar; kullanıcı istediği kadar kişiyi işaretler. `READ_CONTACTS`
 * İZNİ GEREKMEZ — sistem seçicisi kendi yetkisiyle çalışır, uygulama
 * yalnız seçilenlerin URI'sini alır.
 */
private class PickMultipleContactsContract :
    ActivityResultContract<Void?, List<Uri>>() {

    override fun createIntent(context: Context, input: Void?): Intent =
        Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI).apply {
            type = ContactsContract.Contacts.CONTENT_TYPE
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }

    override fun parseResult(resultCode: Int, intent: Intent?): List<Uri> {
        if (resultCode != Activity.RESULT_OK || intent == null) return emptyList()

        // Çoklu seçim: clipData. Tek seçim: data.
        val clip = intent.clipData
        if (clip != null && clip.itemCount > 0) {
            return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
        }
        return intent.data?.let { listOf(it) } ?: emptyList()
    }
}

@Composable
actual fun rememberContactPicker(
    onPicked: (List<PickedContact>) -> Unit,
): ContactPickerHandle {
    val context = LocalContext.current
    // Callback her yeniden kompozisyonda güncel kalsın (bayat closure olmasın).
    val latestOnPicked by rememberUpdatedState(onPicked)

    val launcher = rememberLauncherForActivityResult(
        contract = PickMultipleContactsContract(),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val picked = uris.mapNotNull { uri -> readContact(context, uri) }
        latestOnPicked(picked)
    }

    return ContactPickerHandle(
        available = true,
        launch = { launcher.launch(null) },
    )
}

/**
 * Kişi URI'sinden ad + telefon okur.
 *
 * Yalnız `DISPLAY_NAME` ve `HAS_PHONE_NUMBER` kolonları sorgulanır —
 * rehberin tamamına erişilmez, yalnız kullanıcının seçtiği kişi okunur.
 */
private fun readContact(context: Context, uri: Uri): PickedContact? {
    val projection = arrayOf(
        ContactsContract.Contacts.DISPLAY_NAME,
        ContactsContract.Contacts.HAS_PHONE_NUMBER,
    )

    var name = ""
    var hasPhone = false
    val ok = runCatching {
        context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                name = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME))
                    ?.trim().orEmpty()
                hasPhone =
                    c.getInt(c.getColumnIndexOrThrow(ContactsContract.Contacts.HAS_PHONE_NUMBER)) > 0
            }
        }
        true
    }.getOrDefault(false)

    if (!ok) return null

    val phone = if (hasPhone) firstPhoneNumber(context, uri) else ""
    // Adı da numarası da yoksa ekleme anlamsız.
    val finalName = name.ifBlank { phone }
    if (finalName.isBlank()) return null
    return PickedContact(name = finalName, phone = phone)
}

private fun firstPhoneNumber(context: Context, contactUri: Uri): String {
    val id = contactUri.lastPathSegment ?: return ""
    return runCatching {
        context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
            arrayOf(id),
            null,
        )?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.trim().orEmpty() else ""
        }.orEmpty()
    }.getOrDefault("")
}
