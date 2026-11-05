package com.lumibyte.dugunce.ui.nav

import com.lumibyte.dugunce.ui.icons.AppIcons
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
    /** Toplu davetiye gönderimi — her kişiye kendi linki. */
    BULK_SEND,
    /** Davetli ayarları — davetiye görünümü + kişi sayısı. */
    GUEST_SETTINGS,

    // Görev alt ekranları
    TASK_FORM,
    TASK_DETAIL,
    TASK_CHAT,
    HELPER_LIST,
    HELPER_INVITE,

    // Davet kodları (2. eş)
    CO_OWNER_INVITE,
    // ACCEPT_INVITE KALDIRILDI: davet kodu artık giriş sonrası başlangıç
    // ekranında (`CREATE_WEDDING` → KATIL modu) ve Ayarlar'da girilir.

    // Kart yönetimi (spec §6b.5)
    CARD_LIST,

    // Davetiye görünümü — şablon + font seçimi
    TEMPLATE,
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
    TabSpec(Screen.DASHBOARD, "Panel", AppIcons.Home),
    TabSpec(Screen.BUDGET, "Bütçe", AppIcons.AccountBalanceWallet),
    TabSpec(Screen.GUESTS, "Davetli", AppIcons.People),
    TabSpec(Screen.TASKS, "Görev", AppIcons.Checklist),
    TabSpec(Screen.SETTINGS, "Ayarlar", AppIcons.Settings),
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
