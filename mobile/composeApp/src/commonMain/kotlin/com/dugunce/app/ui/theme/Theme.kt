package com.dugunce.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Düğünce renk paleti.
 *
 * Web sayfalarıyla (davetiye, yardımcı) aynı tonlar — marka tutarlılığı.
 */
object DugunceColors {
    val Background = Color(0xFFF4F2EE)
    val Surface = Color(0xFFFFFFFF)
    val Ink = Color(0xFF2D3A2E)
    val Muted = Color(0xFF7A746A)
    val Line = Color(0xFFE6E1D8)
    val Accent = Color(0xFF4A5F45)
    val AccentSoft = Color(0xFFEEF2EC)
    val Warning = Color(0xFFB8863B)
    val Danger = Color(0xFFA35B4A)
    val DangerSoft = Color(0xFFFBF3F1)
}

private val LightColors = lightColorScheme(
    primary = DugunceColors.Accent,
    onPrimary = Color.White,
    primaryContainer = DugunceColors.AccentSoft,
    onPrimaryContainer = DugunceColors.Accent,
    background = DugunceColors.Background,
    onBackground = DugunceColors.Ink,
    surface = DugunceColors.Surface,
    onSurface = DugunceColors.Ink,
    surfaceVariant = DugunceColors.Background,
    onSurfaceVariant = DugunceColors.Muted,
    outline = DugunceColors.Line,
    error = DugunceColors.Danger,
    onError = Color.White,
)

@Composable
fun DugunceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        content = content,
    )
}
