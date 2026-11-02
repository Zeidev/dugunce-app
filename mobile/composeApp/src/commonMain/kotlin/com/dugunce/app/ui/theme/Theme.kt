package com.dugunce.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Düğünce tema sistemi.
 *
 * Brief §3.2: renk tokenları, tipografi ölçeği, boşluk ölçeği, köşe
 * yuvarlaklıkları, bileşenler, açık tema. Karanlık tema da destekleniyor —
 * ayarlardan seçilebilir.
 *
 * Ekranlar `DugunceTheme.colors` üzerinden renk okur; ham `Color(...)` yazmaz.
 */

/** Tema-duyarlı renk erişimi. */
data class DugunceColorScheme(
    val sage: Color,
    val sagePressed: Color,
    val sageSoft: Color,
    val sageBorder: Color,
    val cream: Color,
    val surface: Color,
    val surfaceAlt: Color,
    val ink: Color,
    val inkSoft: Color,
    val muted: Color,
    val line: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val info: Color,
    val infoSoft: Color,
    val overlay: Color,
    val isDark: Boolean,
)

private val LightColors = DugunceColorScheme(
    sage = LightPalette.sage,
    sagePressed = LightPalette.sagePressed,
    sageSoft = LightPalette.sageSoft,
    sageBorder = LightPalette.sageBorder,
    cream = LightPalette.cream,
    surface = LightPalette.surface,
    surfaceAlt = LightPalette.surfaceAlt,
    ink = LightPalette.ink,
    inkSoft = LightPalette.inkSoft,
    muted = LightPalette.muted,
    line = LightPalette.line,
    success = LightPalette.success,
    successSoft = LightPalette.successSoft,
    warning = LightPalette.warning,
    warningSoft = LightPalette.warningSoft,
    danger = LightPalette.danger,
    dangerSoft = LightPalette.dangerSoft,
    info = LightPalette.info,
    infoSoft = LightPalette.infoSoft,
    overlay = LightPalette.overlay,
    isDark = false,
)

private val DarkColors = DugunceColorScheme(
    sage = DarkPalette.sage,
    sagePressed = DarkPalette.sagePressed,
    sageSoft = DarkPalette.sageSoft,
    sageBorder = DarkPalette.sageBorder,
    cream = DarkPalette.cream,
    surface = DarkPalette.surface,
    surfaceAlt = DarkPalette.surfaceAlt,
    ink = DarkPalette.ink,
    inkSoft = DarkPalette.inkSoft,
    muted = DarkPalette.muted,
    line = DarkPalette.line,
    success = DarkPalette.success,
    successSoft = DarkPalette.successSoft,
    warning = DarkPalette.warning,
    warningSoft = DarkPalette.warningSoft,
    danger = DarkPalette.danger,
    dangerSoft = DarkPalette.dangerSoft,
    info = DarkPalette.info,
    infoSoft = DarkPalette.infoSoft,
    overlay = DarkPalette.overlay,
    isDark = true,
)

/** Tema modu — ayarlardan seçilir. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

val LocalDugunceColors = staticCompositionLocalOf { LightColors }

/** Kısayol: `DugunceTheme.colors.sage` */
object DugunceTheme {
    val colors: DugunceColorScheme
        @Composable get() = LocalDugunceColors.current
}

private fun materialLight(c: DugunceColorScheme) = lightColorScheme(
    primary = c.sage,
    onPrimary = Color.White,
    primaryContainer = c.sageSoft,
    onPrimaryContainer = c.sage,
    secondary = c.inkSoft,
    onSecondary = Color.White,
    background = c.cream,
    onBackground = c.ink,
    surface = c.surface,
    onSurface = c.ink,
    surfaceVariant = c.surfaceAlt,
    onSurfaceVariant = c.muted,
    outline = c.line,
    outlineVariant = c.line,
    error = c.danger,
    onError = Color.White,
    errorContainer = c.dangerSoft,
    onErrorContainer = c.danger,
)

private fun materialDark(c: DugunceColorScheme) = darkColorScheme(
    primary = c.sage,
    onPrimary = Color(0xFF1A2018),
    primaryContainer = c.sageSoft,
    onPrimaryContainer = c.sage,
    secondary = c.inkSoft,
    onSecondary = Color(0xFF1A2018),
    background = c.cream,
    onBackground = c.ink,
    surface = c.surface,
    onSurface = c.ink,
    surfaceVariant = c.surfaceAlt,
    onSurfaceVariant = c.muted,
    outline = c.line,
    outlineVariant = c.line,
    error = c.danger,
    onError = Color(0xFF2A1512),
    errorContainer = c.dangerSoft,
    onErrorContainer = c.danger,
)

/**
 * Tipografi — Material 3 ölçeğine Düğünce değerleri.
 *
 * Türkçe karakterler (ı, İ, ş, ğ, ü, ö, ç) varsayılan fontta sorunsuz;
 * `lineHeight` uzun Türkçe metinlerde taşmayı önlemek için cömert.
 */
private val DugunceTypography = Typography(
    displayLarge = TextStyle(fontSize = TypeScale.display, fontWeight = FontWeight.SemiBold, lineHeight = 42.sp),
    headlineLarge = TextStyle(fontSize = TypeScale.h1, fontWeight = FontWeight.SemiBold, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontSize = TypeScale.h2, fontWeight = FontWeight.SemiBold, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontSize = TypeScale.h3, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp),
    titleLarge = TextStyle(fontSize = TypeScale.h3, fontWeight = FontWeight.Medium, lineHeight = 26.sp),
    titleMedium = TextStyle(fontSize = TypeScale.body, fontWeight = FontWeight.Medium, lineHeight = 24.sp),
    titleSmall = TextStyle(fontSize = TypeScale.bodySm, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontSize = TypeScale.body, fontWeight = FontWeight.Normal, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = TypeScale.bodySm, fontWeight = FontWeight.Normal, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = TypeScale.caption, fontWeight = FontWeight.Normal, lineHeight = 19.sp),
    labelLarge = TextStyle(fontSize = TypeScale.bodySm, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
    labelMedium = TextStyle(fontSize = TypeScale.caption, fontWeight = FontWeight.Medium, lineHeight = 18.sp),
    labelSmall = TextStyle(fontSize = TypeScale.micro, fontWeight = FontWeight.Medium, lineHeight = 16.sp),
)

@Composable
fun DugunceTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    content: @Composable () -> Unit,
) {
    val dark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val palette = if (dark) DarkColors else LightColors
    val scheme = if (dark) materialDark(palette) else materialLight(palette)

    CompositionLocalProvider(LocalDugunceColors provides palette) {
        MaterialTheme(
            colorScheme = scheme,
            typography = DugunceTypography,
            content = content,
        )
    }
}
