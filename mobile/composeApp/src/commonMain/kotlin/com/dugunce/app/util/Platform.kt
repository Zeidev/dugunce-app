package com.dugunce.app.util

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
