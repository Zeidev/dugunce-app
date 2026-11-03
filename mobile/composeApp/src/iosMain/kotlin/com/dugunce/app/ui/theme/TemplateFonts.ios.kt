package com.dugunce.app.ui.theme

import androidx.compose.ui.text.font.FontFamily

/**
 * iOS font aileleri.
 *
 * Font dosyaları henüz iOS paketine eklenmedi (`Info.plist` UIAppFonts
 * kaydı gerekir). `null` dönmek güvenli: ekran varsayılan fonta düşer,
 * işlev bozulmaz — yalnız font önizlemesi sadeleşir.
 */
actual fun templateFontFamilyOrNull(fontKey: String): FontFamily? = null
