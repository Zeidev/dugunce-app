package com.lumibyte.dugunce.ui

import androidx.compose.runtime.Composable

/**
 * Sistem geri tusu / geri jesti.
 *
 * Android'de `BackHandler` (activity-compose), iOS'ta surukleme geri
 * jesti ayri ele alinir. Ortak kod platform bilmez.
 *
 * `enabled = false` iken sistem varsayilan davranisi calisir
 * (uygulamadan cikis).
 */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)
