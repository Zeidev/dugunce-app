package com.lumibyte.dugunce.api

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.statement.HttpResponse
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
    /**
     * HTTP motoru. `null` = platform varsayılanı (OkHttp / Darwin).
     *
     * Testler `MockEngine` enjekte ederek gerçek ağa çıkmadan
     * 401 / token yenileme gibi akışları sınar.
     */
    engine: HttpClientEngine? = null,
) {
    val json = Json {
        ignoreUnknownKeys = true   // API alan eklerse istemci kırılmasın
        isLenient = false
        explicitNulls = false
        encodeDefaults = true
    }

    val http: HttpClient = if (engine != null) HttpClient(engine) { configure() } else HttpClient { configure() }

    /**
     * 401 → token yenile → isteği BİR KEZ tekrar dene.
     *
     * NEDEN BURADA:
     * 40'tan fazla çağrı yeri var. Her birinde retry yazmak yerine tek
     * noktada yapılır; biri unutulduğunda 401 gövdesi başarı sanılır ve
     * ekran boş kalır. Yenileme başarısızsa orijinal 401 yanıtı döner —
     * veri katmanı onu hataya çevirir.
     *
     * `refreshBlock` çağıran taraftan gelir (veri katmanı) —
     * ApiClient token saklamaz.
     */
    private var refreshBlock: (suspend () -> Boolean)? = null

    fun installAuthRetry(block: suspend () -> Boolean) {
        refreshBlock = block
    }

    /**
     * İsteği gönderir; 401 alırsa `refreshBlock` ile token yenileyip
     * bir kez tekrar dener.
     *
     * `/auth/refresh` isteğinin KENDİSİ bu yola girmez — yoksa sonsuz
     * özyineleme olur (401 → refresh → 401 → refresh …).
     */
    suspend fun sendRetrying(block: suspend () -> HttpResponse): HttpResponse {
        val res = block()
        if (res.status.value != 401) return res

        val refresher = refreshBlock ?: return res
        if (!refresher()) return res

        // Yanıt gövdesi okunmadan bırakılır — Ktor bağlantıyı kendisi
        // yönetir, elle iptal gerekmez (ve `cancel` imzası sürümler
        // arasında değişiyor).
        return block()
    }

    private fun HttpClientConfig<*>.configure() {
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
