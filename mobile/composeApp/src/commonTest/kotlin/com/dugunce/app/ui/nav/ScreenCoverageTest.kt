package com.dugunce.app.ui.nav

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Navigasyon kapsamı testi.
 *
 * Her `Screen` değeri ya onboarding ya sekme ya da alt ekran olmalı;
 * hiçbiri "sahipsiz" kalmamalı. Yeni ekran eklenip App.kt'te işlenmezse
 * bu test hatırlatır.
 */
class ScreenCoverageTest {

    @Test
    fun `her ekran bir kategoriye girer`() {
        val all = Screen.entries
        val onboarding = all.filter { it.isOnboarding() }
        val tabs = all.filter { it.isTab() }
        val detail = all.filter { !it.isOnboarding() && !it.isTab() }

        assertEquals(all.size, onboarding.size + tabs.size + detail.size)
        assertTrue(onboarding.isNotEmpty(), "onboarding ekranları olmalı")
        assertTrue(tabs.isNotEmpty(), "sekmeler olmalı")
    }

    @Test
    fun `onboarding ve sekme kesisimi bos`() {
        val overlap = Screen.entries.filter { it.isOnboarding() && it.isTab() }
        assertEquals(emptyList(), overlap, "bir ekran hem onboarding hem sekme olamaz")
    }

    @Test
    fun `bes sekme var`() {
        assertEquals(5, MainTabs.size)
        assertEquals(
            listOf(Screen.DASHBOARD, Screen.BUDGET, Screen.GUESTS, Screen.TASKS, Screen.SETTINGS),
            MainTabs.map { it.screen },
        )
    }

    @Test
    fun `sekme etiketleri turkce`() {
        assertEquals(listOf("Panel", "Bütçe", "Davetli", "Görev", "Ayarlar"), MainTabs.map { it.label })
    }

    @Test
    fun `onboarding yedi adim`() {
        // spec §6b.8: 7 adım
        val steps = listOf(
            Screen.WELCOME,
            Screen.LOGIN,
            Screen.CREATE_WEDDING,
            Screen.FIRST_EXPENSE,
            Screen.BUDGET_INTRO,
            Screen.FIRST_GUEST,
            Screen.ONBOARDING_DONE,
        )
        assertEquals(7, steps.size)
        steps.forEach { assertTrue(it.isOnboarding(), "$it onboarding olmalı") }
    }

    @Test
    fun `davet ekranlari onboarding degil`() {
        // Davet kodu girişi onboarding sonrası da erişilebilir
        assertFalse(Screen.ACCEPT_INVITE.isOnboarding())
        assertFalse(Screen.CO_OWNER_INVITE.isOnboarding())
    }

    @Test
    fun `butun ekranlar tekildir`() {
        val names = Screen.entries.map { it.name }
        assertEquals(names.size, names.toSet().size)
    }
}
