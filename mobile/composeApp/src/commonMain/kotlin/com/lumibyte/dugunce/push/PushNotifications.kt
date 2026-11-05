package com.lumibyte.dugunce.push

/**
 * Platformdan bağımsız push köprüsü.
 *
 * `expect object` seçildi (top-level fonksiyon değil): izin durumu ve
 * token önbelleği platform tarafında tutuluyor; nesne kimliği bunu
 * taşımaya uygun.
 *
 * HER HEDEFTE `actual` ZORUNLU — `mobile/` iosArm64 ve
 * iosSimulatorArm64 hedefliyor. iOS tarafında no-op yazılıyor
 * (spec §0: Android-first), yoksa iOS derlemesi kırılır.
 */
expect object PushNotifications {
    /**
     * Kullanıcıdan bildirim izni ister.
     *
     * Android 13+ (API 33) çalışma zamanı izni; altında her zaman true.
     * iOS'ta no-op → false.
     */
    suspend fun requestPermission(): Boolean

    /**
     * FCM registration token.
     *
     * `null` döner: izin verilmediyse, `google-services.json` yoksa
     * veya platform iOS ise. Çağıran `null` görünce kayıt ATLAMALI.
     */
    suspend fun currentToken(): String?
}
