package com.dugunce.app.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Bağlantı üretimi testleri.
 *
 * Backend `/h#token` gibi GÖRELİ yol döner (design §7). Mutlak URL'ye
 * çevrilmezse WhatsApp'a giden link açılmaz — bu test onu kilitler.
 */
class LinksTest {

    @Test
    fun `goreli yardimci yolu tam url olur`() {
        assertEquals("https://dugunce.com.tr/h#abc123", Links.absolute("/h#abc123"))
    }

    @Test
    fun `goreli davetiye yolu tam url olur`() {
        assertEquals("https://dugunce.com.tr/d#tok", Links.absolute("/d#tok"))
    }

    @Test
    fun `bas egik cizgi yoksa da eklenir`() {
        assertEquals("https://dugunce.com.tr/h#x", Links.absolute("h#x"))
    }

    @Test
    fun `mutlak url korunur`() {
        assertEquals("https://baska.com/x", Links.absolute("https://baska.com/x"))
        assertEquals("http://yerel:3000/x", Links.absolute("http://yerel:3000/x"))
    }

    @Test
    fun `bos girdi null`() {
        assertNull(Links.absolute(null))
        assertNull(Links.absolute(""))
        assertNull(Links.absolute("   "))
    }

    @Test
    fun `yardimci linki url alanindan`() {
        assertEquals(
            "https://dugunce.com.tr/h#tok",
            Links.helperInvite("/h#tok", "tok"),
        )
    }

    @Test
    fun `yardimci linki token'dan uretilir`() {
        // Sunucu url göndermezse token'dan kur
        assertEquals(
            "https://dugunce.com.tr/h#tok",
            Links.helperInvite(null, "tok"),
        )
    }

    @Test
    fun `yardimci linki ikisi de yoksa null`() {
        assertNull(Links.helperInvite(null, null))
    }

    @Test
    fun `davetiye linki url alanindan`() {
        assertEquals(
            "https://dugunce.com.tr/d#tok",
            Links.guestInvite("/d#tok", "tok"),
        )
    }

    @Test
    fun `davetiye linki token'dan uretilir`() {
        assertEquals(
            "https://dugunce.com.tr/d#tok",
            Links.guestInvite(null, "tok"),
        )
    }

    @Test
    fun `token fragment'te kalir sunucuya gitmez`() {
        // Tasarım kararı: token '#' sonrasında. Bu test regresyonu engeller —
        // token yol segmentine taşınırsa sunucu loglarına düşer.
        val url = Links.guestInvite("/d#gizli-token", null)!!
        val afterHash = url.substringAfter("#")
        assertEquals("gizli-token", afterHash)
        assertEquals("https://dugunce.com.tr/d", url.substringBefore("#"))
    }
}
