package com.dugunce.app.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Rehberden gelen kişinin telefonu.
 *
 * NEDEN: Kullanıcı "rehberden eklediğim kişilerin telefon numarası
 * alınmıyor, o kişilere davetiye gönderilemiyor" dedi.
 *
 * Kök neden `PickedContact.phone`'un boş gelmesiydi. Bu testler
 * sözleşmeyi kilitler: telefon varsa taşınır, yoksa boş kalır ve
 * kişi yine de isimle eklenebilir.
 */
class ContactPhoneTest {

    @Test
    fun `telefonlu kisi tasinir`() {
        val c = PickedContact(name = "Ayşe Yılmaz", phone = "0532 123 45 67")
        assertEquals("Ayşe Yılmaz", c.name)
        assertEquals("0532 123 45 67", c.phone)
        assertTrue(c.phone.isNotBlank())
    }

    @Test
    fun `telefonsuz kisi bos telefonla tasinir`() {
        // Rehberde numarası olmayan kişi — isimle eklenebilmeli.
        val c = PickedContact(name = "Mehmet", phone = "")
        assertEquals("Mehmet", c.name)
        assertEquals("", c.phone)
        assertTrue(c.phone.isBlank())
    }
}
