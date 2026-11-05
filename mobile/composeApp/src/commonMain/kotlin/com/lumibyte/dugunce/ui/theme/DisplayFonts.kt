package com.lumibyte.dugunce.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.font.FontFamily

/**
 * Baslik fontu (serif) - platformdan saglanir.
 *
 * NEDEN CompositionLocal: `Font(R.font.x)` yalniz Android'de, `Font("name")`
 * yalniz iOS'ta var. Ortak kodda `expect/actual` yerine tema kurulumunda
 * deger veriyoruz - boylece ortak kod platform bilmez.
 *
 * Varsayilan `null` = sistem fontu. Font yuklenemezse uygulama calisir,
 * yalniz basliklar sade gorunur.
 */
val LocalDisplayFont = staticCompositionLocalOf<FontFamily?> { null }

/** Govde fontu (sans-serif) - ayni mantik. */
val LocalBodyFont = staticCompositionLocalOf<FontFamily?> { null }
