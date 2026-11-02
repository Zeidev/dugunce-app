package com.dugunce.app.ui

import com.dugunce.app.api.ApiException
import com.dugunce.app.api.NetworkException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Ağ kesintisi ve tekrar deneme — brief §13.
 *
 * Kural: ağ hatası sessizce yutulmaz; kullanıcıya anlaşılır Türkçe mesaj
 * gösterilir ve "tekrar dene" sunulur (brief §16.3).
 */
class NetworkFailureTest {

    @Test
    fun `ag hatasi error durumuna donusur`() {
        val r = Result.failure<List<String>>(NetworkException("Bağlantı kurulamadı"))
        val u = r.toUiState()
        assertTrue(u is UiState.Error)
        assertEquals("Bağlantı kurulamadı", (u as UiState.Error).message)
    }

    @Test
    fun `limit hatasi kullaniciya limit mesajini gosterir`() {
        val e = ApiException(422, "LIMIT_REACHED", "En fazla 30 davetli ekleyebilirsiniz")
        val u = Result.failure<List<String>>(e).toUiState()
        assertTrue(u is UiState.Error)
        assertEquals("En fazla 30 davetli ekleyebilirsiniz", (u as UiState.Error).message)
    }

    @Test
    fun `mesaji olmayan hata icin varsayilan metin`() {
        val r = Result.failure<List<String>>(RuntimeException())
        val u = r.toUiState()
        assertTrue(u is UiState.Error)
        assertEquals("Bir hata oluştu", (u as UiState.Error).message)
    }

    @Test
    fun `bos sonuc empty doner ve tekrar deneme sunulur`() {
        val u = Result.success(emptyList<String>())
            .toUiState(emptyCheck = { it.isEmpty() }, emptyMessage = "Henüz kayıt yok")
        assertTrue(u is UiState.Empty)
        assertEquals("Henüz kayıt yok", (u as UiState.Empty).message)
    }

    @Test
    fun `basarili sonuc veriyi tasir`() {
        val u = Result.success(listOf("a", "b")).toUiState()
        assertTrue(u is UiState.Success)
        assertEquals(listOf("a", "b"), (u as UiState.Success).data)
    }

    @Test
    fun `yukleniyor durumu baslangicta`() {
        val s: UiState<String> = UiState.Loading
        assertTrue(s is UiState.Loading)
    }

    @Test
    fun `dort durum birbirinden ayri`() {
        // Brief §16.3: her ekranın loading, empty, error, success durumu olmalı
        val states: List<UiState<*>> = listOf(
            UiState.Loading,
            UiState.Success("x"),
            UiState.Empty("boş"),
            UiState.Error("hata"),
        )
        assertEquals(4, states.map { it::class.simpleName }.toSet().size)
    }
}
