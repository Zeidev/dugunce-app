package com.lumibyte.dugunce.push

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Bildirim yükü çözümleme — saf fonksiyon testleri.
 *
 * NEDEN: `data.weddingId` yoksa veya boşsa yanlış ekrana gitmek
 * (beyaz ekran) gerçek bir hata sınıfı. Sunucu `data`yı değiştirirse
 * burada yakalanır.
 */
class NotificationPayloadTest {
    @Test
    fun weddingIdVeridenOkunur() {
        assertEquals("w1", extractWeddingId(mapOf("weddingId" to "w1")))
    }

    @Test
    fun weddingIdYoksaNull() {
        assertNull(extractWeddingId(emptyMap()))
    }

    @Test
    fun bosWeddingIdNullSayilir() {
        assertNull(extractWeddingId(mapOf("weddingId" to "")))
    }

    @Test
    fun sadeceBoslukOlanWeddingIdNullSayilir() {
        assertNull(extractWeddingId(mapOf("weddingId" to "   ")))
    }

    @Test
    fun deepLinkUretilir() {
        assertEquals("dugunce://wedding/w1", notificationDeepLink("w1"))
    }

    @Test
    fun weddingIdYoksaDeepLinkYok() {
        assertNull(notificationDeepLink(null))
    }
}
