package com.lumibyte.dugunce.util

/**
 * Panoya kopyalama — platforma özel.
 *
 * `commonMain`'de pano API'si yok. Android `ClipboardManager`, iOS
 * `UIPasteboard` kullanır. Başarısız olursa `false` döner; çağıran
 * kullanıcıya bilgi verir (sessizce yutulmaz).
 */
expect fun copyToClipboard(text: String): Boolean

/**
 * Sistem paylaşım sayfasını açar (WhatsApp, mesaj, e-posta…).
 *
 * Android `Intent.ACTION_SEND`, iOS `UIActivityViewController`. Kullanıcı
 * paylaşımı iptal ederse de `true` döner — niyet gösterildi sayılır.
 */
expect fun shareText(text: String, subject: String): Boolean

/**
 * Bir URL'yi sistemde açar (tarayıcı veya ilgili uygulama).
 *
 * WhatsApp daveti için `https://wa.me/<telefon>?text=<mesaj>` açılır:
 * WhatsApp kuruluysa doğrudan sohbet açılır, değilse tarayıcıya düşer.
 *
 * Android `Intent.ACTION_VIEW`, iOS `UIApplication.openURL`.
 *
 * @return açılabildiyse `true`. `false` ise çağıran kullanıcıya
 *         alternatif sunmalı (panoya kopyala gibi) — sessizce yutma.
 */
expect fun openUrl(url: String): Boolean
