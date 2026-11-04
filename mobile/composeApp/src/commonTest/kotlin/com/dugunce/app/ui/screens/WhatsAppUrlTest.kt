package com.dugunce.app.ui.screens

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
}
