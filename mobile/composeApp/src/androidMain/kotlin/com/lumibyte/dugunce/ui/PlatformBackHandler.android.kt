package com.lumibyte.dugunce.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable

/** Android: sistem geri tusu / geri jesti. */
@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    BackHandler(enabled = enabled, onBack = onBack)
}
