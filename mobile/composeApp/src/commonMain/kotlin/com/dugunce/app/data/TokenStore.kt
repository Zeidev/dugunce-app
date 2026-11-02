package com.dugunce.app.data

import com.russhwolf.settings.Settings

/**
 * Oturum token'larının saklanması.
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
        set(value) {
            if (value == null) settings.remove(KEY_ACCESS)
            else settings.putString(KEY_ACCESS, value)
        }

    var refreshToken: String?
        get() = settings.getStringOrNull(KEY_REFRESH)
        set(value) {
            if (value == null) settings.remove(KEY_REFRESH)
            else settings.putString(KEY_REFRESH, value)
        }

    var userId: String?
        get() = settings.getStringOrNull(KEY_USER_ID)
        set(value) {
            if (value == null) settings.remove(KEY_USER_ID)
            else settings.putString(KEY_USER_ID, value)
        }

    var displayName: String?
        get() = settings.getStringOrNull(KEY_DISPLAY_NAME)
        set(value) {
            if (value == null) settings.remove(KEY_DISPLAY_NAME)
            else settings.putString(KEY_DISPLAY_NAME, value)
        }

    val isLoggedIn: Boolean get() = !accessToken.isNullOrBlank()

    fun save(access: String, refresh: String, userId: String, name: String?) {
        accessToken = access
        refreshToken = refresh
        this.userId = userId
        displayName = name
    }

    fun clear() {
        settings.remove(KEY_ACCESS)
        settings.remove(KEY_REFRESH)
        settings.remove(KEY_USER_ID)
        settings.remove(KEY_DISPLAY_NAME)
    }

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_USER_ID = "user_id"
        const val KEY_DISPLAY_NAME = "display_name"
    }
}
