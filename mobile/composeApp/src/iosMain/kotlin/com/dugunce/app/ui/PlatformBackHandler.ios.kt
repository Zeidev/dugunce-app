package com.dugunce.app.ui

import androidx.compose.runtime.Composable

/**
 * iOS: sistem geri tusu yok.
 *
 * Ekranlardaki geri oku (`TopBar`) tek yol. Gelecekte surukleme geri
 * jesti eklenirse burada baglanir.
 */
@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    // iOS'ta donanim geri tusu yok; no-op.
}
