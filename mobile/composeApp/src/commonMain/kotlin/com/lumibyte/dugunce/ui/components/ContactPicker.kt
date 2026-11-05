package com.lumibyte.dugunce.ui.components

import androidx.compose.runtime.Composable

/**
 * Rehberden kişi seçtirir.
 *
 * NEDEN `expect/actual` COMPOSABLE:
 * Android'de `rememberLauncherForActivityResult` kullanmak zorunlu
 * (izin akışı + sistem seçicisi Activity sonucu döndürür). Bu API
 * platforma özgüdür ve `commonMain`'de yoktur. Bu yüzden çağrı bir
 * composable olarak sarmalanır; ekranlar platformu bilmez.
 *
 * Android: `ActivityResultContracts.PickMultipleContacts`
 * iOS: `CNContactPickerViewController` (bu sürümde henüz bağlı değil —
 *      `available = false` döner, buton gizlenir)
 */
@Composable
expect fun rememberContactPicker(
    onPicked: (List<PickedContact>) -> Unit,
): ContactPickerHandle

/**
 * Rehber seçicisi tutamacı.
 *
 * `available` false ise buton GİZLENİR — kullanıcıya çalışmayan bir
 * düğme göstermeyiz (bildirilen "butona bastım, bir şey olmadı" hatası).
 */
class ContactPickerHandle(
    val available: Boolean,
    val launch: () -> Unit,
)

/**
 * Rehberden seçilen kişi.
 *
 * `phone` boş olabilir: bazı kişilerin kayıtlı numarası yoktur.
 */
data class PickedContact(
    val name: String,
    val phone: String,
)
