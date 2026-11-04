package com.dugunce.app.data

import com.dugunce.app.api.ApiClient
import com.russhwolf.settings.MapSettings
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * `patchWedding` — davetiye görünümü kaydetme, UÇTAN UCA (mobil kodu).
 *
 * NEDEN BU TEST:
 * Kullanıcı şablon seçip "Kaydet"e bastığında "beklenmeyen bir hata
 * oluştu" görüyor. Bu mesaj `toApiException`'ın UNKNOWN dalından gelir:
 * ya yanıt gövdesi okunamıyor ya da beklenen şekilde değil.
 *
 * Burada GERÇEK `Repository.patchWedding` çağrılır ve:
 *  - giden gövde doğru mu (yalnız template + fontKey, null'lar yok)
 *  - 200 yanıtı parse edilebiliyor mu
 *  - 400 yanıtında kullanıcıya anlamlı mesaj gidiyor mu
 * doğrulanır.
 */
class TemplateSaveTest {

    private val weddingJson = """
        {"wedding":{
          "id":"w1",
          "coupleNames":"A & B",
          "weddingDate":"2026-09-12T19:00:00Z",
          "timezone":"Europe/Istanbul",
          "plan":"FREE",
          "status":"ACTIVE",
          "template":"GECE",
          "fontKey":"BODONI"
        }}
    """.trimIndent()

    private fun jsonHeaders() = headersOf(HttpHeaders.ContentType, "application/json")

    private fun repo(engine: MockEngine): Repository {
        val tokens = TokenStore(MapSettings()).apply {
            accessToken = "a"
            refreshToken = "r"
        }
        return Repository(ApiClient(baseUrl = "https://test.local/api/v1", engine = engine), tokens)
    }

    @Test
    fun `sablon kaydetme govdesi yalniz template ve fontKey icerir`() = runTest {
        var sentBody: String? = null
        val engine = MockEngine { request ->
            sentBody = (request.body as? io.ktor.http.content.TextContent)?.text
            respond(content = weddingJson, status = HttpStatusCode.OK, headers = jsonHeaders())
        }

        val result = repo(engine).patchWedding("w1", WeddingPatchRequest(template = "GECE", fontKey = "BODONI"))

        assertTrue(result.isSuccess, "Kaydetme başarısız: ${result.exceptionOrNull()}")
        val body = sentBody ?: error("gövde yakalanamadı")
        // Null alanlar GİTMEMELİ (backend partial şema)
        assertTrue(!body.contains("null"), "Gövdede null var: $body")
        assertTrue(body.contains("\"template\""), "template yok: $body")
        assertTrue(body.contains("\"fontKey\""), "fontKey yok: $body")
    }

    @Test
    fun `200 yaniti WeddingDto olarak parse edilir`() = runTest {
        val engine = MockEngine {
            respond(content = weddingJson, status = HttpStatusCode.OK, headers = jsonHeaders())
        }

        val result = repo(engine).patchWedding("w1", WeddingPatchRequest(template = "GECE"))

        val saved = result.getOrNull()
        assertTrue(saved != null, "Yanıt parse edilemedi: ${result.exceptionOrNull()}")
        assertEquals("GECE", saved.template)
        assertEquals("BODONI", saved.fontKey)
    }

    @Test
    fun `400 yanitinda kullaniciya anlamli mesaj gider`() = runTest {
        val errorJson = """
            {"error":{"code":"VALIDATION_ERROR","message":"Gönderilen veri geçersiz",
             "details":{"fields":[{"path":"template","message":"Geçersiz şablon"}]}}}
        """.trimIndent()
        val engine = MockEngine {
            respond(content = errorJson, status = HttpStatusCode.BadRequest, headers = jsonHeaders())
        }

        val result = repo(engine).patchWedding("w1", WeddingPatchRequest(template = "YOK"))

        assertTrue(result.isFailure)
        val msg = result.exceptionOrNull()?.message ?: ""
        assertTrue(
            !msg.contains("Beklenmeyen bir hata"),
            "Genel hata mesajı gösterildi — gerçek sebep kayboldu: $msg",
        )
    }
}
