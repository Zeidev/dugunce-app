package com.dugunce.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Tasarım tokenları — `docs/DUGUNCE_CLAUDE_BRIEF-v2.md` §3.
 *
 * Kural: hiçbir ekran ham renk/ölçü yazmaz; her değer buradan gelir.
 * Renkler adaçayı yeşili + kırık beyaz + bej (brief §3.1 "Modern Premium").
 */

// ---------------------------------------------------------------------------
// Renkler
// ---------------------------------------------------------------------------

/**
 * Açık tema paleti.
 *
 * Kontrast: `ink` üzerine `cream` ≈ 12:1, `muted` ≈ 4.6:1 (WCAG AA).
 * Durum renkleri ASLA tek başına anlam taşımaz — her zaman metin/ikon eşlik eder
 * (brief §3.1).
 */
object LightPalette {
    val sage = Color(0xFF4A5F45)
    val sagePressed = Color(0xFF3B4C37)
    val sageSoft = Color(0xFFEEF2EC)
    val sageBorder = Color(0xFFD6E0D2)

    val cream = Color(0xFFF4F2EE)
    val surface = Color(0xFFFFFFFF)
    val surfaceAlt = Color(0xFFFAF8F4)

    val ink = Color(0xFF2D3A2E)
    val inkSoft = Color(0xFF4E5A4F)
    val muted = Color(0xFF7A746A)
    val line = Color(0xFFE6E1D8)

    val success = Color(0xFF4A7C59)
    val successSoft = Color(0xFFEDF5EF)
    val warning = Color(0xFFB8863B)
    val warningSoft = Color(0xFFFBF5EA)
    val danger = Color(0xFFA35B4A)
    val dangerSoft = Color(0xFFFBF3F1)
    val info = Color(0xFF4A6B8A)
    val infoSoft = Color(0xFFEFF3F8)

    val overlay = Color(0x1F2D3A2E)
}

/**
 * Koyu tema paleti.
 *
 * Adaçayı tonu açılır (koyu zeminde okunabilirlik), yüzeyler nötr yeşil-siyah.
 */
object DarkPalette {
    val sage = Color(0xFFA8BFA0)
    val sagePressed = Color(0xFFC0D3B9)
    val sageSoft = Color(0xFF2A3328)
    val sageBorder = Color(0xFF3A4536)

    val cream = Color(0xFF141613)
    val surface = Color(0xFF1C1F1A)
    val surfaceAlt = Color(0xFF232720)

    val ink = Color(0xFFE8E6E1)
    val inkSoft = Color(0xFFC9C6BF)
    val muted = Color(0xFF9A948A)
    val line = Color(0xFF2E332B)

    val success = Color(0xFF7FB08D)
    val successSoft = Color(0xFF1F2A22)
    val warning = Color(0xFFD9A85C)
    val warningSoft = Color(0xFF2C2619)
    val danger = Color(0xFFD08A78)
    val dangerSoft = Color(0xFF2C1F1B)
    val info = Color(0xFF8AAEC8)
    val infoSoft = Color(0xFF1B2228)

    val overlay = Color(0x66000000)
}

// ---------------------------------------------------------------------------
// Ölçüler
// ---------------------------------------------------------------------------

/**
 * Boşluk ölçeği — 4'ün katları.
 *
 * Brief §3.1: "mobil kullanımda büyük dokunma alanları".
 */
object Spacing {
    val xxs: Dp = 2.dp
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 24.dp
    val xxl: Dp = 32.dp
    val xxxl: Dp = 48.dp

    /** Ekran kenar boşluğu. */
    val screenH: Dp = 20.dp

    /** Minimum dokunma hedefi (erişilebilirlik). */
    val minTouchTarget: Dp = 48.dp
}

/** Köşe yuvarlaklıkları. */
object Radius {
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 24.dp
    val pill: Dp = 999.dp
}

/**
 * Tipografi ölçeği.
 *
 * `sp` kullanılıyor — dinamik yazı boyutuna saygı duyar (brief §3.1).
 */
object TypeScale {
    val display = 34.sp
    val h1 = 28.sp
    val h2 = 22.sp
    val h3 = 18.sp
    val body = 16.sp
    val bodySm = 14.sp
    val caption = 13.sp
    val micro = 11.sp

    /** Para rakamları için — tabular hizalama ekranlarda uygulanır. */
    val moneyLg = 30.sp
    val moneyMd = 20.sp
    val moneySm = 16.sp
}

/** Hareket sabitleri — tutarlı his. */
object Motion {
    const val fast = 120
    const val normal = 220
    const val slow = 320
}

/** Yükselti. */
object Elevation {
    val none: Dp = 0.dp
    val card: Dp = 1.dp
    val raised: Dp = 3.dp
    val sheet: Dp = 8.dp
}
