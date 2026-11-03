package com.dugunce.app.util

import kotlin.time.Clock

/**
 * "Şimdi" — `kotlin.time.Clock` üzerinden.
 *
 * `commonMain`'de `System.currentTimeMillis()` yok; bu sarmalayıcı
 * platform farkını gizler ve testte sahte saat enjekte edilebilir.
 *
 * NOT: kotlinx-datetime 0.8.0'da `kotlinx.datetime.Clock` kullanımdan
 * kaldırıldı; yerine `kotlin.time.Clock` geldi (Kotlin 2.4 standart
 * kütüphanesi). Bu sarmalayıcı sayesinde çağıran kod değişmedi.
 */
private var testClock: (() -> Long)? = null

/** Test için saati sabitle. */
fun setTestClock(provider: (() -> Long)?) {
    testClock = provider
}

fun nowMillis(): Long =
    testClock?.invoke() ?: Clock.System.now().toEpochMilliseconds()
