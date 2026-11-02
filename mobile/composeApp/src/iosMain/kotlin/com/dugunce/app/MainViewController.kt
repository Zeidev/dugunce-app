package com.dugunce.app

import androidx.compose.ui.window.ComposeUIViewController
import com.dugunce.app.api.ApiClient
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TokenStore
import com.russhwolf.settings.NSUserDefaultsSettings
import platform.Foundation.NSUserDefaults
import platform.UIKit.UIViewController

/**
 * iOS giriş noktası.
 *
 * Swift tarafından `MainViewControllerKt.MainViewController()` ile çağrılır.
 *
 * NOT: Token saklama şu an NSUserDefaults — şifrelenmemiş. Üretimde
 * Keychain'e geçilmeli (Aşama 8 güvenlik denetimi).
 */
fun MainViewController(): UIViewController {
    val settings = NSUserDefaultsSettings(NSUserDefaults.standardUserDefaults)
    val tokens = TokenStore(settings)
    val api = ApiClient(tokenProvider = { tokens.accessToken })
    val repository = Repository(api, tokens)

    return ComposeUIViewController {
        App(repository = repository, tokens = tokens)
    }
}
