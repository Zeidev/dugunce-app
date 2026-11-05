package com.lumibyte.dugunce.data

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Deep link ayrıştırma mantığı.
 *
 * Android `MainActivity` ve iOS `DeepLinkHandler` aynı kuralları
 * uygulamalı — biri değişirse bu test hatırlatır.
 *
 * Kabul edilen biçimler:
 * 1. `https://dugunce.com.tr/auth/#<token>`  (backend linki, fragment)
 * 2. `https://dugunce.com.tr/auth?token=<token>` (eski/paylaşılan)
 * 3. `dugunce://auth?token=<token>`          (/auth sayfası butonu)
 */
private data class Parsed(val token: String?, val code: String?)

private fun parse(scheme: String?, host: String?, path: String?, query: String?, fragment: String?): Parsed {
    // Fragment parametreleri
    val fragParams = fragment
        ?.removePrefix("#")
        ?.split('&')
        ?.mapNotNull { part ->
            val i = part.indexOf('=')
            if (i > 0) part.substring(0, i) to part.substring(i + 1) else null
        }
        ?.toMap()
        .orEmpty()

    val queryParams = query
        ?.split('&')
        ?.mapNotNull { part ->
            val i = part.indexOf('=')
            if (i > 0) part.substring(0, i) to part.substring(i + 1) else null
        }
        ?.toMap()
        .orEmpty()

    fun value(n: String) = queryParams[n] ?: fragParams[n]

    // MainActivity mantığı: özel şemada host, https'te path
    val hostOrPath = if (scheme == "dugunce") host else path?.trimEnd('/')
    val frag = fragment?.removePrefix("#")

    return when (hostOrPath) {
        "/auth", "auth" -> Parsed(
            token = value("token") ?: frag?.takeIf { it.isNotBlank() && !it.contains('=') },
            code = null,
        )
        "/invite", "invite" -> Parsed(token = null, code = value("code"))
        else -> Parsed(null, null)
    }
}

class DeepLinkTest {

    @Test
    fun `backend fragment bicimi`() {
        val p = parse("https", "dugunce.com.tr", "/auth/", null, "#abc123")
        assertEquals("abc123", p.token)
    }

    @Test
    fun `query bicimi`() {
        val p = parse("https", "dugunce.com.tr", "/auth/", "token=abc123", null)
        assertEquals("abc123", p.token)
    }

    @Test
    fun `ozel sema host bicimi`() {
        val p = parse("dugunce", "auth", "", "token=abc123", null)
        assertEquals("abc123", p.token)
    }

    @Test
    fun `davet kodu https`() {
        val p = parse("https", "dugunce.com.tr", "/invite", "code=ABC2345", null)
        assertEquals("ABC2345", p.code)
    }

    @Test
    fun `davet kodu ozel sema`() {
        val p = parse("dugunce", "invite", "", "code=ABC2345", null)
        assertEquals("ABC2345", p.code)
    }

    @Test
    fun `token yoksa null`() {
        val p = parse("https", "dugunce.com.tr", "/auth/", null, null)
        assertNull(p.token)
    }

    @Test
    fun `bilinmeyen yol yok sayilir`() {
        val p = parse("https", "dugunce.com.tr", "/baska", "token=x", null)
        assertNull(p.token)
    }

    @Test
    fun `sondaki egik cizgi sorun degil`() {
        assertEquals("t", parse("https", "dugunce.com.tr", "/auth/", null, "#t").token)
        assertEquals("t", parse("https", "dugunce.com.tr", "/auth", null, "#t").token)
    }

    @Test
    fun `fragment parametre bicimi`() {
        val p = parse("https", "dugunce.com.tr", "/auth", null, "#token=xyz")
        assertEquals("xyz", p.token)
    }
}
