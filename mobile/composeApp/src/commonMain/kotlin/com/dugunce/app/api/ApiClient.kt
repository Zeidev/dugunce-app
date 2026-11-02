package com.dugunce.app.api

import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.header
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * API istemcisi.
 *
 * Tüm ağ erişimi buradan geçer. Token her istekte `Authorization`
 * başlığında taşınır.
 *
 * GÜVENLİK: Token ASLA log'a yazılmaz. Ktor'un Logging plugin'i
 * kullanılmıyor; gerekirse `sanitizeHeader` ile eklenir.
 */
object ApiConfig {
    /**
     * Üretim API adresi.
     *
     * Not: Android emülatöründe `10.0.2.2` host makineyi gösterir.
     * Geliştirmede bu adres değiştirilir.
     */
    const val BASE_URL = "https://api.dugunce.com.tr/api/v1"
}

class ApiClient(
    private val baseUrl: String = ApiConfig.BASE_URL,
    private val tokenProvider: () -> String? = { null },
) {
    val json = Json {
        ignoreUnknownKeys = true   // API alan eklerse istemci kırılmasın
        isLenient = false
        explicitNulls = false
        encodeDefaults = true
    }

    val http: HttpClient = HttpClient {
        install(ContentNegotiation) {
            json(json)
        }

        defaultRequest {
            url(baseUrl.ensureTrailingSlash())
            contentType(ContentType.Application.Json)
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())

            tokenProvider()?.let { token ->
                header(HttpHeaders.Authorization, "Bearer $token")
            }
        }
    }

    private fun String.ensureTrailingSlash(): String =
        if (endsWith("/")) this else "$this/"
}
