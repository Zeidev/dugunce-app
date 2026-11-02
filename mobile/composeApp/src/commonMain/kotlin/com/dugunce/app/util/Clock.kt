package com.dugunce.app.util

import kotlinx.datetime.Clock

/**
 * "Şimdi" — kotlinx-datetime üzerinden.
 *
 * `commonMain`'de `System.currentTimeMillis()` yok; bu sarmalayıcı
 * platform farkını gizler ve testte sahte saat enjekte edilebilir.
 */
private var testClock: (() -> Long)? = null

/** Test için saati sabitle. */
fun setTestClock(provider: (() -> Long)?) {
    testClock = provider
}

fun nowMillis(): Long =
    testClock?.invoke() ?: Clock.System.now().toEpochMilliseconds()
