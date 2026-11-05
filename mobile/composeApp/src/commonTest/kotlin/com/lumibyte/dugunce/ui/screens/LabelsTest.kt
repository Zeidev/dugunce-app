package com.lumibyte.dugunce.ui.screens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * WhatsApp davet testleri — brief §5.5, spec §6b.2.
 *
 * Kurallar: şablon Türkçe, URL encode doğru, otomatik gönderim YOK.
 */
class WhatsAppTest {

    @Test
    fun `mesaj sablonu turkce`() {
        val msg = buildWhatsAppMessage("Ayşe", "https://dugunce.com.tr/d#abc")
        assertTrue(msg.contains("Merhaba Ayşe"))
        assertTrue(msg.contains("düğünümüze"))
        assertTrue(msg.contains("https://dugunce.com.tr/d#abc"))
    }

    @Test
    fun `telefon 90 oneki alir`() {
        assertEquals("905551112233", normalizePhone("05551112233"))
        assertEquals("905551112233", normalizePhone("+90 555 111 22 33"))
        assertEquals("905551112233", normalizePhone("5551112233"))
    }

    @Test
    fun `zaten 90 ile baslayan korunur`() {
        assertEquals("905551112233", normalizePhone("905551112233"))
    }

    @Test
    fun `bos telefon bos doner`() {
        assertEquals("", normalizePhone(null))
        assertEquals("", normalizePhone(""))
    }

    @Test
    fun `url encode turkce karakterleri kodlar`() {
        val encoded = encodeUrl("Merhaba Ayşe")
        assertTrue(encoded.contains("%20"), "boşluk kodlanmalı: $encoded")
        assertTrue(!encoded.contains(" "), "ham boşluk kalmamalı")
        // ş = U+015F → UTF-8 C5 9F
        assertTrue(encoded.contains("%C5%9F"), "ş kodlanmalı: $encoded")
    }

    @Test
    fun `url encode ascii korunur`() {
        assertEquals("abc123-_.~", encodeUrl("abc123-_.~"))
    }

    @Test
    fun `url encode emoji`() {
        val encoded = encodeUrl("🌸")
        assertTrue(encoded.startsWith("%"), "emoji kodlanmalı: $encoded")
    }

    @Test
    fun `wa me url bicimi`() {
        val phone = normalizePhone("05551112233")
        val text = encodeUrl(buildWhatsAppMessage("Ayşe", "https://x.co/d#t"))
        val url = "https://wa.me/$phone?text=$text"
        assertTrue(url.startsWith("https://wa.me/905551112233?text="))
    }
}

/**
 * RSVP etiketleri — durumlar renk + metin + ikon (brief §3.1).
 */
class RsvpLabelTest {

    @Test
    fun `rsvp metinleri turkce`() {
        assertEquals("Katılacak", rsvpLabel("ATTENDING"))
        assertEquals("Katılmayacak", rsvpLabel("DECLINED"))
        assertEquals("Yanıt yok", rsvpLabel("PENDING"))
        assertEquals("—", rsvpLabel(null))
    }

    @Test
    fun `rsvp tonlari ayrisir`() {
        assertEquals(com.lumibyte.dugunce.ui.components.StatusTone.SUCCESS, rsvpTone("ATTENDING"))
        assertEquals(com.lumibyte.dugunce.ui.components.StatusTone.DANGER, rsvpTone("DECLINED"))
        assertEquals(com.lumibyte.dugunce.ui.components.StatusTone.WARNING, rsvpTone("PENDING"))
    }

    @Test
    fun `her rsvp icin ayri ikon var`() {
        // Renk tek başına anlam taşımamalı — ikon zorunlu (brief §3.1).
        // Üç durumun ikonu BİRBİRİNDEN FARKLI olmalı, yoksa ayrım kaybolur.
        val attending = rsvpIcon("ATTENDING")
        val declined = rsvpIcon("DECLINED")
        val pending = rsvpIcon("PENDING")
        assertEquals(3, setOf(attending, declined, pending).size, "ikonlar ayrışmalı")
    }
}

/**
 * Görev durum etiketleri.
 */
class TaskStatusLabelTest {

    @Test
    fun `gorev durumlari turkce`() {
        assertEquals("Yapılacak", taskStatusLabel("TODO"))
        assertEquals("Devam ediyor", taskStatusLabel("DOING"))
        assertEquals("Bitti", taskStatusLabel("DONE"))
    }

    @Test
    fun `her gorev durumu icin ayri ikon var`() {
        val todo = taskStatusIcon("TODO")
        val doing = taskStatusIcon("DOING")
        val done = taskStatusIcon("DONE")
        assertEquals(3, setOf(todo, doing, done).size, "ikonlar ayrışmalı")
    }

    @Test
    fun `taraf etiketleri`() {
        assertEquals("Gelin", sideLabel("BRIDE"))
        assertEquals("Damat", sideLabel("GROOM"))
        assertEquals("Ortak", sideLabel("SHARED"))
    }

    @Test
    fun `odeme yontemi etiketleri`() {
        assertEquals("Nakit", methodLabel("CASH"))
        assertEquals("Kredi kartı", methodLabel("CARD"))
        assertEquals("Havale/EFT", methodLabel("TRANSFER"))
    }
}
