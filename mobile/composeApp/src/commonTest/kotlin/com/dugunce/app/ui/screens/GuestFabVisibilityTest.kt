package com.dugunce.app.ui.screens

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Davetli listesindeki yüzen düğmelerin görünürlük kararı.
 *
 * NEDEN BU TEST:
 * Kullanıcı bildirdi: "kimse ekli değilken rehberden ekleme butonu
 * gözükmüyor". Kök neden, yüzen düğme satırının TAMAMININ
 * `guests.isNotEmpty()` koşuluna bağlı olmasıydı — yani davetli yokken
 * "Davetli ekle" de yoktu. Ekranda yalnız `EmptyState`'in kendi düğmesi
 * kalıyordu ve o da yalnız ELLE ekleme formunu açıyordu; rehberden
 * eklemenin hiçbir yolu yoktu.
 *
 * Bu testler kararı kilitler: davetli sayısı "ekle" düğmesini asla
 * gizlememeli, yalnız "Gönder"ü gizler (o davetli gerektirir).
 */
class GuestFabVisibilityTest {

    @Test
    fun `bos listede de ekle dugmesi gorunur`() {
        val v = guestFabVisibility(
            loading = false,
            hasError = false,
            guestCount = 0,
            contactPickerAvailable = true,
        )
        assertTrue(v.showAdd, "Davetli yokken ekle düğmesi görünmeli")
        assertFalse(v.showBulkSend, "Gönder davetli gerektirir")
    }

    @Test
    fun `davetli varken gonder de gorunur`() {
        val v = guestFabVisibility(
            loading = false,
            hasError = false,
            guestCount = 3,
            contactPickerAvailable = true,
        )
        assertTrue(v.showAdd)
        assertTrue(v.showBulkSend)
    }

    @Test
    fun `yuklenirken hicbir dugme gorunmez`() {
        val v = guestFabVisibility(
            loading = true,
            hasError = false,
            guestCount = 0,
            contactPickerAvailable = true,
        )
        assertFalse(v.showAdd)
        assertFalse(v.showBulkSend)
    }

    @Test
    fun `hata varken hicbir dugme gorunmez`() {
        val v = guestFabVisibility(
            loading = false,
            hasError = true,
            guestCount = 0,
            contactPickerAvailable = true,
        )
        assertFalse(v.showAdd)
        assertFalse(v.showBulkSend)
    }

    @Test
    fun `rehber yoksa da elle ekleme yolu kalir`() {
        // iOS'ta rehber henüz bağlı değil; "ekle" yine görünmeli çünkü
        // elle ekleme her platformda çalışır.
        val v = guestFabVisibility(
            loading = false,
            hasError = false,
            guestCount = 0,
            contactPickerAvailable = false,
        )
        assertTrue(v.showAdd)
    }
}
