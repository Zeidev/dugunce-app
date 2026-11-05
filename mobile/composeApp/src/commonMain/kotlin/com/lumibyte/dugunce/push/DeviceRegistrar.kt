package com.lumibyte.dugunce.push

/**
 * Cihaz token'ını sunucuya kaydeder/siler.
 *
 * NEDEN AYRI NESNE: `PushNotifications` platforma özgü token alımını
 * yapıyor; sunucuya kayıt ise platformdan bağımsız (Ktor istemcisi).
 * İkisini birleştirmek `expect/actual`'ı ağ katmanına bağlardı.
 *
 * HATA YUTULUR: kayıt başarısız olursa uygulama çalışmaya devam eder;
 * bir sonraki açılışta tekrar denenir (upsert idempotent). Kullanıcıya
 * hata göstermek anlamsız — yapabileceği bir şey yok.
 */
object DeviceRegistrar {
    /**
     * Token'ı sunucuya kaydeder.
     *
     * `null`/boş token → HİÇBİR İSTEK ATILMAZ. Neden: iOS'ta no-op
     * olduğu için token her zaman null; izin verilmemiş Android'de de
     * null. Boş token göndermek sunucuda 400 üretir ve log'u kirletir.
     *
     * @return kaydedilen token (başarılıysa), aksi hâlde `null`
     */
    suspend fun register(token: String?, api: PushApi): String? {
        if (token.isNullOrBlank()) return null
        return runCatching {
            api.registerDevice(token)
            token
        }.getOrNull()
    }

    /** Token'ı siler (bildirimler kapatılınca / çıkışta). */
    suspend fun unregister(token: String?, api: PushApi) {
        if (token.isNullOrBlank()) return
        runCatching { api.deleteDevice(token) }
    }
}

/**
 * Repository'nin push ile ilgili DAR yüzeyi.
 *
 * NEDEN ARAYÜZ: `DeviceRegistrar` testinde gerçek Repository + Ktor
 * kurmak gerekmesin. Ayrıca bildirim özelliğinin ihtiyaç duyduğu tam
 * yüzey bu iki metot — Repository'nin geri kalanına bağımlılık yok.
 */
interface PushApi {
    suspend fun registerDevice(token: String)
    suspend fun deleteDevice(token: String)
}
