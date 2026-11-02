package com.dugunce.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TokenStore
import com.dugunce.app.ui.screens.BudgetScreen
import com.dugunce.app.ui.screens.GuestsScreen
import com.dugunce.app.ui.screens.LoginScreen
import com.dugunce.app.ui.screens.TasksScreen
import com.dugunce.app.ui.theme.DugunceColors
import com.dugunce.app.ui.theme.DugunceTheme

/** Uygulama durumu — basit, tek kaynak. */
enum class Screen { LOGIN, LINK_SENT, BUDGET, GUESTS, TASKS }

@Composable
fun App(repository: Repository, tokens: TokenStore) {
    DugunceTheme {
        var screen by remember {
            mutableStateOf(if (tokens.isLoggedIn) Screen.BUDGET else Screen.LOGIN)
        }
        var weddingId by remember { mutableStateOf<String?>(null) }
        var loadingWedding by remember { mutableStateOf(tokens.isLoggedIn) }

        // Giriş yapılmışsa düğünü yükle
        LaunchedEffect(screen, tokens.isLoggedIn) {
            if (tokens.isLoggedIn && weddingId == null) {
                loadingWedding = true
                val result = repository.listWeddings()
                weddingId = result.getOrNull()?.firstOrNull()?.id
                loadingWedding = false
                if (weddingId == null) {
                    // Düğün yok — v1'de onboarding ekranı yerine
                    // basitçe bütçe ekranında kal (boş görünür)
                }
            }
        }

        when {
            screen == Screen.LOGIN -> LoginScreen(
                repository = repository,
                onLinkSent = { screen = Screen.LINK_SENT },
                onLoggedIn = { screen = Screen.BUDGET },
            )

            screen == Screen.LINK_SENT -> LinkSentScreen(
                onBack = { screen = Screen.LOGIN },
            )

            loadingWedding -> Box(
                Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = DugunceColors.Accent)
            }

            else -> {
                val wid = weddingId
                if (wid == null) {
                    NoWeddingScreen()
                } else {
                    Scaffold(
                        bottomBar = {
                            NavigationBar(containerColor = DugunceColors.Surface) {
                                NavigationBarItem(
                                    selected = screen == Screen.BUDGET,
                                    onClick = { screen = Screen.BUDGET },
                                    icon = { Text("₺") },
                                    label = { Text("Bütçe") },
                                )
                                NavigationBarItem(
                                    selected = screen == Screen.GUESTS,
                                    onClick = { screen = Screen.GUESTS },
                                    icon = { Text("👥") },
                                    label = { Text("Davetli") },
                                )
                                NavigationBarItem(
                                    selected = screen == Screen.TASKS,
                                    onClick = { screen = Screen.TASKS },
                                    icon = { Text("✓") },
                                    label = { Text("Görev") },
                                )
                            }
                        },
                    ) { padding ->
                        Box(Modifier.fillMaxSize().padding(padding)) {
                            when (screen) {
                                Screen.BUDGET -> BudgetScreen(repository, wid)
                                Screen.GUESTS -> GuestsScreen(repository, wid)
                                Screen.TASKS -> TasksScreen(repository, wid)
                                else -> Unit
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LinkSentScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Bağlantı gönderildi",
            style = MaterialTheme.typography.headlineSmall,
            color = DugunceColors.Ink,
        )
        Text(
            text = "E-postandaki bağlantıya dokun. Bağlantı 5 dakika geçerli.",
            style = MaterialTheme.typography.bodyMedium,
            color = DugunceColors.Muted,
        )
    }
}

@Composable
private fun NoWeddingScreen() {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Henüz bir düğün yok",
            style = MaterialTheme.typography.headlineSmall,
            color = DugunceColors.Ink,
        )
        Text(
            text = "Düğün oluşturma akışı yakında.",
            style = MaterialTheme.typography.bodyMedium,
            color = DugunceColors.Muted,
        )
    }
}
