package com.lumibyte.dugunce.push

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Token kaydı — sahte `PushApi` ile.
 *
 * NEDEN AĞ YOK: sınanan şey KARARLAR (boş token'da istek atma, hata
 * yutma), ağ davranışı değil.
 */
private class FakeApi(
    private val failRegister: Boolean = false,
    private val failDelete: Boolean = false,
) : PushApi {
    val registered = mutableListOf<String>()
    val deleted = mutableListOf<String>()

    override suspend fun registerDevice(token: String) {
        if (failRegister) error("kayıt hatası")
        registered.add(token)
    }

    override suspend fun deleteDevice(token: String) {
        if (failDelete) error("silme hatası")
        deleted.add(token)
    }
}

class DeviceRegistrarTest {
    @Test
    fun tokenVarsaKaydeder() = runTest {
        val api = FakeApi()
        val result = DeviceRegistrar.register("tok", api)

        assertEquals("tok", result)
        assertEquals(listOf("tok"), api.registered)
    }

    @Test
    fun tokenYoksaIstekAtmaz() = runTest {
        val api = FakeApi()
        val result = DeviceRegistrar.register(null, api)

        // iOS'ta token her zaman null (no-op). Boş token göndermek
        // sunucuda 400 üretirdi.
        assertNull(result)
        assertTrue(api.registered.isEmpty())
    }

    @Test
    fun bosTokenIstekAtmaz() = runTest {
        val api = FakeApi()
        assertNull(DeviceRegistrar.register("", api))
        assertTrue(api.registered.isEmpty())
    }

    @Test
    fun kayitHatasiYutulur() = runTest {
        val api = FakeApi(failRegister = true)
        // Fırlatmamalı: push bir sonraki açılışta tekrar denenir.
        assertNull(DeviceRegistrar.register("tok", api))
    }

    @Test
    fun unregisterTokenSiler() = runTest {
        val api = FakeApi()
        DeviceRegistrar.unregister("tok", api)

        assertEquals(listOf("tok"), api.deleted)
    }

    @Test
    fun unregisterBosTokenlaIstekAtmaz() = runTest {
        val api = FakeApi()
        DeviceRegistrar.unregister(null, api)
        assertTrue(api.deleted.isEmpty())
    }

    @Test
    fun silmeHatasiYutulur() = runTest {
        val api = FakeApi(failDelete = true)
        DeviceRegistrar.unregister("tok", api)
        // Fırlatmamalı.
    }
}
