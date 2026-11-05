package com.lumibyte.dugunce.data

import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Çevrimdışı önbellek testleri — spec §11: "İnternet yokken son veri
 * görünür, yazma engellenir."
 *
 * Not: burada yalnızca GÖRÜNTÜLEME önbelleği test edilir. Yazma kuyruğu
 * bilinçli olarak yok (v1.1).
 */
class OfflineCacheTest {

    private fun newCache(): Pair<OfflineCache, TokenStore> {
        val tokens = TokenStore(MapSettings())
        return OfflineCache(tokens) to tokens
    }

    @Test
    fun `liste yazilir ve okunur`() {
        val (cache, _) = newCache()
        val guests = listOf(
            GuestDto(id = "1", name = "Ayşe", side = "BRIDE", rsvp = "PENDING"),
            GuestDto(id = "2", name = "Mert", side = "GROOM", rsvp = "ATTENDING"),
        )
        cache.putList(OfflineCache.GUESTS, "w1", GuestDto.serializer(), guests)
        val read = cache.getList(OfflineCache.GUESTS, "w1", GuestDto.serializer())
        assertEquals(2, read?.size)
        assertEquals("Ayşe", read?.first()?.name)
        assertEquals("ATTENDING", read?.last()?.rsvp)
    }

    @Test
    fun `tek nesne yazilir ve okunur`() {
        val (cache, _) = newCache()
        val summary = BudgetSummaryDto(
            totalSpentKurus = "1200000",
            dueThisMonthKurus = "300000",
            remainingCommitmentKurus = "900000",
        )
        cache.put(OfflineCache.SUMMARY, "w1", BudgetSummaryDto.serializer(), summary)
        val read = cache.get(OfflineCache.SUMMARY, "w1", BudgetSummaryDto.serializer())
        assertEquals("1200000", read?.totalSpentKurus)
    }

    @Test
    fun `olmayan anahtar null`() {
        val (cache, _) = newCache()
        assertNull(cache.getList(OfflineCache.GUESTS, "yok", GuestDto.serializer()))
        assertNull(cache.get(OfflineCache.SUMMARY, "yok", BudgetSummaryDto.serializer()))
    }

    @Test
    fun `dugunler izole`() {
        val (cache, _) = newCache()
        cache.putList(
            OfflineCache.GUESTS, "w1", GuestDto.serializer(),
            listOf(GuestDto(id = "1", name = "Ayşe")),
        )
        cache.putList(
            OfflineCache.GUESTS, "w2", GuestDto.serializer(),
            listOf(GuestDto(id = "9", name = "Zeynep")),
        )
        assertEquals("Ayşe", cache.getList(OfflineCache.GUESTS, "w1", GuestDto.serializer())?.first()?.name)
        assertEquals("Zeynep", cache.getList(OfflineCache.GUESTS, "w2", GuestDto.serializer())?.first()?.name)
    }

    @Test
    fun `bozuk json null doner cokme yok`() {
        val (cache, tokens) = newCache()
        tokens.putCache("guests_w1", "{bozuk json")
        assertNull(cache.getList(OfflineCache.GUESTS, "w1", GuestDto.serializer()))
    }

    @Test
    fun `bos liste saklanabilir`() {
        val (cache, _) = newCache()
        cache.putList(OfflineCache.TASKS, "w1", TaskDto.serializer(), emptyList())
        val read = cache.getList(OfflineCache.TASKS, "w1", TaskDto.serializer())
        assertEquals(0, read?.size)
    }

    @Test
    fun `gorevler alanlari korunur`() {
        val (cache, _) = newCache()
        val tasks = listOf(
            TaskDto(
                id = "t1",
                title = "Nikah şahidini ara",
                status = "DOING",
                priority = "HIGH",
                assigneeHelperId = "h1",
            ),
        )
        cache.putList(OfflineCache.TASKS, "w1", TaskDto.serializer(), tasks)
        val read = cache.getList(OfflineCache.TASKS, "w1", TaskDto.serializer())!!.first()
        assertEquals("Nikah şahidini ara", read.title)
        assertEquals("DOING", read.status)
        assertEquals("h1", read.assigneeHelperId)
    }

    @Test
    fun `harcama kurus degeri bozulmaz`() {
        val (cache, _) = newCache()
        val expenses = listOf(
            ExpenseDto(id = "e1", title = "Salon", amountKurus = "1200050", installmentCount = 4),
        )
        cache.putList(OfflineCache.EXPENSES, "w1", ExpenseDto.serializer(), expenses)
        val read = cache.getList(OfflineCache.EXPENSES, "w1", ExpenseDto.serializer())!!.first()
        assertEquals("1200050", read.amountKurus, "kuruş string olarak korunmalı — float yuvarlaması olmamalı")
    }
}
