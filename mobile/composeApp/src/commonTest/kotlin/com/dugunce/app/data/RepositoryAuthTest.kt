package com.dugunce.app.data

import com.dugunce.app.api.ApiClient
import com.russhwolf.settings.MapSettings
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * `Repository` — 401 ve token yenileme davranışı.
 *
 * NEDEN BU TEST:
 * Uygulama açılışta beyaz ekran veriyordu. Kök neden: `ensureSuccess`
 * 401 görünce token'ı yeniliyor ama ardından **her durumda** hata
 * fırlatıyordu — yenileme başarılı olsa bile. Bu yüzden `listWeddings()`
 * asla başarılı olamıyor, açılış `onFailure` dalına düşüyor, `wedding`
 * null kalıyor ve `DashboardScreen` hiç çizilmiyordu (beyaz ekran).
 *
 * Bu testler o davranışı kilitler.
 */
class RepositoryAuthTest {

    private val weddingsJson = """
        {"weddings":[{"id":"w1","coupleNames":"A & B","weddingDate":"2026-09-12T19:00:00Z"}]}
    """.trimIndent()

    private val refreshJson = """
        {"accessToken":"yeni-access","refreshToken":"yeni-refresh"}
    """.trimIndent()

    private fun jsonHeaders() = headersOf(HttpHeaders.ContentType, "application/json")

    /** İlk istek 401, token yenileme ve sonraki istek 200 döner. */
    private fun engine401Then200(): MockEngine {
        var weddingCalls = 0
        return MockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/auth/refresh") -> respond(
                    content = refreshJson,
                    status = HttpStatusCode.OK,
                    headers = jsonHeaders(),
                )
                path.endsWith("/weddings") -> {
                    weddingCalls++
                    if (weddingCalls == 1) {
                        respondError(HttpStatusCode.Unauthorized)
                    } else {
                        respond(content = weddingsJson, status = HttpStatusCode.OK, headers = jsonHeaders())
                    }
                }
                else -> respondError(HttpStatusCode.NotFound)
            }
        }
    }

    private fun repository(engine: MockEngine, tokens: TokenStore): Repository {
        val api = ApiClient(baseUrl = "https://test.local/api/v1", engine = engine)
        return Repository(api, tokens)
    }

    private fun tokenStore(): TokenStore = TokenStore(MapSettings()).apply {
        accessToken = "eski-access"
        refreshToken = "eski-refresh"
    }

    // -----------------------------------------------------------------------
    // ensureSuccess — 401 sonrası yenileme başarılıysa HATA FIRLATMAMALI
    // -----------------------------------------------------------------------

    @Test
    fun `401 alip token yenilenince istek tekrar denenir ve basarili olur`() = runTest {
        val tokens = tokenStore()
        val repo = repository(engine401Then200(), tokens)

        val result = repo.listWeddings()

        assertTrue(
            result.isSuccess,
            "Token yenilendiği hâlde istek başarısız sayıldı: ${result.exceptionOrNull()}",
        )
        assertEquals("w1", result.getOrThrow().first().id)
        // Yenilenen token kaydedilmiş olmalı
        assertEquals("yeni-access", tokens.accessToken)
    }

    /**
     * Açılış akışının özü: `listWeddings()` başarılı olmalı ki
     * `App` `onSuccess` dalına düşsün ve `state.wedding` dolsun.
     */
    @Test
    fun `acilista dugun listesi yuklenebilir - beyaz ekran regresyonu`() = runTest {
        val tokens = tokenStore()
        val repo = repository(engine401Then200(), tokens)

        val weddings = repo.listWeddings().getOrNull()

        assertTrue(
            weddings != null && weddings.isNotEmpty(),
            "Açılışta düğün yüklenemedi — App onFailure'a düşer, wedding null kalır, ekran boş çizilir",
        )
    }

    @Test
    fun `refresh de basarisizsa hata doner`() = runTest {
        val tokens = tokenStore()
        val engine = MockEngine { request ->
            if (request.url.encodedPath.endsWith("/auth/refresh")) {
                respondError(HttpStatusCode.Unauthorized)
            } else {
                respondError(HttpStatusCode.Unauthorized)
            }
        }
        val repo = repository(engine, tokens)

        val result = repo.listWeddings()

        assertTrue(result.isFailure, "Yenileme de başarısızken istek başarılı sayılmamalı")
    }

    @Test
    fun `basarili istekte token yenilenmez`() = runTest {
        val tokens = tokenStore()
        var refreshCalls = 0
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("/auth/refresh") -> {
                    refreshCalls++
                    respond(content = refreshJson, status = HttpStatusCode.OK, headers = jsonHeaders())
                }
                else -> respond(content = weddingsJson, status = HttpStatusCode.OK, headers = jsonHeaders())
            }
        }
        val repo = repository(engine, tokens)

        assertTrue(repo.listWeddings().isSuccess)
        assertEquals(0, refreshCalls, "2xx yanıtta token yenilenmemeli")
    }

    // -----------------------------------------------------------------------
    // sendRetrying — 401 → yenile → TEKRAR DENE (tek nokta)
    //
    // Bu davranış `Repository`'nin 40+ çağrı yerinin tamamını kapsar.
    // Bozulursa her istek 401'de başarısız olur ve ekranlar boş kalır.
    // -----------------------------------------------------------------------

    @Test
    fun `sendRetrying 401 alinca yeniler ve istegi TEKRAR gonderir`() = runTest {
        val tokens = tokenStore()
        var protectedCalls = 0
        var refreshCalls = 0
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("/auth/refresh") -> {
                    refreshCalls++
                    respond(content = refreshJson, status = HttpStatusCode.OK, headers = jsonHeaders())
                }
                else -> {
                    protectedCalls++
                    if (protectedCalls == 1) respondError(HttpStatusCode.Unauthorized)
                    else respond(content = weddingsJson, status = HttpStatusCode.OK, headers = jsonHeaders())
                }
            }
        }
        val repo = repository(engine, tokens)
        repo.listWeddings()

        // İstek iki kez gönderilmiş olmalı: ilk 401, ikincisi başarılı.
        assertEquals(2, protectedCalls, "401 sonrası istek TEKRAR gönderilmeliydi")
        assertEquals(1, refreshCalls, "Token bir kez yenilenmeli")
    }

    /**
     * SONSUZ ÖZYİNELEME REGRESYONU.
     *
     * `refresh()` kendi içinde `ensureSuccess` çağırırsa ve yenileme
     * ucu da 401 dönerse: 401 → refresh → 401 → refresh … sonsuz döngü
     * = StackOverflowError = uygulama açılışta çöker.
     *
     * Bu testin SONLANMASI tek başına kanıttır.
     */
    @Test
    fun `refresh 401 alinca sonsuz ozyinelemeye girmez`() = runTest {
        val tokens = tokenStore()
        var refreshCalls = 0
        val engine = MockEngine { request ->
            if (request.url.encodedPath.endsWith("/auth/refresh")) {
                refreshCalls++
                // Sonsuz döngü olsaydı bu sayaç binlere çıkardı.
                if (refreshCalls > 5) error("Sonsuz özyineleme: refresh ${refreshCalls} kez çağrıldı")
                respondError(HttpStatusCode.Unauthorized)
            } else {
                respondError(HttpStatusCode.Unauthorized)
            }
        }
        val repo = repository(engine, tokens)

        val result = repo.listWeddings()

        assertTrue(result.isFailure, "Yenileme başarısızken istek başarılı sayılmamalı")
        assertTrue(refreshCalls <= 2, "refresh en fazla birkaç kez çağrılmalı, $refreshCalls kez çağrıldı")
    }
}
