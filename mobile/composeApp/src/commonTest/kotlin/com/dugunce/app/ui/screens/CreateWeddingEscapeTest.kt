package com.dugunce.app.ui.screens

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Düğün oluşturma ekranından çıkış yolunun VARLIĞI.
 *
 * NEDEN BU TEST:
 * Kullanıcı bildirdi: "Yeni hesap açıp uygulamaya girdiğinde düğün
 * oluşturma alanından geriye gidemiyorsun ya da hesaptan çıkış
 * yapamıyorsun."
 *
 * Kök neden: `CreateWeddingScreen`'de ne geri düğmesi ne çıkış vardı.
 * `PlatformBackHandler` de yalnız `stack.size > 1` iken etkin; ilk
 * kurulumda yığın tek elemanlı olduğu için sistem geri tuşu uygulamayı
 * kapatıyordu. Kullanıcı ya düğün oluşturmak ya da uygulamayı kapatmak
 * zorundaydı.
 *
 * Bu testler çıkış yolunun HER ZAMAN var olduğunu kilitler.
 */
class CreateWeddingEscapeTest {

    @Test
    fun `dugun oluşturma ekraninda cikis yolu her zaman var`() {
        // Yığın tek elemanlı olsa bile (ilk kurulum) çıkış sunulmalı.
        assertTrue(canEscapeCreateWedding(stackSize = 1))
        assertTrue(canEscapeCreateWedding(stackSize = 3))
    }

    @Test
    fun `geri tusu dugun olusturma ekraninda yakalanir`() {
        // Sistem geri tuşu uygulamayı kapatmak yerine çıkış seçeneği
        // göstermeli.
        assertTrue(shouldInterceptBack(screenName = "CREATE_WEDDING", stackSize = 1))
    }

    @Test
    fun `geri tusu diger tek ekranlarda yakalanmaz`() {
        // Diğer onboarding ekranlarında normal davranış korunur.
        assertFalse(shouldInterceptBack(screenName = "WELCOME", stackSize = 1))
        assertFalse(shouldInterceptBack(screenName = "DASHBOARD", stackSize = 1))
    }
}
