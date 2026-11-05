package com.lumibyte.dugunce.ui

import com.lumibyte.dugunce.ui.nav.Screen
import com.lumibyte.dugunce.ui.nav.isOnboarding
import com.lumibyte.dugunce.ui.nav.isTab
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Navigasyon ve durum testleri.
 *
 * Brief §13: "Giriş/kayıt akışı", "boş durumlar".
 */
class AppStateTest {

    @Test
    fun `baslangic ekrani karsilama`() {
        val s = AppState()
        assertEquals(Screen.WELCOME, s.current)
    }

    @Test
    fun `ileri gidis yigina ekler`() {
        val s = AppState()
        s.go(Screen.LOGIN)
        assertEquals(Screen.LOGIN, s.current)
        s.go(Screen.CREATE_WEDDING)
        assertEquals(Screen.CREATE_WEDDING, s.current)
        assertEquals(3, s.stack.size)
    }

    @Test
    fun `ayni ekrana iki kez gitmez`() {
        val s = AppState()
        s.go(Screen.LOGIN)
        s.go(Screen.LOGIN)
        assertEquals(2, s.stack.size)
    }

    @Test
    fun `geri yigindan cikarir`() {
        val s = AppState()
        s.go(Screen.LOGIN)
        s.go(Screen.LINK_SENT)
        assertTrue(s.back())
        assertEquals(Screen.LOGIN, s.current)
        assertTrue(s.back())
        assertEquals(Screen.WELCOME, s.current)
        // Kökte geri false
        assertFalse(s.back())
    }

    @Test
    fun `sekme degistirme yigini sifirlar`() {
        val s = AppState()
        s.go(Screen.LOGIN)
        s.go(Screen.DASHBOARD)
        s.switchTab(Screen.BUDGET)
        assertEquals(Screen.BUDGET, s.current)
        assertEquals(1, s.stack.size)
    }

    @Test
    fun `resetTo koku degistirir`() {
        val s = AppState()
        s.go(Screen.LOGIN)
        s.go(Screen.LOGIN)
        s.resetTo(Screen.DASHBOARD)
        assertEquals(Screen.DASHBOARD, s.current)
        assertEquals(1, s.stack.size)
    }

    @Test
    fun `onboarding adimlari isaretli`() {
        assertTrue(Screen.WELCOME.isOnboarding())
        assertTrue(Screen.LOGIN.isOnboarding())
        assertTrue(Screen.CREATE_WEDDING.isOnboarding())
        assertTrue(Screen.FIRST_EXPENSE.isOnboarding())
        assertTrue(Screen.BUDGET_INTRO.isOnboarding())
        assertTrue(Screen.FIRST_GUEST.isOnboarding())
        assertTrue(Screen.ONBOARDING_DONE.isOnboarding())

        assertFalse(Screen.DASHBOARD.isOnboarding())
        assertFalse(Screen.BUDGET.isOnboarding())
    }

    @Test
    fun `ana sekmeler isaretli`() {
        assertTrue(Screen.DASHBOARD.isTab())
        assertTrue(Screen.BUDGET.isTab())
        assertTrue(Screen.GUESTS.isTab())
        assertTrue(Screen.TASKS.isTab())
        assertTrue(Screen.SETTINGS.isTab())

        assertFalse(Screen.EXPENSE_FORM.isTab())
        assertFalse(Screen.TASK_CHAT.isTab())
    }

    @Test
    fun `banner gosterilir ve temizlenir`() {
        val s = AppState()
        s.showBanner("İnternet yok")
        assertEquals("İnternet yok", s.banner?.text)
        assertTrue(s.banner!!.isError)
        s.clearBanner()
        assertEquals(null, s.banner)
    }

    @Test
    fun `secilen gorev ve davetli tutulur`() {
        val s = AppState()
        s.editingTaskId = "t1"
        s.editingGuestId = "g1"
        assertEquals("t1", s.editingTaskId)
        assertEquals("g1", s.editingGuestId)
    }
}

/**
 * `UiState` dönüşümü — her ekranın 4 durumu (brief §16.3).
 */
class UiStateTest {

    @Test
    fun `basari durumu`() {
        val r = Result.success(listOf("a"))
        val u = r.toUiState()
        assertTrue(u is UiState.Success)
        assertEquals(listOf("a"), (u as UiState.Success).data)
    }

    @Test
    fun `bos liste empty doner`() {
        val r = Result.success(emptyList<String>())
        val u = r.toUiState(emptyCheck = { it.isEmpty() }, emptyMessage = "Kayıt yok")
        assertTrue(u is UiState.Empty)
        assertEquals("Kayıt yok", (u as UiState.Empty).message)
    }

    @Test
    fun `hata durumu`() {
        val r = Result.failure<String>(RuntimeException("Ağ hatası"))
        val u = r.toUiState()
        assertTrue(u is UiState.Error)
        assertEquals("Ağ hatası", (u as UiState.Error).message)
    }

    @Test
    fun `bos liste kontrolu olmadan success`() {
        val r = Result.success(emptyList<String>())
        val u = r.toUiState()
        assertTrue(u is UiState.Success, "emptyCheck verilmezse boş liste de Success")
    }
}
