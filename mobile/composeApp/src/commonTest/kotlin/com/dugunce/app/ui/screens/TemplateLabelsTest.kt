package com.dugunce.app.ui.screens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Şablon ve font etiketleri.
 *
 * Anahtar listeleri backend `weddings/templates.ts` ile birebir aynı
 * olmalı — davetiye sayfası ve API bu anahtarları kullanıyor.
 */
class TemplateLabelsTest {

    @Test
    fun `on bir sablonun hepsi etiketli`() {
        assertEquals(11, TEMPLATE_KEYS.size)
        TEMPLATE_KEYS.forEach { key ->
            assertTrue(templateLabel(key).isNotBlank(), "$key etiketi boş")
        }
    }

    @Test
    fun `on fontun hepsi etiketli`() {
        assertEquals(10, FONT_KEYS.size)
        FONT_KEYS.forEach { key ->
            assertTrue(fontLabel(key).isNotBlank(), "$key etiketi boş")
        }
    }

    @Test
    fun `bilinmeyen sablon Zarif doner`() {
        assertEquals("Zarif", templateLabel("YOK"))
    }

    @Test
    fun `bos sablon Zarif doner`() {
        assertEquals("Zarif", templateLabel(""))
    }

    @Test
    fun `bilinmeyen font ilk fonta doner`() {
        assertEquals(fontLabel(FONT_KEYS.first()), fontLabel("YOK_FONT"))
    }

    @Test
    fun `her sablonun onerilen fontu gecerli`() {
        TEMPLATE_KEYS.forEach { key ->
            val font = recommendedFont(key)
            assertTrue(FONT_KEYS.contains(font), "$key için önerilen font geçersiz: $font")
        }
    }

    @Test
    fun `normalizeFont bos fontu onerilene cevirir`() {
        assertEquals(recommendedFont("GECE"), normalizeFontKey("GECE", ""))
    }

    @Test
    fun `normalizeFont gecersiz fontu onerilene cevirir`() {
        assertEquals(recommendedFont("MINIMAL"), normalizeFontKey("MINIMAL", "YOK"))
    }

    @Test
    fun `normalizeFont gecerli fontu korur`() {
        assertEquals("BODONI", normalizeFontKey("GECE", "BODONI"))
    }


    @Test
    fun `sablon anahtarlari backend ile ayni`() {
        assertEquals(
            listOf(
                "ZARIF", "BOTANIK", "ROMANTIK", "MINIMAL", "GECE", "ZEYTIN",
                "EDITORYAL", "MONOGRAM", "LUKS", "FOTOGRAFLI", "TIPOGRAFI",
            ),
            TEMPLATE_KEYS,
        )
    }

    @Test
    fun `font anahtarlari backend ile ayni`() {
        assertEquals(
            listOf(
                "PARISIENNE", "GREAT_VIBES", "DANCING_SCRIPT", "ALLURA", "SACRAMENTO",
                "PLAYFAIR", "CORMORANT", "DM_SERIF", "BODONI", "JOSEFIN",
            ),
            FONT_KEYS,
        )
    }
}
