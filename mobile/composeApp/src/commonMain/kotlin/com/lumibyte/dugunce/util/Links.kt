package com.lumibyte.dugunce.util

/**
 * Paylaşılabilir bağlantı üretimi.
 *
 * Backend `/h#token` veya `/d#token` gibi GÖRELİ yollar döner
 * (design §7: token fragment'te, sunucuya gitmez). İstemci bunları
 * tam URL'ye çevirmek zorunda — WhatsApp'a gönderilen metin mutlak
 * olmalı, yoksa karşı taraf açamaz.
 */
object Links {
    /** Halka açık site — Cloudflare Pages. */
    const val PUBLIC_ORIGIN = "https://dugunce.com.tr"

    /**
     * Göreli veya eksik yolu tam URL'ye çevirir.
     *
     * - `"/h#abc"` → `"https://dugunce.com.tr/h#abc"`
     * - `"https://..."` → olduğu gibi
     * - `"h#abc"` → `"https://dugunce.com.tr/h#abc"`
     */
    fun absolute(urlOrPath: String?): String? {
        if (urlOrPath.isNullOrBlank()) return null
        val trimmed = urlOrPath.trim()
        if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed
        val path = if (trimmed.startsWith("/")) trimmed else "/$trimmed"
        return PUBLIC_ORIGIN + path
    }

    /**
     * Yardımcı davet linki.
     *
     * Öncelik: sunucunun `url` alanı → token'dan üret.
     */
    fun helperInvite(url: String?, token: String?): String? =
        absolute(url) ?: token?.let { "$PUBLIC_ORIGIN/h#$it" }

    /**
     * Misafir davetiye linki.
     *
     * Öncelik: sunucunun `url` alanı → token'dan üret.
     */
    fun guestInvite(url: String?, token: String?): String? =
        absolute(url) ?: token?.let { "$PUBLIC_ORIGIN/d#$it" }
}
