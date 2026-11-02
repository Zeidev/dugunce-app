package com.dugunce.app.data

import com.russhwolf.settings.Settings

/**
 * Oturum token'larının ve kullanıcı tercihlerinin saklanması.
 *
 * GÜVENLİK NOTU (docs/SECURITY.md §1.3):
 * Android'de `Settings` varsayılan olarak SharedPreferences kullanır —
 * şifrelenmemiştir. Üretimde EncryptedSharedPreferences'e geçilmeli
 * (Aşama 8 güvenlik denetimi). iOS'ta Keychain kullanılmalı.
 *
 * Bu bir TODO değil, bilinçli bir v1 kararı: önce çalışsın, sonra
 * sertleştirilsin. Ama ASLA log'a yazılmaz.
 */
class TokenStore(private val settings: Settings) {

    var accessToken: String?
        get() = settings.getStringOrNull(KEY_ACCESS)
        set(value) = settings.putOrRemove(KEY_ACCESS, value)

    var refreshToken: String?
        get() = settings.getStringOrNull(KEY_REFRESH)
        set(value) = settings.putOrRemove(KEY_REFRESH, value)

    var userId: String?
        get() = settings.getStringOrNull(KEY_USER_ID)
        set(value) = settings.putOrRemove(KEY_USER_ID, value)

    var userEmail: String?
        get() = settings.getStringOrNull(KEY_USER_EMAIL)
        set(value) = settings.putOrRemove(KEY_USER_EMAIL, value)

    var displayName: String?
        get() = settings.getStringOrNull(KEY_DISPLAY_NAME)
        set(value) = settings.putOrRemove(KEY_DISPLAY_NAME, value)

    // --- Tercihler (ayarlar ekranı) ---

    /** Tema: SYSTEM | LIGHT | DARK */
    var themeMode: String
        get() = settings.getStringOrNull(KEY_THEME) ?: "SYSTEM"
        set(value) = settings.putString(KEY_THEME, value)

    /** Onboarding tamamlandı mı — tekrar gösterilmez. */
    var onboardingDone: Boolean
        get() = settings.getBooleanOrNull(KEY_ONBOARDING) ?: false
        set(value) = settings.putBoolean(KEY_ONBOARDING, value)

    /** Onboarding'de hangi adımda kalındı (yarıda kalırsa devam etsin). */
    var onboardingStep: Int
        get() = settings.getIntOrNull(KEY_ONBOARDING_STEP) ?: 0
        set(value) = settings.putInt(KEY_ONBOARDING_STEP, value)

    /** Seçili düğün — çoklu düğün desteği için. */
    var selectedWeddingId: String?
        get() = settings.getStringOrNull(KEY_SELECTED_WEDDING)
        set(value) = settings.putOrRemove(KEY_SELECTED_WEDDING, value)

    /** Bildirim izni verildi mi. */
    var notificationsEnabled: Boolean
        get() = settings.getBooleanOrNull(KEY_NOTIFICATIONS) ?: false
        set(value) = settings.putBoolean(KEY_NOTIFICATIONS, value)

    /** Son başarılı yanıtın önbelleği (çevrimdışı görüntüleme). */
    fun cachedJson(key: String): String? = settings.getStringOrNull("cache_$key")

    fun putCache(key: String, value: String) = settings.putString("cache_$key", value)

    val isLoggedIn: Boolean get() = !accessToken.isNullOrBlank()

    fun save(access: String, refresh: String, userId: String, email: String?, name: String?) {
        accessToken = access
        refreshToken = refresh
        this.userId = userId
        userEmail = email
        displayName = name
    }

    fun clear() {
        settings.remove(KEY_ACCESS)
        settings.remove(KEY_REFRESH)
        settings.remove(KEY_USER_ID)
        settings.remove(KEY_USER_EMAIL)
        settings.remove(KEY_DISPLAY_NAME)
        settings.remove(KEY_SELECTED_WEDDING)
    }

    private fun Settings.putOrRemove(key: String, value: String?) {
        if (value == null) remove(key) else putString(key, value)
    }

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_USER_ID = "user_id"
        const val KEY_USER_EMAIL = "user_email"
        const val KEY_DISPLAY_NAME = "display_name"
        const val KEY_THEME = "theme_mode"
        const val KEY_ONBOARDING = "onboarding_done"
        const val KEY_ONBOARDING_STEP = "onboarding_step"
        const val KEY_SELECTED_WEDDING = "selected_wedding"
        const val KEY_NOTIFICATIONS = "notifications_enabled"
    }
}
