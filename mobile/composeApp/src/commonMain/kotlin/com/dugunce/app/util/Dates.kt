package com.dugunce.app.util

/**
 * Tarih/saat yardımcıları — KMP'de `java.time` yok.
 *
 * Tüm tarihler ISO 8601 (`yyyy-MM-dd` veya tam ISO) olarak taşınır;
 * biçimlendirme Türkçe yapılır.
 */
object Dates {

    /** Bugünün ISO tarihi (`yyyy-MM-dd`). */
    fun todayIso(): String = epochDayToIso(currentEpochDay())

    /** Bu ayın `yyyy-MM` biçimi. */
    fun currentMonth(): String = todayIso().substring(0, 7)

    /** ISO tarihten `yyyy-MM`. */
    fun monthOf(iso: String?): String? = iso?.takeIf { it.length >= 7 }?.substring(0, 7)

    /** `yyyy-MM` → "Ocak 2026" gibi okunabilir. */
    fun formatMonth(ym: String?): String {
        if (ym == null || ym.length < 7) return "—"
        val year = ym.substring(0, 4)
        val month = ym.substring(5, 7).toIntOrNull() ?: return ym
        return "${monthName(month)} $year"
    }

    /** `yyyy-MM-dd` → "12 Eylül 2026". */
    fun formatDate(iso: String?): String {
        if (iso.isNullOrBlank()) return "—"
        val datePart = iso.substringBefore('T')
        val parts = datePart.split('-')
        if (parts.size != 3) return iso
        val year = parts[0]
        val month = parts[1].toIntOrNull() ?: return iso
        val day = parts[2].toIntOrNull() ?: return iso
        return "$day ${monthName(month)} $year"
    }

    /** `yyyy-MM-dd` → "12.09.2026". */
    fun formatShort(iso: String?): String {
        if (iso.isNullOrBlank()) return "—"
        val datePart = iso.substringBefore('T')
        val parts = datePart.split('-')
        if (parts.size != 3) return iso
        return "${parts[2]}.${parts[1]}.${parts[0]}"
    }

    /** ISO zaman damgasından saat: "14:30". */
    fun formatTime(iso: String?): String {
        if (iso.isNullOrBlank() || !iso.contains('T')) return ""
        val t = iso.substringAfter('T').take(5)
        return t
    }

    fun monthName(month: Int): String = when (month) {
        1 -> "Ocak"; 2 -> "Şubat"; 3 -> "Mart"; 4 -> "Nisan"
        5 -> "Mayıs"; 6 -> "Haziran"; 7 -> "Temmuz"; 8 -> "Ağustos"
        9 -> "Eylül"; 10 -> "Ekim"; 11 -> "Kasım"; 12 -> "Aralık"
        else -> "?"
    }

    /** Kısa ay adı — grafik eksenlerinde. */
    fun monthShort(month: Int): String = when (month) {
        1 -> "Oca"; 2 -> "Şub"; 3 -> "Mar"; 4 -> "Nis"
        5 -> "May"; 6 -> "Haz"; 7 -> "Tem"; 8 -> "Ağu"
        9 -> "Eyl"; 10 -> "Eki"; 11 -> "Kas"; 12 -> "Ara"
        else -> "?"
    }

    /**
     * Bugüne göre kalan gün sayısı.
     *
     * Negatifse geçmişte.
     */
    fun daysUntil(iso: String?): Int? {
        if (iso.isNullOrBlank()) return null
        val target = isoToEpochDay(iso.substringBefore('T')) ?: return null
        return (target - currentEpochDay()).toInt()
    }

    /** "3 gün kaldı", "Bugün", "2 gün geçti". */
    fun relativeDays(iso: String?): String {
        val d = daysUntil(iso) ?: return ""
        return when {
            d == 0 -> "Bugün"
            d == 1 -> "Yarın"
            d > 1 -> "$d gün kaldı"
            d == -1 -> "Dün"
            else -> "${-d} gün geçti"
        }
    }

    // --- Epoch gün <-> ISO ---

    /** 1970-01-01'den bugüne gün sayısı (UTC). */
    fun currentEpochDay(): Long = (currentMillis() / 86_400_000L)

    private fun currentMillis(): Long = nowMillis()

    fun epochDayToIso(days: Long): String {
        // Howard Hinnant'ın civil_from_days algoritması
        var z = days + 719468
        val era = (if (z >= 0) z else z - 146096) / 146097
        val doe = z - era * 146097
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        val y = yoe + era * 400
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = doy - (153 * mp + 2) / 5 + 1
        val m = if (mp < 10) mp + 3 else mp - 9
        val year = if (m <= 2) y + 1 else y
        return "${year.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
    }

    fun isoToEpochDay(iso: String): Long? {
        val parts = iso.split('-')
        if (parts.size != 3) return null
        val year = parts[0].toIntOrNull() ?: return null
        val month = parts[1].toIntOrNull() ?: return null
        val day = parts[2].toIntOrNull() ?: return null
        if (month !in 1..12 || day !in 1..31) return null
        // days_from_civil
        val y = if (month <= 2) year - 1 else year
        val era = (if (y >= 0) y else y - 399) / 400
        val yoe = y - era * 400
        val doy = (153 * (if (month > 2) month - 3 else month + 9) + 2) / 5 + day - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097L + doe - 719468L
    }
}

/** Bugünün ISO tarihi — kısayol. */
fun todayIso(): String = Dates.todayIso()
