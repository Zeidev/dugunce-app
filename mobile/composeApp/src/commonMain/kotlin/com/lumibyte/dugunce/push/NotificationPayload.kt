package com.lumibyte.dugunce.push

/**
 * FCM `data` yükünden düğün kimliğini çıkarır.
 *
 * SAF FONKSİYON — `commonMain`'de, platform tipine bağlı değil, bu
 * yüzden `commonTest`'te sınanabiliyor. Android servisi bunu kullanır.
 *
 * Boş string `null` sayılır: sunucu `data.weddingId` göndermezse `""`
 * gelebilir; boş kimlikle gezinme denemesi beyaz ekran üretirdi.
 */
fun extractWeddingId(data: Map<String, String>): String? =
    data["weddingId"]?.takeIf { it.isNotBlank() }

/**
 * Bildirime dokunulduğunda açılacak deep link.
 *
 * NEDEN `dugunce://` ŞEMASI: uygulama zaten bu şemayı işliyor
 * (`MainActivity.handleIntent`, magic link ve davet için). Aynı yolu
 * kullanmak, bildirim için ayrı bir gezinme mekanizması yazmaktan
 * daha az kırılgan.
 *
 * `weddingId` yoksa `null` — çağıran deep link EKLEMEZ, uygulama
 * yalnız açılır (yanlış ekrana gitmekten iyidir).
 */
fun notificationDeepLink(weddingId: String?): String? =
    weddingId?.let { "dugunce://wedding/$it" }
