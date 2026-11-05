package com.lumibyte.dugunce.ui.screens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * WhatsApp bağlantı üretimi.
 *
 * NEDEN: Kullanıcı "paylaş dediğimde WhatsApp ANA SOHBET EKRANI açılıyor,
 * kişiyi bir daha bulmam gerekiyor" dedi. Kök neden `wa.me` bağlantısının
 * sohbeti açmamasıydı; `whatsapp://send?phone=` doğrudan sohbeti açar.
 *
 * Bu testler bağlantının numarayı DOĞRU taşıdığını kilitler.
 */
class WhatsAppUrlTest {

    @Test
    fun `numarali kisi icin dogrudan sohbet semasi kullanilir`() {
        val url = whatsappUrl("05551112233", "Merhaba")
        assertTrue(
            url.startsWith("whatsapp://send?phone="),
            "Doğrudan sohbet şeması kullanılmalıydı: $url",
        )
        assertTrue(url.contains("phone=905551112233"), "Numara normalize edilmeliydi: $url")
    }

    @Test
    fun `+90 onekli numara da normalize edilir`() {
        val url = whatsappUrl("+90 555 111 22 33", "Merhaba")
        assertTrue(url.contains("phone=905551112233"), "Numara bozuldu: $url")
    }

    @Test
    fun `numarasiz kiside sohbet sectirilir`() {
        val url = whatsappUrl(null, "Merhaba")
        // Numara yoksa yapılabilecek bir şey yok: WhatsApp kişi seçtirir.
        assertTrue(url.startsWith("https://wa.me/?text="), "Beklenmeyen URL: $url")
    }

    @Test
    fun `mesaj metni URL icinde kodlanir`() {
        val url = whatsappUrl("05551112233", "Merhaba Ayşe, düğünümüze bekleriz 🌸")
        // Türkçe karakterler ve boşluk kodlanmalı; ham 'ş' kalmamalı.
        assertTrue(!url.contains("ş"), "Türkçe karakter kodlanmadı: $url")
        assertTrue(url.contains("%20"), "Boşluk kodlanmadı: $url")
    }

    @Test
    fun `yedek baglanti her zaman https wa me`() {
        val url = whatsappFallbackUrl("05551112233", "Merhaba")
        assertEquals(true, url.startsWith("https://wa.me/905551112233?text="), "Yedek URL: $url")
    }

    // -----------------------------------------------------------------------
    // EMOJI KODLAMA — "??" regresyonu
    //
    // ÖNCE: `encodeUrl` her `char`'ı ayrı çeviriyordu. Emoji iki `char`
    // (surrogate pair) olduğu için her yarı geçersiz UTF-8 üretiyor ve
    // WhatsApp'ta "??" görünüyordu.
    // -----------------------------------------------------------------------

    @Test
    fun `emoji tek kod noktasi olarak kodlanir`() {
        val encoded = encodeUrl("🌸")
        // 🌸 = U+1F338 -> UTF-8: F0 9F 8C B8
        assertEquals("%F0%9F%8C%B8", encoded, "Emoji bozuk kodlandı: $encoded")
    }

    @Test
    fun `emoji ve turkce karakter birlikte dogru kodlanir`() {
        val encoded = encodeUrl("Düğün 🌸")
        assertTrue(!encoded.contains("?"), "Soru işareti üretildi: $encoded")
        assertTrue(encoded.contains("%F0%9F%8C%B8"), "Emoji kayıp: $encoded")
        // 'ü' = C3 BC, 'ğ' = C4 9F
        assertTrue(encoded.contains("%C3%BC"), "ü kodlanmadı: $encoded")
        assertTrue(encoded.contains("%C4%9F"), "ğ kodlanmadı: $encoded")
    }

    @Test
    fun `bosluk yuzde yirmi olur`() {
        assertEquals("a%20b", encodeUrl("a b"))
    }

    @Test
    fun `guvenli ascii karakterler korunur`() {
        assertEquals("abc123-_.~", encodeUrl("abc123-_.~"))
    }

    @Test
    fun `mesajdaki emoji WhatsApp URLinde bozulmaz`() {
        val url = whatsappUrl("05551112233", "Merhaba 🌸")
        assertTrue(url.contains("%F0%9F%8C%B8"), "Emoji URL'de bozuk: $url")
        assertTrue(!url.contains("??"), "Soru işareti var: $url")
    }
}
