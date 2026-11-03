package com.dugunce.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontFamily

/**
 * Davetiye fontları — şablon seçim ekranında adları kendi stiliyle yazmak için.
 *
 * Font dosyaları platforma özeldir: Android `res/font/*.ttf` kullanır.
 * iOS tarafı henüz tanımlı değil (`null` döner, ekran varsayılan fonta
 * düşer — bozulmaz, yalnız önizleme sadeleşir).
 *
 * `expect/actual` yerine basit bir fonksiyon: font ailesi yalnız önizleme
 * süslemesi, işlevsel değil. Eksikse ekran çalışmaya devam eder.
 */
expect fun templateFontFamilyOrNull(fontKey: String): FontFamily?

/** Composable sarmalayıcı — ekranlarda bunu kullan. */
@Composable
fun templateFontFamily(fontKey: String): FontFamily? = templateFontFamilyOrNull(fontKey)
