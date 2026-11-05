package com.lumibyte.dugunce.data

/**
 * Para biçimlendirme.
 *
 * Backend para birimini KURUŞ (bigint) olarak taşır — float YOK
 * (SECURITY §10.1). İstemci de aynı disiplini korur: `String` üzerinden
 * `Long`'a çevrilir, çift aritmetiği yapılmaz.
 */
object Money {

    /**
     * Kuruş string'ini Türkçe biçime çevirir.
     *
     * `"1200000"` → `"12.000,00 ₺"`
     *
     * @throws NumberFormatException geçersiz girdi
     */
    fun formatKurus(kurus: String): String {
        val value = kurus.toLongOrNull() ?: return "—"
        return formatKurus(value)
    }

    fun formatKurus(kurus: Long): String {
        val negative = kurus < 0
        val abs = if (negative) -kurus else kurus
        val lira = abs / 100
        val cents = abs % 100

        val grouped = lira.toString()
            .reversed()
            .chunked(3)
            .joinToString(".")
            .reversed()

        val sign = if (negative) "-" else ""
        return "$sign$grouped,${cents.toString().padStart(2, '0')} ₺"
    }

    /**
     * Kuruş → backend'in beklediği **TL** metni.
     *
     * **SÖZLEŞME:** backend `amount` alanını TL (ondalıklı) bekliyor ve
     * kendi içinde `toKurus()` ile 100 ile çarpıyor
     * (`expenses/service.ts` → `money.ts:toKurus`).
     *
     * `parseToKurus("12000")` → `"1200000"` (kuruş) döner; bunu doğrudan
     * `amount` olarak göndermek **100 katı** tutara yol açar — bildirilen
     * "tutar yanlış" hatası. Bu fonksiyon kuruşu TL'ye geri çevirir.
     *
     * `"1200000"` → `"12000.00"`
     */
    fun kurusToTlString(kurus: String): String {
        val value = kurus.toLongOrNull() ?: return "0.00"
        val negative = value < 0
        val abs = if (negative) -value else value
        val lira = abs / 100
        val cents = abs % 100
        val sign = if (negative) "-" else ""
        return "$sign$lira.${cents.toString().padStart(2, '0')}"
    }

    /**
     * Kullanıcının girdiği TL metnini kuruşa çevirir.
     *
     * `"12.000,50"` ve `"12000.50"` → `"1200050"`
     *
     * @return null — geçersiz girdi
     */
    fun parseToKurus(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null

        // Türkçe format: nokta BİNLİK, virgül ondalık.
        //
        // "12.000,50" → "12000.50"  (nokta binlik ayırıcı, atılır)
        // "12000.50"  → "12000.50"  (nokta ondalık — korunur!)
        //
        // Ayırt etme kuralı: virgül varsa nokta binliktir. Virgül yoksa
        // ve noktadan sonra 3 hane varsa binliktir ("12.000"), 1-2 hane
        // varsa ondalıktır ("12000.50").
        val normalized = if (trimmed.contains(',')) {
            trimmed.replace(".", "").replace(',', '.')
        } else {
            val dotCount = trimmed.count { it == '.' }
            when {
                dotCount == 0 -> trimmed
                // Birden fazla nokta → hepsi binlik ayırıcı
                dotCount > 1 -> trimmed.replace(".", "")
                // Tek nokta: sonrasında tam 3 hane varsa binlik
                else -> {
                    val decimals = trimmed.substringAfterLast('.').length
                    if (decimals == 3) trimmed.replace(".", "") else trimmed
                }
            }
        }

        if (!Regex("""^\d+(\.\d{1,2})?$""").matches(normalized)) return null

        val parts = normalized.split('.')
        val whole = parts[0]
        val frac = (parts.getOrNull(1) ?: "").padEnd(2, '0')

        return whole + frac
    }
}
