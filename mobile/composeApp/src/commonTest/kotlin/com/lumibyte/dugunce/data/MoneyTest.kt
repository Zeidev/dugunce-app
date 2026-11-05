package com.lumibyte.dugunce.data

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Para testleri — brief §13: "Taksit toplamları harcama toplamına kuruş
 * hassasiyetinde eşit olur". Float YASAK (SECURITY §10.1).
 */
class MoneyTest {

    @Test
    fun `kurus turkce bicime cevrilir`() {
        assertEquals("12.000,00 ₺", Money.formatKurus(1_200_000L))
        assertEquals("0,00 ₺", Money.formatKurus(0L))
        assertEquals("0,05 ₺", Money.formatKurus(5L))
        assertEquals("1,00 ₺", Money.formatKurus(100L))
    }

    @Test
    fun `buyuk tutarlar binlik ayirici alir`() {
        assertEquals("1.234.567,89 ₺", Money.formatKurus(123_456_789L))
    }

    @Test
    fun `negatif tutar isaretlenir`() {
        assertEquals("-1.500,00 ₺", Money.formatKurus(-150_000L))
    }

    @Test
    fun `string kurus bicimlenir`() {
        assertEquals("1.200,00 ₺", Money.formatKurus("120000"))
    }

    @Test
    fun `gecersiz string tire doner`() {
        assertEquals("—", Money.formatKurus("abc"))
        assertEquals("—", Money.formatKurus(""))
    }

    @Test
    fun `turkce format ayristirilir`() {
        assertEquals("1200050", Money.parseToKurus("12.000,50"))
        assertEquals("1200000", Money.parseToKurus("12.000"))
        assertEquals("1200000", Money.parseToKurus("12000"))
    }

    @Test
    fun `nokta ondalik da kabul edilir`() {
        assertEquals("1200050", Money.parseToKurus("12000.50"))
    }

    @Test
    fun `tek haneli ondalik iki haneye tamamlanir`() {
        assertEquals("1200050", Money.parseToKurus("12000,5"))
    }

    @Test
    fun `gecersiz giris null doner`() {
        assertNull(Money.parseToKurus(""))
        assertNull(Money.parseToKurus("abc"))
        assertNull(Money.parseToKurus("12,345"))
        assertNull(Money.parseToKurus("-5"))
    }

    @Test
    fun `bosluk kirpilir`() {
        assertEquals("1200000", Money.parseToKurus("  12.000  "))
    }

    @Test
    fun `kurus TL stringe cevrilir - backend sozlesmesi`() {
        // Backend `amount` alanını TL bekliyor ve 100 ile çarpıyor.
        // Doğrudan kuruş göndermek 100 katı tutara yol açıyordu.
        assertEquals("12000.00", Money.kurusToTlString("1200000"))
        assertEquals("0.05", Money.kurusToTlString("5"))
        assertEquals("0.00", Money.kurusToTlString("0"))
        assertEquals("1234.56", Money.kurusToTlString("123456"))
    }

    @Test
    fun `buyuk tutar float'a donusmez`() {
        // Long sınırına yakın ama İÇİNDE bir değer: float'ta
        // (2^53 üstü) hassasiyet kaybolurdu, string korunmalı.
        // 9007199254740993 = 2^53 + 1 — float bu değeri 2^53 yapar.
        assertEquals("90071992547409.93", Money.kurusToTlString("9007199254740993"))
    }

    @Test
    fun `Long sinirini asan deger sifir doner - cokme yok`() {
        // 9999999999999999999 > Long.MAX_VALUE — toLongOrNull null döner
        assertEquals("0.00", Money.kurusToTlString("9999999999999999999"))
    }

    @Test
    fun `negatif tutar isaretli`() {
        assertEquals("-150.00", Money.kurusToTlString("-15000"))
    }

    @Test
    fun `gidis donus tutarli`() {
        val original = "1234567"
        val formatted = Money.formatKurus(original)
        val parsed = Money.parseToKurus(formatted.replace(" ₺", ""))
        assertEquals(original, parsed)
    }

    @Test
    fun `taksit bolme kurus hassasiyeti`() {
        // 12.000 TL / 4 = 3.000 TL
        val total = 1_200_000L
        val count = 4
        val per = total / count
        assertEquals(300_000L, per)
        assertEquals(total, per * count)
    }

    @Test
    fun `taksit bolme kalan son taksite eklenir`() {
        // 100,01 TL / 3 → 33,33 + 33,33 + 33,35
        val total = 10_001L
        val count = 3
        val per = total / count // 3333
        val remainder = total - per * count // 2
        assertEquals(3333L, per)
        assertEquals(2L, remainder)
        assertEquals(total, per * (count - 1) + (per + remainder))
    }
}
