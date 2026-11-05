package com.lumibyte.dugunce.push

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Yenilenen FCM token'ının uygulama katmanına taşınması.
 *
 * NEDEN GEREKLİ: `FirebaseMessagingService.onNewToken` servis içinde
 * çalışır; oradan Repository'ye erişim yok (DI yok). Token'ı bir akışa
 * bırakıp uygulama katmanının dinlemesi, servisi bağımlılıksız tutar.
 *
 * NEDEN `StateFlow`: son token her zaman okunabilir kalsın; `SharedFlow`
 * olsaydı dinleyici yokken gelen token kaybolurdu.
 */
object PushTokenBus {
    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token

    fun publish(token: String) {
        _token.value = token
    }
}
