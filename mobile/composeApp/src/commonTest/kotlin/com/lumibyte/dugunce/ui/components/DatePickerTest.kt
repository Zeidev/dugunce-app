package com.lumibyte.dugunce.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Tarih seçici dönüşümleri.
 *
 * Bildirilen hata: `DateField(onClick = { })` boş lambda alıyordu, tarih
 * seçilemiyordu. Yeni `DatePickerField` Material3 DatePicker kullanıyor;
 * bu test ISO ↔ epoch ms dönüşümünü kilitler.
 */
class DatePickerTest {

    @Test
    fun `iso epoch'a cevrilir`() {
        assertEquals(0L, isoToUtcMillis("1970-01-01"))
        val ms = isoToUtcMillis("2026-01-01")
        assertEquals("2026-01-01", utcMillisToIso(ms!!))
    }

    @Test
    fun `gidis donus tutarli`() {
        for (iso in listOf("2026-09-12", "2024-02-29", "2026-12-31", "2000-01-01")) {
            val ms = isoToUtcMillis(iso)!!
            assertEquals(iso, utcMillisToIso(ms), "bozuldu: $iso")
        }
    }

    @Test
    fun `artik yil dogru`() {
        assertEquals("2024-02-29", utcMillisToIso(isoToUtcMillis("2024-02-29")!!))
    }

    @Test
    fun `zaman damgasi da kabul edilir`() {
        assertEquals("2026-09-12", utcMillisToIso(isoToUtcMillis("2026-09-12T19:00:00Z")!!))
    }

    @Test
    fun `bos veya gecersiz null doner`() {
        assertNull(isoToUtcMillis(null))
        assertNull(isoToUtcMillis(""))
        assertNull(isoToUtcMillis("abc"))
        assertNull(isoToUtcMillis("2026-13-01"))
        assertNull(isoToUtcMillis("2026-01"))
    }

    @Test
    fun `ay sonu bozulmaz`() {
        for (iso in listOf("2026-01-31", "2026-04-30", "2026-06-30", "2026-11-30")) {
            assertEquals(iso, utcMillisToIso(isoToUtcMillis(iso)!!))
        }
    }

    @Test
    fun `gun farki dogru`() {
        val a = isoToUtcMillis("2026-01-01")!!
        val b = isoToUtcMillis("2026-01-31")!!
        assertEquals(30L * 86_400_000L, b - a)
    }
}
