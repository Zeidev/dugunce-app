package com.dugunce.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import com.dugunce.app.api.ApiClient
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TokenStore
import com.russhwolf.settings.SharedPreferencesSettings

/**
 * Tek aktivite — tüm ekranlar Compose.
 *
 * Deep link: `https://dugunce.com.tr/auth?token=…` (magic link) ve
 * `https://dugunce.com.tr/invite?code=…` (davet kodu) buraya düşer
 * (`docs/DEEPLINK-SETUP.md`, AndroidManifest intent-filter).
 *
 * `onNewIntent` de işlenir — uygulama arka plandayken gelen link
 * yeni aktivite oluşturmaz.
 */
class MainActivity : ComponentActivity() {

    /** Deep link'ten gelen magic link token'ı. */
    private val deepLinkToken = mutableStateOf<String?>(null)

    /** Deep link'ten gelen davet kodu. */
    private val deepLinkInviteCode = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        handleIntent(intent)

        val settings = SharedPreferencesSettings(
            getSharedPreferences("dugunce", MODE_PRIVATE),
        )
        val tokens = TokenStore(settings)
        val api = ApiClient(tokenProvider = { tokens.accessToken })
        val repository = Repository(api, tokens)

        setContent {
            App(
                repository = repository,
                tokens = tokens,
                initialAuthToken = deepLinkToken.value,
                initialInviteCode = deepLinkInviteCode.value,
                onDeepLinkConsumed = {
                    deepLinkToken.value = null
                    deepLinkInviteCode.value = null
                },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /**
     * Link'i çözer.
     *
     * `/auth?token=X`   → magic link token
     * `/invite?code=X`  → davet kodu
     *
     * Bilinmeyen yol sessizce yok sayılır.
     */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val uri = intent.data ?: return

        when (uri.path?.trimEnd('/')) {
            "/auth" -> uri.getQueryParameter("token")?.let { deepLinkToken.value = it }
            "/invite" -> uri.getQueryParameter("code")?.let { deepLinkInviteCode.value = it }
            else -> Unit
        }
    }
}
