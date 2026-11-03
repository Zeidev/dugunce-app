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

        // Pano/paylaşım için uygulama bağlamı (util/Platform.android.kt)
        com.dugunce.app.util.AppContextHolder.context = applicationContext

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
     * **KRİTİK:** Backend linki `https://dugunce.com.tr/auth#<token>`
     * biçiminde üretiyor (`magic-link.ts` → `MAGIC_LINK_BASE_URL#rawToken`).
     * Token **fragment**'te, çünkü fragment sunucuya gitmez (design §7).
     *
     * `getQueryParameter` fragment'ı OKUMAZ — bu yüzden token hem
     * `?token=` hem `#token` biçiminde aranır. Tek biçim varsaymak,
     * e-postadaki bağlantının sessizce çalışmamasına yol açıyordu.
     */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val uri = intent.data ?: return

        // Fragment içeriği: "#token" veya "#access_token=..." biçimleri
        val fragment = uri.fragment?.removePrefix("#")
        val fragmentParams = fragment
            ?.split('&')
            ?.mapNotNull { part ->
                val idx = part.indexOf('=')
                if (idx > 0) part.substring(0, idx) to part.substring(idx + 1) else null
            }
            ?.toMap()
            .orEmpty()

        fun value(name: String): String? =
            uri.getQueryParameter(name) ?: fragmentParams[name]

        /**
         * İki biçim geliyor:
         *
         * 1. `https://dugunce.com.tr/auth/#<token>`  — e-postadaki link
         *    (App Links doğrulanmışsa doğrudan uygulamaya düşer)
         * 2. `dugunce://auth?token=<token>`          — /auth sayfasının
         *    "Uygulamada aç" butonu (App Links çalışmadığında)
         *
         * İkincisinde `host` = "auth", `path` = "" olur; bu yüzden
         * hem path hem host kontrol edilir.
         */
        val hostOrPath = uri.host?.takeIf { uri.scheme == "dugunce" }
            ?: uri.path?.trimEnd('/')

        when (hostOrPath) {
            "/auth", "auth" -> {
                // Fragment'ta `=` yoksa tamamı token'dır (backend biçimi)
                val token = value("token")
                    ?: fragment?.takeIf { it.isNotBlank() && !it.contains('=') }
                token?.let { deepLinkToken.value = it }
            }
            "/invite", "invite" -> value("code")?.let { deepLinkInviteCode.value = it }
            else -> Unit
        }
    }
}
