package com.lumibyte.dugunce.util

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Tarih yardımcıları testleri.
 *
 * Türkçe ay adları, ay sonu, timezone-bağımsız epoch dönüşümü.
 */
class DatesTest {

    @AfterTest
    fun cleanup() {
        setTestClock(null)
    }

    @Test
    fun `ay adlari turkce`() {
        assertEquals("Ocak", Dates.monthName(1))
        assertEquals("Şubat", Dates.monthName(2))
        assertEquals("Mayıs", Dates.monthName(5))
        assertEquals("Ağustos", Dates.monthName(8))
        assertEquals("Eylül", Dates.monthName(9))
        assertEquals("Aralık", Dates.monthName(12))
    }

    @Test
    fun `kisa ay adlari`() {
        assertEquals("Oca", Dates.monthShort(1))
        assertEquals("Eyl", Dates.monthShort(9))
        assertEquals("Ara", Dates.monthShort(12))
    }

    @Test
    fun `iso tarih turkce bicime`() {
        assertEquals("12 Eylül 2026", Dates.formatDate("2026-09-12"))
        assertEquals("1 Ocak 2026", Dates.formatDate("2026-01-01"))
    }

    @Test
    fun `iso tarih kisa bicim`() {
        assertEquals("12.09.2026", Dates.formatShort("2026-09-12"))
    }

    @Test
    fun `zaman damgasindan tarih cikarilir`() {
        assertEquals("12 Eylül 2026", Dates.formatDate("2026-09-12T19:00:00.000Z"))
        assertEquals("19:00", Dates.formatTime("2026-09-12T19:00:00.000Z"))
    }

    @Test
    fun `ay bicimi`() {
        assertEquals("Eylül 2026", Dates.formatMonth("2026-09"))
        assertEquals("Ocak 2027", Dates.formatMonth("2027-01"))
    }

    @Test
    fun `bos girdi tire doner`() {
        assertEquals("—", Dates.formatDate(null))
        assertEquals("—", Dates.formatDate(""))
        assertEquals("—", Dates.formatMonth(null))
    }

    @Test
    fun `epoch gun donusumu gidis donus`() {
        val iso = "2026-09-12"
        val epoch = Dates.isoToEpochDay(iso)
        assertEquals(iso, Dates.epochDayToIso(epoch!!))
    }

    @Test
    fun `epoch donusumu artık yil`() {
        // 2024 artık yıl — 29 Şubat var
        val epoch = Dates.isoToEpochDay("2024-02-29")
        assertEquals("2024-02-29", Dates.epochDayToIso(epoch!!))
    }

    @Test
    fun `epoch donusumu ay sonu`() {
        for (iso in listOf("2026-01-31", "2026-04-30", "2026-12-31", "2024-02-29")) {
            val epoch = Dates.isoToEpochDay(iso)!!
            assertEquals(iso, Dates.epochDayToIso(epoch), "ay sonu bozuldu: $iso")
        }
    }

    @Test
    fun `gecersiz tarih null doner`() {
        assertNull(Dates.isoToEpochDay("2026-13-01"))
        assertNull(Dates.isoToEpochDay("abc"))
        assertNull(Dates.isoToEpochDay("2026-01"))
    }

    @Test
    fun `gun farki hesaplanir`() {
        setTestClock { Dates.isoToEpochDay("2026-09-10")!! * 86_400_000L }
        assertEquals(2, Dates.daysUntil("2026-09-12"))
        assertEquals(0, Dates.daysUntil("2026-09-10"))
        assertEquals(-1, Dates.daysUntil("2026-09-09"))
    }

    @Test
    fun `goreli gun metni`() {
        setTestClock { Dates.isoToEpochDay("2026-09-10")!! * 86_400_000L }
        assertEquals("Bugün", Dates.relativeDays("2026-09-10"))
        assertEquals("Yarın", Dates.relativeDays("2026-09-11"))
        assertEquals("2 gün kaldı", Dates.relativeDays("2026-09-12"))
        assertEquals("Dün", Dates.relativeDays("2026-09-09"))
        assertEquals("2 gün geçti", Dates.relativeDays("2026-09-08"))
    }

    @Test
    fun `bugun iso uretilir`() {
        setTestClock { Dates.isoToEpochDay("2026-11-02")!! * 86_400_000L }
        assertEquals("2026-11-02", Dates.todayIso())
        assertEquals("2026-11", Dates.currentMonth())
    }

    @Test
    fun `ay cikarimi`() {
        assertEquals("2026-09", Dates.monthOf("2026-09-12"))
        assertEquals("2026-09", Dates.monthOf("2026-09-12T19:00:00Z"))
        assertNull(Dates.monthOf(null))
    }
}

/**
 * Türkçe tarih ayrıştırma — onboarding formu.
 */
class TurkishDateTest {

    @Test
    fun `nokta ayirici`() {
        assertEquals("2026-09-12", com.lumibyte.dugunce.ui.screens.parseTurkishDate("12.09.2026"))
    }

    @Test
    fun `slash ayirici`() {
        assertEquals("2026-09-12", com.lumibyte.dugunce.ui.screens.parseTurkishDate("12/09/2026"))
    }

    @Test
    fun `iso bicimi de kabul edilir`() {
        assertEquals("2026-09-12", com.lumibyte.dugunce.ui.screens.parseTurkishDate("2026-09-12"))
    }

    @Test
    fun `gecersiz tarihler null`() {
        assertNull(com.lumibyte.dugunce.ui.screens.parseTurkishDate(""))
        assertNull(com.lumibyte.dugunce.ui.screens.parseTurkishDate("32.09.2026"))
        assertNull(com.lumibyte.dugunce.ui.screens.parseTurkishDate("12.13.2026"))
        assertNull(com.lumibyte.dugunce.ui.screens.parseTurkishDate("abc"))
        assertNull(com.lumibyte.dugunce.ui.screens.parseTurkishDate("12.09"))
    }

    @Test
    fun `format ve parse gidis donus`() {
        val iso = "2026-09-12"
        val tr = com.lumibyte.dugunce.ui.screens.formatTurkishDate(iso)
        assertEquals("12.09.2026", tr)
        assertEquals(iso, com.lumibyte.dugunce.ui.screens.parseTurkishDate(tr))
    }
}
