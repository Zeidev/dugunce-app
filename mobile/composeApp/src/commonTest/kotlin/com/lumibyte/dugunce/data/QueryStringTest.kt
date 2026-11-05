package com.lumibyte.dugunce.data

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Query string üretimi testleri — spec §6b.7 sunucu tarafı filtreleme.
 *
 * Elle `?`/`&` birleştirmek hata kaynağıydı: 3. parametre eklendiğinde
 * bozulur. Bu test sözleşmeyi kilitler.
 */
class QueryStringTest {

    private val repo = Repository(
        api = com.lumibyte.dugunce.api.ApiClient(),
        tokens = TokenStore(com.russhwolf.settings.MapSettings()),
    )

    @Test
    fun `parametre yoksa bos string`() {
        assertEquals("", repo.queryString())
        assertEquals("", repo.queryString("a" to null, "b" to null))
    }

    @Test
    fun `tek parametre soru isaretiyle`() {
        assertEquals("?side=BRIDE", repo.queryString("side" to "BRIDE"))
    }

    @Test
    fun `iki parametre ve isaretiyle`() {
        assertEquals("?side=BRIDE&rsvp=PENDING", repo.queryString("side" to "BRIDE", "rsvp" to "PENDING"))
    }

    @Test
    fun `uc parametre de dogru birlesir`() {
        assertEquals(
            "?a=1&b=2&c=3",
            repo.queryString("a" to "1", "b" to "2", "c" to "3"),
        )
    }

    @Test
    fun `null olan atlanir digerleri korunur`() {
        assertEquals(
            "?side=GROOM",
            repo.queryString("side" to "GROOM", "rsvp" to null),
        )
    }

    @Test
    fun `bos string deger korunur`() {
        assertEquals("?q=", repo.queryString("q" to ""))
    }

    @Test
    fun `ozel karakterler kodlanir`() {
        assertEquals("?name=Elif%20%26%20Mert", repo.queryString("name" to "Elif & Mert"))
    }

    @Test
    fun `turkce karakterler kodlanir`() {
        val encoded = repo.queryString("name" to "Ayşe")
        assertEquals("?name=Ay%C5%9Fe", encoded)
    }

    @Test
    fun `ascii guvenli karakterler korunur`() {
        assertEquals("?x=abc-123_ok.~", repo.queryString("x" to "abc-123_ok.~"))
    }

    @Test
    fun `ampersand parametre enjeksiyonu engellenir`() {
        // Değerin içindeki & kodlanmazsa yeni parametre gibi görünür
        val encoded = repo.queryString("q" to "a&admin=1")
        assertEquals("?q=a%26admin%3D1", encoded)
        // Tek '&' kalmalı: parametre ayırıcı. Değerdeki & kodlanmış olmalı.
        assertEquals(0, encoded.count { it == '&' }, "değerdeki & kodlanmalı")
    }
}
