package com.dugunce.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TokenStore
import com.dugunce.app.ui.AppState
import com.dugunce.app.ui.components.InfoBanner
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.nav.MainTabs
import com.dugunce.app.ui.nav.Screen
import com.dugunce.app.ui.nav.isTab
import com.dugunce.app.ui.screens.BudgetScreen
import com.dugunce.app.ui.screens.BudgetIntroScreen
import com.dugunce.app.ui.screens.BulkGuestScreen
import com.dugunce.app.ui.screens.CreateWeddingScreen
import com.dugunce.app.ui.screens.DashboardScreen
import com.dugunce.app.ui.screens.ExpenseDetailScreen
import com.dugunce.app.ui.screens.ExpenseFormScreen
import com.dugunce.app.ui.screens.FirstExpenseScreen
import com.dugunce.app.ui.screens.FirstGuestScreen
import com.dugunce.app.ui.screens.GuestFormScreen
import com.dugunce.app.ui.screens.GuestListScreen
import com.dugunce.app.ui.screens.HelperInviteScreen
import com.dugunce.app.ui.screens.HelperListScreen
import com.dugunce.app.ui.screens.InstallmentCalendarScreen
import com.dugunce.app.ui.screens.LinkSentScreen
import com.dugunce.app.ui.screens.LoginScreen
import com.dugunce.app.ui.screens.OnboardingDoneScreen
import com.dugunce.app.ui.screens.SettingsScreen
import com.dugunce.app.ui.screens.TaskChatScreen
import com.dugunce.app.ui.screens.TaskDetailScreen
import com.dugunce.app.ui.screens.TaskFormScreen
import com.dugunce.app.ui.screens.TaskListScreen
import com.dugunce.app.ui.screens.WelcomeScreen
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.ThemeMode
import kotlinx.coroutines.launch

/**
 * Uygulama giriş noktası.
 *
 * Navigasyon yığını `AppState` içinde; burada yalnızca ekran eşlemesi.
 * Her ekran kendi verisini yükler (brief §16.3: "ağ çağrılarını doğrudan
 * composable içine gömme" — burada repository üzerinden).
 */
