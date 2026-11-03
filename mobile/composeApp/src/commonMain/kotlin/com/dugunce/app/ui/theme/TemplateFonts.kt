package com.dugunce.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import com.dugunce.app.Res
import com.dugunce.app.allura
import com.dugunce.app.bodoni_moda
import com.dugunce.app.cormorant_garamond
import com.dugunce.app.dancing_script
import com.dugunce.app.dm_serif_display
import com.dugunce.app.great_vibes
import com.dugunce.app.josefin_sans
import com.dugunce.app.parisienne
import com.dugunce.app.playfair_display
import com.dugunce.app.sacramento

/**
 * Davetiye fontları — web'deki `assets/fonts/` ile aynı aile.
 *
 * Amaç: çift şablon seçerken font adını **kendi stiliyle** görsün, böylece
 * "Great Vibes" ile "Bodoni Moda" arasındaki farkı okumadan anlasın.
 *
 * Dosyalar `composeResources/font/` altında TTF olarak durur (Compose
 * woff2 desteklemez). Web'deki woff2 kopyaları ayrı kalır — orada boyut
 * kritik, burada paket boyutu.
 *
 * Yeni font eklerken: TTF'i `composeResources/font/` altına koy, burada
 * `Font(Res.font.<dosya>)` ile bağla, `TemplateScreen`'deki `FONT_KEYS`
 * listesine anahtarını ekle. Üçü ayrışırsa derleme kırılır.
 */
object TemplateFonts {

    val Parisienne = FontFamily(Font(Res.font.parisienne))
    val GreatVibes = FontFamily(Font(Res.font.great_vibes))
    val DancingScript = FontFamily(Font(Res.font.dancing_script))
    val Allura = FontFamily(Font(Res.font.allura))
    val Sacramento = FontFamily(Font(Res.font.sacramento))
    val PlayfairDisplay = FontFamily(
        Font(Res.font.playfair_display, FontWeight.Bold),
        Font(Res.font.playfair_display, FontWeight.Normal, FontStyle.Normal),
    )
    val CormorantGaramond = FontFamily(Font(Res.font.cormorant_garamond))
    val DmSerifDisplay = FontFamily(Font(Res.font.dm_serif_display))
    val BodoniModa = FontFamily(Font(Res.font.bodoni_moda))
    val JosefinSans = FontFamily(Font(Res.font.josefin_sans))
}

/**
 * Font anahtarı → Compose font ailesi.
 *
 * Bilinmeyen anahtar `null` döner; çağıran varsayılan temaya düşer.
 * `TemplateScreen`'deki `FONT_KEYS` ile aynı anahtarları kullanır.
 */
/**
 * Font anahtarı → aile (Composable olmayan sürüm).
 *
 * `Font(Res.font.x)` composable değildir; testler bunu doğrudan çağırır.
 * `templateFontFamily` ince bir sarmalayıcıdır.
 */
fun templateFontFamilyOrNull(fontKey: String): FontFamily? = when (fontKey) {
    "PARISIENNE" -> TemplateFonts.Parisienne
    "GREAT_VIBES" -> TemplateFonts.GreatVibes
    "DANCING_SCRIPT" -> TemplateFonts.DancingScript
    "ALLURA" -> TemplateFonts.Allura
    "SACRAMENTO" -> TemplateFonts.Sacramento
    "PLAYFAIR" -> TemplateFonts.PlayfairDisplay
    "CORMORANT" -> TemplateFonts.CormorantGaramond
    "DM_SERIF" -> TemplateFonts.DmSerifDisplay
    "BODONI" -> TemplateFonts.BodoniModa
    "JOSEFIN" -> TemplateFonts.JosefinSans
    else -> null
}

/** Composable sarmalayıcı — ekranlarda bunu kullan. */
@Composable
fun templateFontFamily(fontKey: String): FontFamily? = templateFontFamilyOrNull(fontKey)
