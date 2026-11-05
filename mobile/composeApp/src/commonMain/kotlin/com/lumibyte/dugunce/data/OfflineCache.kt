package com.lumibyte.dugunce.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Çevrimdışı önbellek — spec §11: "İnternet yokken son veri görünür,
 * yazma engellenir."
 *
 * Tasarım: server-first. Yazma asla çevrimdışı yapılmaz (v1.1'e ertelendi);
 * yalnızca **son başarılı okuma** saklanır ve ağ hatasında gösterilir.
 *
 * Neden ayrı sınıf: `Repository`'yi kirletmeden test edilebilsin ve
 * önbellek anahtarları tek yerde tanımlı olsun.
 */
class OfflineCache(
    private val tokens: TokenStore,
    private val json: Json = Json { ignoreUnknownKeys = true; explicitNulls = false },
) {

    /** Anahtar uzayı — düğün bazlı, karışmasın. */
    private fun key(name: String, weddingId: String): String = "${name}_$weddingId"

    /** Başarılı yanıtı sakla. */
    fun <T> put(name: String, weddingId: String, serializer: KSerializer<T>, value: T) {
        runCatching {
            tokens.putCache(key(name, weddingId), json.encodeToString(serializer, value))
        }
    }

    /** Liste sakla. */
    fun <T> putList(name: String, weddingId: String, serializer: KSerializer<T>, value: List<T>) {
        runCatching {
            tokens.putCache(
                key(name, weddingId),
                json.encodeToString(ListSerializer(serializer), value),
            )
        }
    }

    /** Son saklanan değeri oku — yoksa null. */
    fun <T> get(name: String, weddingId: String, serializer: KSerializer<T>): T? =
        runCatching {
            tokens.cachedJson(key(name, weddingId))
                ?.let { json.decodeFromString(serializer, it) }
        }.getOrNull()

    /** Son saklanan listeyi oku — yoksa null. */
    fun <T> getList(name: String, weddingId: String, serializer: KSerializer<T>): List<T>? =
        runCatching {
            tokens.cachedJson(key(name, weddingId))
                ?.let { json.decodeFromString(ListSerializer(serializer), it) }
        }.getOrNull()

    /**
     * Önbellekteki düğünü döndürür — çevrimdışı açılış için.
     *
     * NEDEN: Ağ yokken `listWeddings()` başarısız oluyor, `wedding`
     * null kalıyor ve panel hiç çizilmiyordu (siyah ekran). Son bilinen
     * düğün önbellekten okunup ekran açılabilir.
     *
     * @param preferredId kullanıcının son seçtiği düğün (varsa)
     */
    fun lastWedding(preferredId: String?): com.lumibyte.dugunce.data.WeddingDto? {
        val list = getList(WEDDINGS, "all", com.lumibyte.dugunce.data.WeddingDto.serializer())
            ?: return null
        if (preferredId != null) {
            list.find { it.id == preferredId }?.let { return it }
        }
        return list.firstOrNull()
    }

    companion object {
        const val WEDDINGS = "weddings"
        const val GUESTS = "guests"
        const val EXPENSES = "expenses"
        const val TASKS = "tasks"
        const val HELPERS = "helpers"
        const val SUMMARY = "summary"
        const val USAGE = "usage"
    }
}
