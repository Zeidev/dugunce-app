package com.lumibyte.dugunce.data

import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Tanıtım sayfası yalnız İLK AÇILIŞTA görünmeli.
 *
 * BİLDİRİLEN HATA: "Oturum düştüğünde tanıtım sayfası yine gözüküyor.
 * Tanıtım sadece uygulamayı ilk kez yükleyen kişiye gözüksün."
 *
 * KÖK NEDEN: `onboardingDone` bayrağı TokenStore'da VARDI ama
 * `App.kt` içinde HİÇ OKUNMUYORDU — yalnız yazılıyordu. Bu yüzden
 * açılış her zaman WELCOME (tanıtım) ekranına düşüyordu.
 */
class OnboardingFlagTest {

    @Test
    fun `ilk kurulumda tanitim gosterilir`() {
        val tokens = TokenStore(MapSettings())
        assertFalse(tokens.onboardingDone, "İlk açılışta tanıtım gösterilmeli")
    }

    @Test
    fun `tanitim bitince bayrak kalici olur`() {
        val settings = MapSettings()
        val tokens = TokenStore(settings)

        tokens.onboardingDone = true
        assertTrue(tokens.onboardingDone)

        // Yeni TokenStore aynı ayarlarla — uygulama yeniden açılmış gibi
        val reopened = TokenStore(settings)
        assertTrue(
            reopened.onboardingDone,
            "Bayrak kalıcı olmalı — yoksa tanıtım her açılışta tekrar çıkar",
        )
    }

    @Test
    fun `oturum dusse bile tanitim tekrar gostermez`() {
        val settings = MapSettings()
        val tokens = TokenStore(settings)
        tokens.onboardingDone = true
        tokens.accessToken = "a"
        tokens.refreshToken = "r"

        // Oturum düştü: token'lar temizlenir
        tokens.clear()

        assertFalse(tokens.isLoggedIn, "Oturum düşmeli")
        assertTrue(
            tokens.onboardingDone,
            "Oturum düşmesi tanıtım bayrağını SİLMEMELİ — kullanıcı tanıtımı bir kez gördü",
        )
    }
}
