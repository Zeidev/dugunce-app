package com.dugunce.app.ui.screens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Giriş sonrası başlangıç ekranı — İKİ YOL.
 *
 * KULLANICI İSTEĞİ (2026-11-04): "kullanıcı giriş yapsın ekranda düğün
 * oluştur ve davet kodu gir bölümü olsun; kullanıcı yeniyse düğün
 * oluşturur, eğer daveti varsa davet kodunu girer ve ortak olarak diğer
 * kişiyle aynı ekrana aktarılır."
 *
 * ÖNCEKİ HATA: davet kodu girişi YALNIZCA giriş ekranındaydı. Giriş
 * yapmış (hesabı olan) bir kullanıcı eşinden kod aldığında girecek yer
 * bulamıyordu.
 */
class StartModeTest {

    @Test
    fun `varsayilan mod dugun olusturma`() {
        // Yeni kullanıcı çoğunlukla düğün oluşturur.
        assertEquals(StartMode.CREATE, defaultStartMode())
    }

    @Test
    fun `davet kodu varsa varsayilan mod KATIL olur`() {
        // Kullanıcı kod girip girişe düşmüşse, girişten sonra doğrudan
        // katılma modunda açılmalı — kodu tekrar aramasın.
        assertEquals(StartMode.JOIN, defaultStartMode(pendingInviteCode = "ABC2345"))
        assertEquals(StartMode.CREATE, defaultStartMode(pendingInviteCode = null))
        assertEquals(StartMode.CREATE, defaultStartMode(pendingInviteCode = ""))
    }

    @Test
    fun `dugun olusturma formu katil modunda gecerli degil`() {
        assertFalse(canCreateWedding(mode = StartMode.JOIN, coupleNames = "A & B", dateIso = "2026-09-12"))
        assertTrue(canCreateWedding(mode = StartMode.CREATE, coupleNames = "A & B", dateIso = "2026-09-12"))
    }

    @Test
    fun `katil modunda kod gecerli olmali`() {
        assertTrue(canJoinWedding(mode = StartMode.JOIN, code = "ABC2345"))
        assertFalse(canJoinWedding(mode = StartMode.JOIN, code = "ABC"))
        assertFalse(canJoinWedding(mode = StartMode.JOIN, code = ""))
        // Oluşturma modunda katılma düğmesi yok.
        assertFalse(canJoinWedding(mode = StartMode.CREATE, code = "ABC2345"))
    }

    @Test
    fun `dugun olusturma formu bos isimle gecerli degil`() {
        assertFalse(canCreateWedding(mode = StartMode.CREATE, coupleNames = "", dateIso = "2026-09-12"))
        assertFalse(canCreateWedding(mode = StartMode.CREATE, coupleNames = "A", dateIso = "2026-09-12"))
        assertFalse(canCreateWedding(mode = StartMode.CREATE, coupleNames = "A & B", dateIso = null))
    }
}
