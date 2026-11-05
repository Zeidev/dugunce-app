package com.lumibyte.dugunce.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Rehberden gelen kişinin telefonu.
 *
 * BİLDİRİLEN HATA (iki kez): "Rehberden eklediğim kişilerin rehberde
 * telefon numarası olmasına rağmen uygulamada numara eklenmiyor, 'telefon
 * yok' olarak görünüyor."
 *
 * KÖK NEDEN: `READ_CONTACTS` izni ne manifestte ne çalışma zamanında
 * isteniyordu. `ACTION_PICK` izinsiz açılır AMA dönen URI'yi
 * `contentResolver.query` ile okumak bu izni ister. Sorgu
 * `SecurityException` fırlatıyor, `runCatching` onu SESSİZCE yutuyordu
 * ve telefon boş kalıyordu.
 *
 * Bu testler sözleşmeyi kilitler.
 */
class ContactPhoneTest {

    @Test
    fun `telefonlu kisi tasinir`() {
        val c = PickedContact(name = "Ayşe Yılmaz", phone = "0532 123 45 67")
        assertEquals("Ayşe Yılmaz", c.name)
        assertEquals("0532 123 45 67", c.phone)
        assertTrue(c.phone.isNotBlank(), "Telefon boş olmamalı")
    }

    @Test
    fun `telefonsuz kisi bos telefonla tasinir`() {
        // Rehberde numarası olmayan kişi — isimle eklenebilmeli.
        val c = PickedContact(name = "Mehmet", phone = "")
        assertEquals("Mehmet", c.name)
        assertEquals("", c.phone)
        assertTrue(c.phone.isBlank())
    }

    @Test
    fun `telefon numarasi bosluklar korunarak tasinir`() {
        // Rehber formatı korunur; normalizasyon sunucuda yapılır.
        val c = PickedContact(name = "Ali", phone = "+90 555 111 22 33")
        assertTrue(c.phone.startsWith("+90"), "Ülke kodu korunmalı")
        assertTrue(c.phone.contains(" "), "Rehber formatı korunmalı")
    }
}
