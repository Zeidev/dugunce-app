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
 * Oturum düşünce ne olur?
 *
 * BİLDİRİLEN HATA: "Belli bir süre gezindikten sonra kendi kendine
 * çevrimdışı oluyor, 'Oturum gerekli' uyarısı alıyorum. Uygulamayı
 * kapatıp açtığımda 'Düğünce açılıyor' yazısından sonra SİYAH EKRANDA
 * kalıyor, hiçbir şekilde açılmıyor."
 *
 * KÖK NEDEN: `onSessionExpired` varsayılan olarak BOŞ lambda. Token
 * düştüğünde hiçbir şey yapılmıyor — token'lar TEMİZLENMİYOR. Sonraki
 * açılışta `isLoggedIn` hâlâ true döner, `listWeddings` 401 alır,
 * `onFailure` panele düşer ama `wedding` null olduğu için hiçbir şey
 * çizilmez = siyah ekran.
 *
 * Bu testler o zinciri kilitler.
 */
class SessionExpiryTest {

    private fun jsonHeaders() = headersOf(HttpHeaders.ContentType, "application/json")

    private fun tokenStore(): TokenStore = TokenStore(MapSettings()).apply {
        accessToken = "suresi-dolmus"
        refreshToken = "gecersiz-refresh"
    }

    /**
     * Oturum tamamen düştüğünde token'lar TEMİZLENMELİ.
     *
     * Aksi halde `isLoggedIn` true kalır, açılış `listWeddings`'e gider,
     * o da 401 alır → siyah ekran. Temizlenirse kullanıcı onboarding'e
     * düşer ve yeniden giriş yapabilir — ÇIKIŞ YOLU olur.
     */
    @Test
    fun `oturum dusunce tokenlar temizlenir - siyah ekran cikis yolu`() = runTest {
        val tokens = tokenStore()
        var expiredCalled = false

        val engine = MockEngine { request ->
            if (request.url.encodedPath.endsWith("/auth/refresh")) {
                respondError(HttpStatusCode.Unauthorized)
            } else {
                respondError(HttpStatusCode.Unauthorized)
            }
        }
        val api = ApiClient(baseUrl = "https://test.local/api/v1", engine = engine)
        val repo = Repository(api, tokens) { expiredCalled = true }

        repo.listWeddings()

        assertTrue(expiredCalled, "onSessionExpired çağrılmalıydı")
        assertTrue(
            !tokens.isLoggedIn,
            "Oturum düştüğünde token'lar TEMİZLENMELİ — yoksa sonraki açılış siyah ekrana düşer",
        )
    }

    @Test
    fun `oturum dusunce kullaniciya bilgi verilir`() = runTest {
        val tokens = tokenStore()
        var expiredCalled = false

        val engine = MockEngine { respondError(HttpStatusCode.Unauthorized) }
        val api = ApiClient(baseUrl = "https://test.local/api/v1", engine = engine)
        val repo = Repository(api, tokens) { expiredCalled = true }

        repo.listWeddings()

        assertTrue(expiredCalled, "Kullanıcı oturumun düştüğünü bilmeli (sessiz kalınmamalı)")
    }

    /**
     * Ağ hatası oturum düşüklüğü DEĞİLDİR.
     *
     * Uçak modunda / bağlantı yokken token'lar SİLİNMEMELİ — yoksa
     * kullanıcı internet gelince yeniden giriş yapmak zorunda kalır.
     */
    @Test
    fun `ag hatasi oturumu silmez`() = runTest {
        val tokens = tokenStore()
        var expiredCalled = false

        val engine = MockEngine { throw RuntimeException("ağ yok") }
        val api = ApiClient(baseUrl = "https://test.local/api/v1", engine = engine)
        val repo = Repository(api, tokens) { expiredCalled = true }

        val result = repo.listWeddings()

        assertTrue(result.isFailure)
        assertTrue(!expiredCalled, "Ağ hatasında onSessionExpired çağrılmamalı")
        assertTrue(tokens.isLoggedIn, "Ağ hatasında token'lar korunmalı")
    }

    /**
     * Yenileme BAŞARILI olduğunda token'lar silinmemeli.
     */
    @Test
    fun `basarili yenilemede tokenlar korunur`() = runTest {
        val tokens = tokenStore()
        var expiredCalled = false
        var weddingCalls = 0

        val engine = MockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/auth/refresh") -> respond(
                    content = """{"accessToken":"yeni","refreshToken":"yeni-r"}""",
                    status = HttpStatusCode.OK,
                    headers = jsonHeaders(),
                )
                path.endsWith("/weddings") -> {
                    weddingCalls++
                    if (weddingCalls == 1) respondError(HttpStatusCode.Unauthorized)
                    else respond(
                        content = """{"weddings":[{"id":"w1","coupleNames":"A & B","weddingDate":"2026-09-12T19:00:00Z"}]}""",
                        status = HttpStatusCode.OK,
                        headers = jsonHeaders(),
                    )
                }
                else -> respondError(HttpStatusCode.NotFound)
            }
        }
        val api = ApiClient(baseUrl = "https://test.local/api/v1", engine = engine)
        val repo = Repository(api, tokens) { expiredCalled = true }

        val result = repo.listWeddings()

        assertTrue(result.isSuccess, "Yenileme başarılıysa istek başarılı olmalı")
        assertTrue(!expiredCalled, "Başarılı yenilemede oturum kapatılmamalı")
        assertEquals("yeni", tokens.accessToken)
        assertTrue(tokens.isLoggedIn)
    }
}
