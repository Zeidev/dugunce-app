package com.dugunce.app.ui.theme

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.dugunce.app.R

/**
 * Android font aileleri — `res/font/*.ttf` üzerinden.
 *
 * Web'deki `assets/fonts/` ile aynı aile. Compose resources yerine
 * platform kaynağı kullanılıyor: `Res` sınıfı `internal` üretildi, font
 * erişimcileri boş geldi ve TTF'ler resource generator tarafından hiç
 * taranmadı.
 */
actual fun templateFontFamilyOrNull(fontKey: String): FontFamily? = when (fontKey) {
    "PARISIENNE" -> FontFamily(Font(R.font.parisienne))
    "GREAT_VIBES" -> FontFamily(Font(R.font.great_vibes))
    "DANCING_SCRIPT" -> FontFamily(Font(R.font.dancing_script))
    "ALLURA" -> FontFamily(Font(R.font.allura))
    "SACRAMENTO" -> FontFamily(Font(R.font.sacramento))
    "PLAYFAIR" -> FontFamily(Font(R.font.playfair_display, FontWeight.Normal))
    "CORMORANT" -> FontFamily(Font(R.font.cormorant_garamond))
    "DM_SERIF" -> FontFamily(Font(R.font.dm_serif_display))
    "BODONI" -> FontFamily(Font(R.font.bodoni_moda))
    "JOSEFIN" -> FontFamily(Font(R.font.josefin_sans))
    else -> null
}
