package com.dugunce.app.api

import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
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
 * başlığında taşınır (brief §15.1: mobil bearer).
 *
 * GÜVENLİK: Token ASLA log'a yazılmaz. Ktor'un Logging plugin'i
 * kullanılmıyor.
 *
 * `X-App-Version` her istekte gönderilir — API minimum sürümün altındaysa
 * `426 Upgrade Required` döner (spec §6b.9).
 */
object ApiConfig {
    /** Üretim API adresi. */
    const val BASE_URL = "https://api.dugunce.com.tr/api/v1"

    /** Uygulama sürümü — build.gradle ile elle senkron tutulur. */
    const val APP_VERSION = "0.1.0"
    const val APP_PLATFORM = "android"

    /** Bağlantı zaman aşımı — serv00 soğuk başlangıcı için cömert. */
    const val TIMEOUT_MS = 20_000L
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

        install(HttpTimeout) {
            requestTimeoutMillis = ApiConfig.TIMEOUT_MS
            connectTimeoutMillis = ApiConfig.TIMEOUT_MS
            socketTimeoutMillis = ApiConfig.TIMEOUT_MS
        }

        defaultRequest {
            url(baseUrl.ensureTrailingSlash())
            contentType(ContentType.Application.Json)
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            header("X-App-Version", ApiConfig.APP_VERSION)
            header("X-App-Platform", ApiConfig.APP_PLATFORM)

            tokenProvider()?.let { token ->
                header(HttpHeaders.Authorization, "Bearer $token")
            }
        }
    }

    private fun String.ensureTrailingSlash(): String =
        if (endsWith("/")) this else "$this/"
}
