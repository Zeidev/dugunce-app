package com.dugunce.app.ui.screens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Davet kodu akışı — giriş gerektirir.
 *
 * BİLDİRİLEN HATA: "Davet kodu ile giriş yapılamıyor." Kullanıcı giriş
 * ekranında "Davet kodum var"a basıp kod giriyor; `POST /invites/accept`
 * `requireAuth` arkasında olduğu için 401 dönüyor, istemci bunu "oturum
 * düştü" sanıp token'ları siliyor ve "Oturumunuz sona erdi" uyarısı
 * çıkıyor. Kullanıcı kodu bir daha giremiyor.
 *
 * ÇÖZÜM: kod saklanır, kullanıcı önce giriş yapar, kod girişten SONRA
 * otomatik uygulanır.
 */
class InviteFlowTest {

    @Test
    fun `giris yapilmadan davet kodu gonderilmez`() {
        // Token yoksa istek ATILMAZ — 401 alıp oturumu düşürmemek için.
        assertFalse(shouldSubmitInviteNow(isLoggedIn = false, code = "ABC2345"))
    }

    @Test
    fun `giris yapilinca kod gonderilir`() {
        assertTrue(shouldSubmitInviteNow(isLoggedIn = true, code = "ABC2345"))
    }

    @Test
    fun `gecersiz kod gonderilmez`() {
        assertFalse(shouldSubmitInviteNow(isLoggedIn = true, code = ""))
        assertFalse(shouldSubmitInviteNow(isLoggedIn = true, code = "ABC"))
        assertFalse(shouldSubmitInviteNow(isLoggedIn = true, code = "ABC23456"))
    }

    @Test
    fun `kod normalize edilir`() {
        assertEquals("ABC2345", normalizeInviteCode("  abc2345  "))
        assertEquals("ABC2345", normalizeInviteCode("abc-2345"))
        assertEquals("", normalizeInviteCode("   "))
    }

    @Test
    fun `bekleyen kod girise yonlendirir`() {
        // Kod varsa giriş ekranı "davet kodun var" modunda açılmalı.
        assertTrue(hasPendingInviteCode("ABC2345"))
        assertFalse(hasPendingInviteCode(null))
        assertFalse(hasPendingInviteCode(""))
    }
}
