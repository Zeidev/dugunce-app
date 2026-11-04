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
import com.dugunce.app.ui.nav.isOnboarding
import com.dugunce.app.ui.PlatformBackHandler
import com.dugunce.app.ui.nav.MainTabs
import com.dugunce.app.ui.nav.Screen
import com.dugunce.app.ui.nav.isTab
import com.dugunce.app.ui.screens.BudgetScreen
import com.dugunce.app.ui.screens.CardListScreen
import com.dugunce.app.ui.screens.TemplateScreen
import com.dugunce.app.ui.screens.BudgetIntroScreen
import com.dugunce.app.ui.screens.BulkGuestScreen
import com.dugunce.app.ui.screens.BulkSendScreen
import com.dugunce.app.ui.screens.AcceptInviteScreen
import com.dugunce.app.ui.screens.CoOwnerInviteScreen
import com.dugunce.app.ui.screens.CreateWeddingScreen
import com.dugunce.app.ui.screens.DashboardScreen
import com.dugunce.app.ui.screens.ExpenseDetailScreen
import com.dugunce.app.ui.screens.ExpenseFormScreen
import com.dugunce.app.ui.screens.FirstExpenseScreen
import com.dugunce.app.ui.screens.FirstGuestScreen
import com.dugunce.app.ui.screens.GuestDetailScreen
import com.dugunce.app.ui.screens.GuestFormScreen
import com.dugunce.app.ui.screens.GuestListScreen
import com.dugunce.app.ui.screens.GuestSettingsScreen
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
fun App(
    repository: Repository,
    tokens: TokenStore,
    initialAuthToken: String? = null,
    initialInviteCode: String? = null,
    onDeepLinkConsumed: () -> Unit = {},
    /**
     * Baslik serif fontu (Playfair Display). Platformdan gelir -
     * `MainActivity` `R.font.playfair_display` gecer. `null` = sistem fontu.
     */
    displayFont: androidx.compose.ui.text.font.FontFamily? = null,
    /** Govde sans fontu (Josefin Sans). */
    bodyFont: androidx.compose.ui.text.font.FontFamily? = null,
) {
    var themeMode by remember {
        mutableStateOf(
            when (tokens.themeMode) {
                "LIGHT" -> ThemeMode.LIGHT
                "DARK" -> ThemeMode.DARK
                else -> ThemeMode.SYSTEM
            },
        )
    }

    DugunceTheme(themeMode = themeMode, displayFont = displayFont, bodyFont = bodyFont) {
        val state = remember { AppState() }
        val scope = rememberCoroutineScope()
        var bootstrapping by remember { mutableStateOf(true) }
        var lastSentEmail by remember { mutableStateOf<String?>(null) }

        // Deep link — magic link veya davet kodu (DEEPLINK-SETUP.md)
        LaunchedEffect(initialAuthToken, initialInviteCode) {
            when {
                initialAuthToken != null -> {
                    repository.verify(initialAuthToken).fold(
                        onSuccess = {
                            val w = repository.listWeddings().getOrNull()?.firstOrNull()
                            if (w != null) {
                                state.wedding = w
                                tokens.selectedWeddingId = w.id
                                state.resetTo(Screen.DASHBOARD)
                            } else {
                                state.resetTo(Screen.CREATE_WEDDING)
                            }
                        },
                        onFailure = { state.showBanner("Bağlantı geçersiz veya süresi dolmuş") },
                    )
                    onDeepLinkConsumed()
                }
                initialInviteCode != null -> {
                    state.resetTo(Screen.ACCEPT_INVITE)
                    onDeepLinkConsumed()
                }
            }
        }

        // Oturum düştüğünde kullanıcıya bildir ve girişe düş.
        //
        // `Repository.onSessionExpired` varsayılan olarak boş lambda;
        // bağlanmazsa token düşer, kullanıcı hiçbir şey görmez, sonraki
        // açılış siyah ekrana düşer (bildirilen hata).
        LaunchedEffect(Unit) {
            repository.installSessionExpiredHandler {
                state.wedding = null
                state.showBanner(
                    "Oturumunuz sona erdi. Lütfen yeniden giriş yapın.",
                    isError = true,
                )
                state.resetTo(Screen.LOGIN)
            }
        }

        /**
         * Tanıtım yalnız İLK AÇILIŞTA gösterilir.
         *
         * `onboardingDone` bayrağı vardı ama HİÇ OKUNMUYORDU — yalnız
         * yazılıyordu. Bu yüzden oturum düştükçe tanıtım sayfası her
         * seferinde tekrar çıkıyordu (bildirilen hata).
         *
         * Bittiyse doğrudan giriş ekranına gidilir.
         */
        fun startScreen(): Screen =
            if (tokens.onboardingDone) Screen.LOGIN else Screen.WELCOME

        // Açılış: oturum varsa düğünü yükle, yoksa onboarding
        LaunchedEffect(Unit) {
            if (!tokens.isLoggedIn) {
                state.resetTo(startScreen())
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
                    // DİKKAT: `wedding` hâlâ null. Panele düşersek
                    // `Screen.DASHBOARD -> wedding?.let { … } ?: Unit`
                    // HİÇBİR ŞEY çizmez = SİYAH EKRAN (bildirilen hata).
                    //
                    // Oturum düştüyse (token'lar temizlendiyse) kullanıcı
                    // onboarding'e düşer ve yeniden giriş yapabilir.
                    // Oturum duruyorsa (ağ hatası) panele düşeriz; o
                    // zaman önbellekteki düğünü yükleyip ekranı çizeriz.
                    if (!tokens.isLoggedIn) {
                        state.wedding = null
                        state.resetTo(startScreen())
                        return@fold
                    }
                    val cached = repository.cachedWedding()
                    if (cached != null) {
                        state.wedding = cached
                        state.resetTo(Screen.DASHBOARD)
                    } else {
                        // Hiçbir veri yok — kullanıcıya sebep göster.
                        state.showBanner(
                            "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
                            isError = true,
                        )
                        state.resetTo(startScreen())
                    }
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
        // Alt navigasyon onboarding ve giriş dışında HER ZAMAN görünür.
        // Önce yalnız `isTab()` iken gösteriliyordu; alt ekrana girince
        // (harcama formu, görev detayı, şablon seçimi…) bar kayboluyordu.
        val showBottomBar = wedding != null && !screen.isOnboarding()

        // Telefonun kendi geri tuşu: yığın varsa bir önceki ekran,
        // yığın boşsa sistem davranışı (uygulamadan çık).
        // `isOnboarding()` dışında hiçbir ekran geri tuşunu yutmasın.
        PlatformBackHandler(enabled = state.stack.size > 1) {
            state.back()
        }

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
                            // Tanıtım BİR KEZ görülsün: devam da atla da
                            // bayrağı set eder, bir daha çıkmaz.
                            onDone = {
                                tokens.onboardingDone = true
                                state.go(Screen.LOGIN)
                            },
                            onSkip = {
                                tokens.onboardingDone = true
                                state.go(Screen.LOGIN)
                            },
                        )

                        Screen.LOGIN -> LoginScreen(
                            repository = repository,
                            startWithCode = state.showCodeEntry,
                            onHasInviteCode = { state.go(Screen.ACCEPT_INVITE) },
                            onLinkSent = { state.go(Screen.LINK_SENT) },
                            onLoggedIn = {
                                // Kod modu bir sonraki açılışta takılı kalmasın
                                state.showCodeEntry = false
                                scope.launch {
                                    val result = repository.listWeddings()

                                    // HATA ile BOŞ LİSTE aynı şey değil.
                                    //
                                    // Bildirilen hata: "mail ile giriş
                                    // yaptığımda yeni bir düğün oluşturma
                                    // ekranı geliyor." Sebep: `getOrNull()`
                                    // hata durumunda da null dönüyordu, kod
                                    // bunu "düğünü yok" sanıp CREATE_WEDDING'e
                                    // düşürüyordu. Kullanıcının düğünü VARDI.
                                    val weddings = result.getOrNull()
                                    if (weddings == null) {
                                        // Ağ/oturum hatası — kullanıcıyı yanlış
                                        // ekrana gönderme, girişte tut.
                                        state.showBanner(
                                            "Düğünlerin yüklenemedi. Bağlantını kontrol edip " +
                                                "tekrar giriş yap.",
                                            isError = true,
                                        )
                                        state.resetTo(Screen.LOGIN)
                                        return@launch
                                    }

                                    val existing = weddings.firstOrNull()
                                    if (existing != null) {
                                        state.wedding = existing
                                        tokens.selectedWeddingId = existing.id
                                        state.resetTo(Screen.DASHBOARD)
                                    } else {
                                        // Gerçekten düğünü yok — ilk kurulum.
                                        state.resetTo(Screen.CREATE_WEDDING)
                                    }
                                }
                            },
                        )

                        Screen.LINK_SENT -> LinkSentScreen(
                            email = tokens.userEmail,
                            onBack = { state.back() },
                            // Bildirilen hata: burada `resetTo(LOGIN)` yapınca
                            // kullanıcı e-posta alanına geri düşüyordu.
                            // Artık kod modunda açılıyor.
                            onEnterCode = {
                                state.resetTo(Screen.LOGIN)
                                state.showCodeEntry = true
                            },
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
                                onOpenSettings = { state.go(Screen.GUEST_SETTINGS) },
                                onBulkSend = { state.go(Screen.BULK_SEND) },
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
                                onLoggedOut = { state.resetTo(startScreen()) },
                                onInviteCoOwner = { state.go(Screen.CO_OWNER_INVITE) },
                                onOpenCards = { state.go(Screen.CARD_LIST) },
                                onOpenTemplates = { state.go(Screen.TEMPLATE) },
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
                                    partySizeEnabled = w.partySizeEnabled,
                                    defaultPartySize = w.defaultPartySize,
                                    maxPartySize = w.maxPartySize,
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

                        Screen.BULK_SEND -> wedding?.let { w ->
                            BulkSendScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                            )
                        } ?: Unit

                        // --- Görev alt ---
                        Screen.TASK_FORM -> wedding?.let { w ->
                            TaskFormScreen(
                                repository = repository,
                                weddingId = w.id,
                                taskId = state.editingTaskId,
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

                        Screen.CO_OWNER_INVITE -> wedding?.let { w ->
                            CoOwnerInviteScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                            )
                        } ?: Unit

                        Screen.CARD_LIST -> wedding?.let { w ->
                            CardListScreen(
                                repository = repository,
                                weddingId = w.id,
                                onBack = { state.back() },
                            )
                        } ?: Unit

                        Screen.GUEST_SETTINGS -> wedding?.let { w ->
                            GuestSettingsScreen(
                                wedding = w,
                                repository = repository,
                                onBack = { state.back() },
                                onOpenTemplates = { state.go(Screen.TEMPLATE) },
                                onSaved = { updated -> state.wedding = updated },
                            )
                        } ?: Unit

                        Screen.TEMPLATE -> wedding?.let { w ->
                            TemplateScreen(
                                wedding = w,
                                repository = repository,
                                onBack = { state.back() },
                                onSaved = { updated -> state.wedding = updated },
                            )
                        } ?: Unit

                        Screen.ACCEPT_INVITE -> AcceptInviteScreen(
                            repository = repository,
                            onBack = { state.back() },
                            onJoined = {
                                scope.launch {
                                    repository.listWeddings().onSuccess { weddings ->
                                        weddings.firstOrNull()?.let { w ->
                                            state.wedding = w
                                            tokens.selectedWeddingId = w.id
                                        }
                                    }
                                    state.resetTo(Screen.DASHBOARD)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/** `16.dp` kısayolu — import kalabalığını azaltır. */
private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())
