package com.dugunce.app.ui.screens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Şablon ücretsiz/premium ayrımı — istemci tarafı.
 *
 * Backend `FREE_TEMPLATES` ile BİREBİR aynı olmalı. Ayrışırsa kullanıcı
 * seçer, sunucu 403 döner ve "premium gerekli" hatası alır.
 */
class TemplateTiersTest {

    @Test
    fun `ilk iki sablon ucretsiz`() {
        assertEquals(listOf("ZARIF", "BOTANIK"), FREE_TEMPLATE_KEYS)
        assertEquals(FREE_TEMPLATE_KEYS, TEMPLATE_KEYS.take(2))
    }

    @Test
    fun `ucretsiz sablonlar dogru taninir`() {
        assertTrue(isTemplateFree("ZARIF"))
        assertTrue(isTemplateFree("BOTANIK"))
    }

    @Test
    fun `diger sablonlar premium`() {
        val premium = TEMPLATE_KEYS.filterNot { isTemplateFree(it) }
        assertEquals(9, premium.size)
        assertFalse(isTemplateFree("GECE"))
        assertFalse(isTemplateFree("LUKS"))
    }

    @Test
    fun `bilinmeyen sablon ucretsiz sayilmaz`() {
        assertFalse(isTemplateFree("UYDURMA"))
        assertFalse(isTemplateFree(""))
    }
}
