package com.lumibyte.dugunce.data

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Kişi sayısı ayarları — DTO sözleşmesi.
 *
 * Eski backend (alanlar yok) ve yeni backend (alanlar var) ikisi de
 * çözülebilmeli; aksi hâlde migration deploy edilmeden çıkan mobil
 * sürüm çöker.
 */
class PartySizeSettingsTest {

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    @Test
    fun `yeni alanlar json'dan okunur`() {
        val src = """
            {"id":"w1","coupleNames":"A & B","partySizeEnabled":false,
             "defaultPartySize":3,"maxPartySize":6}
        """.trimIndent()
        val dto = json.decodeFromString<WeddingDto>(src)
        assertFalse(dto.partySizeEnabled)
        assertEquals(3, dto.defaultPartySize)
        assertEquals(6, dto.maxPartySize)
    }

    @Test
    fun `alanlar yoksa varsayilanlar kullanilir`() {
        val src = """{"id":"w1","coupleNames":"A & B"}"""
        val dto = json.decodeFromString<WeddingDto>(src)
        assertTrue(dto.partySizeEnabled)
        assertEquals(2, dto.defaultPartySize)
        assertEquals(10, dto.maxPartySize)
    }

    @Test
    fun `yama yalniz degisen alanlari tasir`() {
        val patch = WeddingPatchRequest(
            partySizeEnabled = false,
            defaultPartySize = 3,
            maxPartySize = 6,
        )
        val out = json.encodeToString(WeddingPatchRequest.serializer(), patch)
        assertTrue(out.contains("\"partySizeEnabled\":false"))
        assertTrue(out.contains("\"defaultPartySize\":3"))
        assertTrue(out.contains("\"maxPartySize\":6"))
        assertFalse(out.contains("coupleNames"))
    }
}
