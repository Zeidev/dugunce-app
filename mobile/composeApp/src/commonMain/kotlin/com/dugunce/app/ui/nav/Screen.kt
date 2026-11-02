package com.dugunce.app.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Uygulama ekranları.
 *
 * Tek kaynak: her ekran bu enum'da. Navigasyon yığını `List<Screen>`
 * olarak tutulur — KMP'de navigation-compose olmadığı için basit ve
 * test edilebilir bir yığın yeterli.
 */
enum class Screen {
    // Onboarding
    WELCOME,
    LOGIN,
    LINK_SENT,
    CREATE_WEDDING,
    FIRST_EXPENSE,
    BUDGET_INTRO,
    FIRST_GUEST,
    ONBOARDING_DONE,

    // Ana sekmeler
    DASHBOARD,
    BUDGET,
    GUESTS,
    TASKS,
    SETTINGS,

    // Bütçe alt ekranları
    EXPENSE_FORM,
    EXPENSE_DETAIL,
    INSTALLMENT_CALENDAR,

    // Davetli alt ekranları
    GUEST_FORM,
    GUEST_DETAIL,
    BULK_GUEST,

    // Görev alt ekranları
    TASK_FORM,
    TASK_DETAIL,
    TASK_CHAT,
    HELPER_LIST,
    HELPER_INVITE,
}

/** Alt sekme tanımı. */
data class TabSpec(
    val screen: Screen,
    val label: String,
    val icon: ImageVector,
)

/**
 * Alt navigasyon — 5 sekme.
 *
 * Brief §5.2: ana panel özet kartları. Bütçe/davetli/görev ana modüller.
 */
val MainTabs: List<TabSpec> = listOf(
    TabSpec(Screen.DASHBOARD, "Panel", Icons.Filled.Home),
    TabSpec(Screen.BUDGET, "Bütçe", Icons.Filled.AccountBalanceWallet),
    TabSpec(Screen.GUESTS, "Davetli", Icons.Filled.People),
    TabSpec(Screen.TASKS, "Görev", Icons.Filled.Checklist),
    TabSpec(Screen.SETTINGS, "Ayarlar", Icons.Filled.Settings),
)

/** Sekme mi? (alt çubuk görünürlüğü için) */
fun Screen.isTab(): Boolean = MainTabs.any { it.screen == this }

/** Onboarding ekranı mı? (alt çubuk gizlenir) */
fun Screen.isOnboarding(): Boolean = when (this) {
    Screen.WELCOME, Screen.LOGIN, Screen.LINK_SENT, Screen.CREATE_WEDDING,
    Screen.FIRST_EXPENSE, Screen.BUDGET_INTRO, Screen.FIRST_GUEST,
    Screen.ONBOARDING_DONE,
    -> true
    else -> false
}
