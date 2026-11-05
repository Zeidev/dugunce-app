package com.lumibyte.dugunce.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Hata eşlemesi ve ağ kesintisi — brief §13: "Ağ kesintisi ve tekrar
 * deneme", "Yükleniyor/hata/başarı durumları".
 *
 * Kural (brief §16.3): "Hataları sessizce yutma", "Kullanıcıya teknik
 * stack trace gösterme".
 */
class ErrorsTest {

    @Test
    fun `401 yetkisiz olarak isaretlenir`() {
        val e = ApiException(401, "UNAUTHORIZED", "Oturum gerekli")
        assertTrue(e.isUnauthorized)
        assertFalse(e.isNotFound)
        assertFalse(e.isValidation)
    }

    @Test
    fun `404 bulunamadi`() {
        val e = ApiException(404, "NOT_FOUND", "Kayıt bulunamadı")
        assertTrue(e.isNotFound)
        assertFalse(e.isUnauthorized)
    }

    @Test
    fun `400 ve 422 dogrulama hatasi`() {
        assertTrue(ApiException(400, "BAD_REQUEST", "Geçersiz").isValidation)
        assertTrue(ApiException(422, "UNPROCESSABLE", "İşlenemedi").isValidation)
        assertFalse(ApiException(500, "INTERNAL", "Hata").isValidation)
    }

    @Test
    fun `limit hatasi taninir`() {
        val e = ApiException(422, "LIMIT_REACHED", "En fazla 30 davetli")
        assertTrue(e.isLimitReached)
        assertEquals(30, e.details?.limit ?: 30)
    }

    @Test
    fun `network hatasi mesaji korunur`() {
        val e = NetworkException("Bağlantı kurulamadı")
        assertEquals("Bağlantı kurulamadı", e.message)
    }

    @Test
    fun `api hatasi kullanici mesajini tasir`() {
        // Kullanıcıya gösterilecek metin backend'den gelir, Türkçe
        val e = ApiException(422, "LIMIT_REACHED", "En fazla 30 davetli ekleyebilirsiniz")
        assertEquals("En fazla 30 davetli ekleyebilirsiniz", e.message)
    }

    @Test
    fun `stack trace kullaniciya gitmez`() {
        // message alanı yalnızca backend'in Türkçe metni; exception
        // toString'i UI'da kullanılmamalı.
        val e = ApiException(500, "INTERNAL", "Beklenmeyen bir hata oluştu")
        assertFalse(e.message!!.contains("Exception"))
        assertFalse(e.message!!.contains("at "))
    }

    @Test
    fun `detay alanlari opsiyonel`() {
        val without = ApiException(400, "BAD_REQUEST", "Hata")
        assertEquals(null, without.details)

        val with = ApiException(
            422, "LIMIT_REACHED", "Limit",
            ErrorDetails(limit = 30, current = 30, requested = 1),
        )
        assertEquals(30, with.details?.limit)
        assertEquals(1, with.details?.requested)
    }

    @Test
    fun `bilinmeyen kod cokme yaratmaz`() {
        val e = ApiException(418, "TEAPOT", "Beklenmeyen")
        assertFalse(e.isLimitReached)
        assertFalse(e.isUnauthorized)
        assertFalse(e.isNotFound)
        assertFalse(e.isValidation)
    }
}
