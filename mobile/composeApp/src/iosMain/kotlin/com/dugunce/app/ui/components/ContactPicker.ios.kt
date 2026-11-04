package com.dugunce.app.ui.components

import androidx.compose.runtime.Composable

/**
 * iOS: rehberden kişi seçimi.
 *
 * Bu sürümde HENÜZ BAĞLI DEĞİL. `available = false` döndüğü için
 * "Rehberden ekle" butonu GÖRÜNMEZ — kullanıcıya çalışmayan bir düğme
 * göstermeyiz.
 *
 * Bağlamak için: `CNContactPickerViewController` bir
 * `UIViewController` sunar; `LocalUIViewController` üzerinden present
 * edilip `CNContactPickerDelegate` ile sonuç alınır. Apple tarafında
 * `NSContactsUsageDescription` bilgi metni de eklenmeli.
 */
@Composable
actual fun rememberContactPicker(
    onPicked: (List<PickedContact>) -> Unit,
): ContactPickerHandle = ContactPickerHandle(
    available = false,
    launch = {},
)
