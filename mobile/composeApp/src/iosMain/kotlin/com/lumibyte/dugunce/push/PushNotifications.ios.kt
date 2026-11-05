package com.lumibyte.dugunce.push

/**
 * iOS — NO-OP.
 *
 * KAPSAM KARARI (spec §0, 2026-11-05): önce yalnız Android. iOS push
 * ayrı bir iş; Apple Developer hesabı, APNs `.p8` anahtarı, Xcode'da
 * "Push Notifications" yeteneği ve serv00'da HTTP/2 çıkışının ölçülmesi
 * gerekiyor.
 *
 * NEDEN YİNE DE YAZILIYOR: `expect object` tanımı TÜM hedeflerde
 * `actual` ister. Bu dosya olmadan **iOS derlemesi kırılır** — oysa
 * uygulama iOS'ta çalışmaya devam etmeli, sadece push olmamalı.
 */
actual object PushNotifications {
    actual suspend fun requestPermission(): Boolean = false

    actual suspend fun currentToken(): String? = null
}
