package com.lumibyte.dugunce.ui.components

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
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

    // Seçilen kişileri oku (izin verilmişse)
    val readPicked: (List<Uri>) -> Unit = { uris ->
        if (uris.isNotEmpty()) {
            val picked = uris.mapNotNull { uri -> readContact(context, uri) }
            latestOnPicked(picked)
        }
    }

    val picker = rememberLauncherForActivityResult(
        contract = PickMultipleContactsContract(),
    ) { uris -> readPicked(uris) }

    // İZİN AKIŞI: seçiciden ÖNCE READ_CONTACTS iste.
    //
    // `ACTION_PICK` izinsiz açılır ama dönen URI'yi okumak izin ister.
    // İzin yoksa sorgu SecurityException fırlatır ve telefon sessizce
    // boş kalır — "rehberde numara var, uygulamada yok" belirtisi.
    val permission = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        // İzin verilse de verilmese de seçici açılır.
        //
        // İzin YOKSA `readContact` telefonu okuyamaz ama en azından AD
        // alınabilir (bazı cihazlarda URI okuma izni geçici olarak
        // verilir). Kullanıcı kişiyi isimle ekleyip telefonu elle
        // girebilir.
        //
        // Sessiz kalmıyoruz: izin reddi loglanır.
        if (!granted) {
            android.util.Log.w(
                "Dugunce",
                "READ_CONTACTS izni verilmedi — telefon okunamayabilir",
            )
        }
        picker.launch(null)
    }

    return ContactPickerHandle(
        available = true,
        launch = {
            // minSdk 26 — doğrudan çağrı yeterli, ContextCompat gerekmez.
            val granted = context.checkSelfPermission(Manifest.permission.READ_CONTACTS) ==
                PackageManager.PERMISSION_GRANTED
            if (granted) picker.launch(null) else permission.launch(Manifest.permission.READ_CONTACTS)
        },
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
        ContactsContract.Contacts._ID,
        ContactsContract.Contacts.DISPLAY_NAME,
        ContactsContract.Contacts.HAS_PHONE_NUMBER,
    )

    var contactId = ""
    var name = ""
    var hasPhone = false

    val ok = runCatching {
        context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                contactId = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts._ID))
                    ?.trim().orEmpty()
                name = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME))
                    ?.trim().orEmpty()
                hasPhone =
                    c.getInt(c.getColumnIndexOrThrow(ContactsContract.Contacts.HAS_PHONE_NUMBER)) > 0
            }
        }
        true
    }.onFailure {
        // SESSİZ YUTMA: SecurityException (izin yok) burada görünür olsun.
        android.util.Log.w("Dugunce", "Kişi okunamadı: $uri", it)
    }.getOrDefault(false)

    if (!ok) return null

    // `_ID` URI'den okunamadıysa son çare olarak yol parçasını dene.
    //
    // ÖNCE yalnız `uri.lastPathSegment` kullanılıyordu. `ACTION_PICK`
    // bazı cihaz/sürümlerde
    //   content://…/contacts/lookup/<lookupKey>
    // biçiminde döner; burada son parça KAYIT ID'si değil LOOKUP
    // anahtarıdır. `CONTACT_ID = <lookupKey>` sorgusu boş döner ve
    // telefon SESSİZCE boş kalır — rehberden eklenen kişiye davetiye
    // gönderilemiyordu (bildirilen hata).
    if (contactId.isBlank()) {
        val seg = uri.lastPathSegment?.trim().orEmpty()
        // Saf rakamsa ID olabilir; lookup anahtarı harf içerir.
        if (seg.isNotEmpty() && seg.all { it.isDigit() }) contactId = seg
    }

    // Telefonu birden çok yolla dene. `HAS_PHONE_NUMBER` bazı
    // sağlayıcılarda güvenilmez, sorgu zaten ucuz.
    //
    // Yol 1: CONTACT_ID ile Phone tablosu (en güvenilir)
    // Yol 2: URI doğrudan Phone satırıysa (content://…/data/<id>)
    //        `Phone._ID` ile oku — `ACTION_PICK` bazı cihazlarda
    //        kişi değil TELEFON satırı döndürür.
    val phone = firstPhoneNumber(context, contactId)
        .ifBlank { phoneFromUri(context, uri) }

    val finalName = name.ifBlank { phone }
    if (finalName.isBlank()) return null
    return PickedContact(name = finalName, phone = phone)
}

/**
 * Kişinin telefon numarasını döndürür.
 *
 * `CONTACT_ID` ile `Phone` tablosu sorgulanır. Bu, Android'in resmî
 * yoludur ve `ACTION_PICK`'in döndürdüğü URI biçiminden bağımsızdır.
 *
 * `HAS_PHONE_NUMBER` kolonuna GÜVENİLMEZ (bazı sağlayıcılar yanlış
 * değer döner) — sorgu zaten ucuz, doğrudan denenir.
 *
 * Birden çok numara varsa birincil (varsayılan) tercih edilir.
 * Numara yoksa boş dize döner; çağıran kişiyi isimle ekler.
 */
/**
 * URI doğrudan bir telefon satırını gösteriyorsa numarayı okur.
 *
 * `ACTION_PICK` bazı cihaz/sürümlerde `content://…/data/<id>` döndürür;
 * burada `<id>` KİŞİ değil TELEFON SATIRI kimliğidir. `CONTACT_ID = <id>`
 * sorgusu bu durumda yanlış sonuç verir veya boş döner.
 */
private fun phoneFromUri(context: Context, uri: Uri): String {
    val seg = uri.lastPathSegment?.trim().orEmpty()
    if (seg.isEmpty() || !seg.all { it.isDigit() }) return ""
    return runCatching {
        context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone._ID} = ?",
            arrayOf(seg),
            null,
        )?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.trim().orEmpty() else ""
        }.orEmpty()
    }.onFailure {
        android.util.Log.w("Dugunce", "Telefon URI'den okunamadı: $uri", it)
    }.getOrDefault("")
}

private fun firstPhoneNumber(context: Context, contactId: String): String {
    if (contactId.isBlank()) return ""
    return runCatching {
        context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
            arrayOf(contactId),
            "${ContactsContract.CommonDataKinds.Phone.IS_PRIMARY} DESC",
        )?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.trim().orEmpty() else ""
        }.orEmpty()
    }.onFailure {
        android.util.Log.w("Dugunce", "Telefon okunamadı (contactId=$contactId)", it)
    }.getOrDefault("")
}
