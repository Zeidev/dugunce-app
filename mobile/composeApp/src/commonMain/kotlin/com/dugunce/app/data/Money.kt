package com.dugunce.app.data

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
     * Kullanıcının girdiği TL metnini kuruşa çevirir.
     *
     * `"12.000,50"` ve `"12000.50"` → `"1200050"`
     *
     * @return null — geçersiz girdi
     */
    fun parseToKurus(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null

        // Türkçe format: nokta binlik, virgül ondalık
        val normalized = if (trimmed.contains(',')) {
            trimmed.replace(".", "").replace(',', '.')
        } else {
            trimmed
        }

        if (!Regex("""^\d+(\.\d{1,2})?$""").matches(normalized)) return null

        val parts = normalized.split('.')
        val whole = parts[0]
        val frac = (parts.getOrNull(1) ?: "").padEnd(2, '0')

        return whole + frac
    }
}
