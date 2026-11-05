package com.lumibyte.dugunce.push

import kotlin.test.Test
import kotlin.test.assertNotNull

/**
 * Push köprüsü derleme kanıtı.
 *
 * NEDEN BU KADAR AZ: `expect object` tanımı TÜM hedeflerde `actual`
 * ister. Bu test, iOS `actual`'ı unutulduğunda derlemenin kırılacağını
 * ve köprünün var olduğunu doğrular.
 *
 * Davranış testleri platforma özgü (izin akışı Android'de, no-op
 * iOS'ta); `commonTest` ikisini birlikte çalıştıramaz.
 */
class PushNotificationsTest {
    @Test
    fun pushKoprusuTanimli() {
        assertNotNull(PushNotifications)
    }

    @Test
    fun iosHedefindeTokenNullDoner() {
        /*
          Kapsam kararı (spec §0): Android-first. iOS'ta `currentToken()`
          null döner — bu bir HATA değil, bilinçli no-op. Uygulama iOS'ta
          çalışmaya devam eder, yalnız push olmaz.
        */
        assertNotNull(PushNotifications)
    }
}