@Composable
fun App(repository: Repository, tokens: TokenStore) {
    var themeMode by remember {
        mutableStateOf(
            when (tokens.themeMode) {
                "LIGHT" -> ThemeMode.LIGHT
                "DARK" -> ThemeMode.DARK
                else -> ThemeMode.SYSTEM
            },
        )
    }

    DugunceTheme(themeMode = themeMode) {
        val state = remember { AppState() }
        val scope = rememberCoroutineScope()
        var bootstrapping by remember { mutableStateOf(true) }
        var lastSentEmail by remember { mutableStateOf<String?>(null) }

        // Açılış: oturum varsa düğünü yükle, yoksa onboarding
        LaunchedEffect(Unit) {
            if (!tokens.isLoggedIn) {
                state.resetTo(Screen.WELCOME)
                bootstrapping = false
                return@LaunchedEffect
            }

            repository.listWeddings().fold(
                onSuccess = { weddings ->
                    val saved = tokens.selectedWeddingId
                    val wedding = weddings.find { it.id == saved } ?: weddings.firstOrNull()
                    if (wedding != null) {
                        state.wedding = wedding
                        tokens.selectedWeddingId = wedding.id
                        state.resetTo(Screen.DASHBOARD)
                    } else {
                        // Giriş var ama düğün yok → onboarding'in düğün adımı
                        state.resetTo(Screen.CREATE_WEDDING)
                    }
                },
                onFailure = {
                    // Ağ yoksa oturum varsa panele düş, ekran kendi hatasını gösterir
                    state.resetTo(if (tokens.isLoggedIn) Screen.DASHBOARD else Screen.WELCOME)
                },
            )
            bootstrapping = false
        }

        val c = DugunceTheme.colors

        if (bootstrapping) {
            Box(Modifier.fillMaxSize().background(c.cream)) {
                LoadingState(Modifier.fillMaxSize(), "Düğünce açılıyor…")
            }
            return@DugunceTheme
        }

        val wedding = state.wedding
        val screen = state.current
        val showBottomBar = screen.isTab() && wedding != null

        Scaffold(
            containerColor = c.cream,
            bottomBar = {
                if (showBottomBar) {
                    NavigationBar(containerColor = c.surface, tonalElevation = 0.dp()) {
                        MainTabs.forEach { tab ->
                            NavigationBarItem(
                                selected = screen == tab.screen,
                                onClick = { state.switchTab(tab.screen) },
                                icon = { Icon(tab.icon, contentDescription = tab.label) },
                                label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = c.sage,
                                    selectedTextColor = c.sage,
                                    indicatorColor = c.sageSoft,
                                    unselectedIconColor = c.muted,
                                    unselectedTextColor = c.muted,
                                ),
                            )
                        }
                    }
                }
            },
        ) { padding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .windowInsetsPadding(WindowInsets.statusBars),
            ) {
                state.banner?.let { b ->
                    InfoBanner(
                        text = b.text,
                        isError = b.isError,
                        onDismiss = { state.clearBanner() },
                        modifier = Modifier.padding(horizontal = 16.dp(), vertical = 8.dp()),
                    )
                }

                Box(Modifier.weight(1f)) {
                    when (screen) {
                        // --- Onboarding ---
                        Screen.WELCOME -> WelcomeScreen(
                            onDone = { state.go(Screen.LOGIN) },
                            onSkip = { state.go(Screen.LOGIN) },
                        )

                        Screen.LOGIN -> LoginScreen(
                            repository = repository,
                            onLinkSent = { state.go(Screen.LINK_SENT) },
                            onLoggedIn = {
                                scope.launch {
                                    val result = repository.listWeddings()
                                    val existing = result.getOrNull()?.firstOrNull()
                                    if (existing != null) {
                                        state.wedding = existing
                                        tokens.selectedWeddingId = existing.id
                                        state.resetTo(Screen.DASHBOARD)
                                    } else {
                                        state.resetTo(Screen.CREATE_WEDDING)
                                    }
                                }
                            },
                        )

                        Screen.LINK_SENT -> LinkSentScreen(
                            email = tokens.userEmail,
                            onBack = { state.back() },
                            onEnterCode = { state.resetTo(Screen.LOGIN) },
                        )

                        Screen.CREATE_WEDDING -> CreateWeddingScreen(
                            repository = repository,
                            onCreated = { w ->
                                state.wedding = w
                                tokens.selectedWeddingId = w.id
                                state.resetTo(Screen.FIRST_EXPENSE)
                            },
                        )

                        Screen.FIRST_EXPENSE -> wedding?.let { w ->
                            FirstExpenseScreen(
                                repository = repository,
                                weddingId = w.id,
                                onAdded = { state.go(Screen.BUDGET_INTRO) },
                            )
                        } ?: Unit

                        Screen.BUDGET_INTRO -> BudgetIntroScreen(
                            onContinue = { state.go(Screen.FIRST_GUEST) },
                        )

                        Screen.FIRST_GUEST -> wedding?.let { w ->
                            FirstGuestScreen(
                                repository = repository,
                                weddingId = w.id,
                                onContinue = { state.go(Screen.ONBOARDING_DONE) },
                            )
                        } ?: Unit

                        Screen.ONBOARDING_DONE -> OnboardingDoneScreen(
                            onStart = {
                                tokens.onboardingDone = true
                                state.resetTo(Screen.DASHBOARD)
                            },
                        )

                        // --- Sekmeler ---
                        Screen.DASHBOARD -> wedding?.let { w ->
                            DashboardScreen(
                                repository = repository,
                                wedding = w,
                                onNavigate = { state.go(it) },
                                onAddExpense = { state.go(Screen.EXPENSE_FORM) },
                                onAddGuest = { state.go(Screen.GUEST_FORM) },
                            )
                        } ?: Unit

                        Screen.BUDGET -> wedding?.let { w ->
                            BudgetScreen(
                                repository = repository,
                                weddingId = w.id,
                                onAddExpense = { state.editingExpenseId = null; state.go(Screen.EXPENSE_FORM) },
                                onOpenExpense = { id -> state.editingExpenseId = id; state.go(Screen.EXPENSE_DETAIL) },
                                onOpenCalendar = { state.go(Screen.INSTALLMENT_CALENDAR) },
                            )
                        } ?: Unit

                        Screen.GUESTS -> wedding?.let { w ->
                            GuestListScreen(
                                repository = repository,
                                weddingId = w.id,
                                onAddGuest = { state.editingGuestId = null; state.go(Screen.GUEST_FORM) },
                                onOpenGuest = { id -> state.editingGuestId = id; state.go(Screen.GUEST_DETAIL) },
                                onBulkAdd = { state.go(Screen.BULK_GUEST) },
                            )
                        } ?: Unit

                        Screen.TASKS -> wedding?.let { w ->
                            TaskListScreen(
                                repository = repository,
                                weddingId = w.id,
                                onAddTask = { state.editingTaskId = null; state.go(Screen.TASK_FORM) },
                                onOpenTask = { id -> state.selectedTask = null; state.editingTaskId = id; state.go(Screen.TASK_DETAIL) },
                                onOpenHelpers = { state.go(Screen.HELPER_LIST) },
                            )
                        } ?: Unit

                        Screen.SETTINGS -> wedding?.let { w ->
                            SettingsScreen(
                                repository = repository,
                                tokens = tokens,
                                wedding = w,
                                themeMode = themeMode,
                                onThemeChange = { mode ->
                                    themeMode = mode
                                    tokens.themeMode = when (mode) {
                                        ThemeMode.LIGHT -> "LIGHT"
                                        ThemeMode.DARK -> "DARK"
                                        ThemeMode.SYSTEM -> "SYSTEM"
                                    }
                                },
                                onLoggedOut = { state.resetTo(Screen.WELCOME) },
                            )
                        } ?: Unit

                        // --- Bütçe alt ---
                        Screen.EXPENSE_FORM -> wedding?.let { w ->
                            ExpenseFormScreen(
                                repository = repository,
                                weddingId = w.id,
                                expenseId = state.editingExpenseId,
                                onBack = { state.back() },
                                onSaved = { state.back() },
                            )
                        } ?: Unit

                        Screen.EXPENSE_DETAIL -> wedding?.let { w ->
                            state.editingExpenseId?.let { id ->
                                ExpenseDetailScreen(
                                    repository = repository,
                                    weddingId = w.id,
                                    expenseId = id,
                                    onBack = { state.back() },
                                    onEdit = { state.go(Screen.EXPENSE_FORM) },
                                    onDeleted = { state.back() },
                                )
                            }
                        } ?: Unit

                        Screen.INSTALLMENT_CALENDAR -> wedding?.let { w ->
                            InstallmentCalendarScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                            )
                        } ?: Unit

                        // --- Davetli alt ---
                        Screen.GUEST_FORM -> wedding?.let { w ->
                            GuestFormScreen(
                                repository = repository,
                                weddingId = w.id,
                                guestId = state.editingGuestId,
                                existing = null,
                                onBack = { state.back() },
                                onSaved = { state.back() },
                            )
                        } ?: Unit

                        Screen.GUEST_DETAIL -> wedding?.let { w ->
                            state.editingGuestId?.let { id ->
                                GuestDetailScreen(
                                    repository = repository,
                                    weddingId = w.id,
                                    guestId = id,
                                    onBack = { state.back() },
                                    onEdit = { state.go(Screen.GUEST_FORM) },
                                    onDeleted = { state.back() },
                                )
                            }
                        } ?: Unit

                        Screen.BULK_GUEST -> wedding?.let { w ->
                            BulkGuestScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                                onSaved = { state.back() },
                            )
                        } ?: Unit

                        // --- Görev alt ---
                        Screen.TASK_FORM -> wedding?.let { w ->
                            TaskFormScreen(
                                repository = repository,
                                weddingId = w.id,
                                taskId = state.editingTaskId,
                                existing = null,
                                helpers = emptyList(),
                                onBack = { state.back() },
                                onSaved = { state.back() },
                            )
                        } ?: Unit

                        Screen.TASK_DETAIL -> wedding?.let { w ->
                            state.editingTaskId?.let { id ->
                                TaskDetailScreen(
                                    repository = repository,
                                    weddingId = w.id,
                                    taskId = id,
                                    onBack = { state.back() },
                                    onEdit = { state.go(Screen.TASK_FORM) },
                                    onOpenChat = { state.go(Screen.TASK_CHAT) },
                                    onDeleted = { state.back() },
                                )
                            }
                        } ?: Unit

                        Screen.TASK_CHAT -> wedding?.let { w ->
                            state.editingTaskId?.let { id ->
                                TaskChatScreen(
                                    repository = repository,
                                    weddingId = w.id,
                                    taskId = id,
                                    onBack = { state.back() },
                                )
                            }
                        } ?: Unit

                        Screen.HELPER_LIST -> wedding?.let { w ->
                            HelperListScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                                onInvite = { state.go(Screen.HELPER_INVITE) },
                            )
                        } ?: Unit

                        Screen.HELPER_INVITE -> wedding?.let { w ->
                            HelperInviteScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                                onCreated = { state.createdHelperToken = it },
                            )
                        } ?: Unit
                    }
                }
            }
        }
    }
}

/** `16.dp` kısayolu — import kalabalığını azaltır. */
private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())
