package com.dugunce.app.data

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * DTO sözleşme testi — EN KRİTİK TEST.
 *
 * Backend gerçek yanıtları burada sabitlenmiş JSON olarak durur; her DTO
 * bunlarla çözülür. Snake_case/camelCase uyuşmazlığı bu testi kırar.
 *
 * Kaynak: `guestStore.listByWedding` gerçek çıktısı (PGlite probe) ve
 * backend `store.ts` dosyalarındaki select blokları.
 */
class DtoContractTest {

    /**
     * ÜRETİM yapılandırmasının AYNISI (ApiClient.json).
     *
     * `encodeDefaults = true` olmadan varsayılan değerler gövdeye
     * yazılmaz; backend `side` alanını göremez. Test bu yüzden üretim
     * ayarını birebir kullanır.
     */
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = false
        explicitNulls = false
        encodeDefaults = true
    }

    // --- Gerçek backend yanıtları ---

    /** `weddings/store.ts` → `listByUser` select bloğu. */
    private val weddingJson = """
        {
          "id": "1fe2767b-7fb8-4f58-8161-05d18be3c082",
          "coupleNames": "Elif & Mert",
          "weddingDate": "2026-09-12T00:00:00.000Z",
          "timezone": "Europe/Istanbul",
          "venueName": "Kır Bahçesi",
          "venueAddress": "Beykoz, İstanbul",
          "mapUrl": null,
          "giftNote": null,
          "rsvpDeadline": null,
          "program": null,
          "plan": "PREMIUM",
          "status": "ACTIVE",
          "createdAt": "2026-11-02T10:00:00.000Z",
          "role": "OWNER"
        }
    """.trimIndent()

    /** Probe çıktısı: `["id","weddingId","name","phone","side","inviteStatus","rsvp","note","deletedAt"]` */
    private val guestJson = """
        {
          "id": "16cb5abb-1cc5-4eb7-ad9d-a0e5f46967e3",
          "weddingId": "1fe2767b-7fb8-4f58-8161-05d18be3c082",
          "name": "Ayşe",
          "phone": "+905551112233",
          "side": "BRIDE",
          "inviteStatus": "NOT_SENT",
          "rsvp": "PENDING",
          "note": null,
          "deletedAt": null
        }
    """.trimIndent()

    /** `expenses/store.ts` select bloğu. */
    private val expenseJson = """
        {
          "id": "e1",
          "weddingId": "w1",
          "title": "Düğün salonu",
          "description": null,
          "amountKurus": "1200000",
          "paidBySide": "SHARED",
          "paidByPersonId": null,
          "paymentMethod": "CARD",
          "paymentStatus": "PAID",
          "categoryId": null,
          "cardId": null,
          "installmentCount": 4,
          "firstInstallmentMonth": "2026-01",
          "purchaseDate": "2026-01-05T00:00:00.000Z",
          "createdAt": "2026-11-02T10:00:00.000Z"
        }
    """.trimIndent()

    /** `expenses/summary.ts` → BudgetSummary. */
    private val summaryJson = """
        {
          "totalSpentKurus": "1200000",
          "dueThisMonthKurus": "300000",
          "remainingCommitmentKurus": "900000",
          "bySide": { "bride": "600000", "groom": "600000", "shared": "0" },
          "byCategory": [ { "categoryName": "Mekân", "totalKurus": "1200000" } ],
          "installmentSchedule": [ { "month": "2026-01", "totalKurus": "300000" } ]
        }
    """.trimIndent()

    /** `tasks/store.ts` → `taskColumns`. */
    private val taskJson = """
        {
          "id": "t1",
          "weddingId": "w1",
          "title": "Nikah şahidini ara",
          "description": null,
          "assigneeHelperId": "h1",
          "status": "TODO",
          "priority": "NORMAL",
          "dueDate": "2026-08-01T00:00:00.000Z",
          "assignedAt": "2026-11-02T10:00:00.000Z",
          "deletedAt": null,
          "createdAt": "2026-11-02T10:00:00.000Z",
          "updatedAt": "2026-11-02T10:00:00.000Z"
        }
    """.trimIndent()

    /** `helpers/store.ts` → `helperColumns`. */
    private val helperJson = """
        {
          "id": "h1",
          "weddingId": "w1",
          "displayName": "Ayşe",
          "tokenRevokedAt": null,
          "lastSeenAt": null,
          "createdAt": "2026-11-02T10:00:00.000Z"
        }
    """.trimIndent()

    /** `messages/helper-view.ts` beyaz listesi. */
    private val messageJson = """
        {
          "id": "m1",
          "senderKind": "HELPER",
          "body": "Görevi aldım",
          "createdAt": "2026-11-02T10:00:00.000Z"
        }
    """.trimIndent()

    private val authJson = """
        {
          "accessToken": "eyJhbGciOiJIUzI1NiJ9.x.y",
          "refreshToken": "rt-abc",
          "expiresIn": 900,
          "user": { "id": "u1", "email": "e@x.com", "displayName": "Elif" }
        }
    """.trimIndent()

    private val usageJson = """
        { "limit": 30, "used": 12, "remaining": 18, "plan": "FREE" }
    """.trimIndent()

    // --- Testler ---

    @Test
    fun `wedding camelCase alanlari cozer`() {
        val w = json.decodeFromString<WeddingDto>(weddingJson)
        assertEquals("Elif & Mert", w.coupleNames, "coupleNames boş geldi — @SerialName uyuşmazlığı")
        assertNotNull(w.weddingDate)
        assertEquals("Kır Bahçesi", w.venueName)
        assertEquals("PREMIUM", w.plan)
        assertEquals("OWNER", w.role)
    }

    @Test
    fun `guest camelCase alanlari cozer`() {
        val g = json.decodeFromString<GuestDto>(guestJson)
        assertEquals("Ayşe", g.name)
        assertEquals("BRIDE", g.side)
        assertEquals("NOT_SENT", g.inviteStatus, "inviteStatus boş geldi")
        assertEquals("PENDING", g.rsvp)
        assertEquals("+905551112233", g.phone)
    }

    @Test
    fun `expense tutar ve taksit alanlari cozer`() {
        val e = json.decodeFromString<ExpenseDto>(expenseJson)
        assertEquals("1200000", e.amountKurus, "amountKurus boş geldi")
        assertEquals("SHARED", e.paidBySide)
        assertEquals("CARD", e.paymentMethod)
        assertEquals(4, e.installmentCount)
        assertEquals("2026-01", e.firstInstallmentMonth)
    }

    @Test
    fun `budget summary uc rakami ayri cozer`() {
        val s = json.decodeFromString<BudgetSummaryDto>(summaryJson)
        // SECURITY §10.1 #7: iki rakam karışmamalı
        assertEquals("1200000", s.totalSpentKurus)
        assertEquals("300000", s.dueThisMonthKurus)
        assertEquals("900000", s.remainingCommitmentKurus)
        assertEquals(1, s.byCategory.size)
        assertEquals("Mekân", s.byCategory[0].categoryName)
        assertEquals(1, s.installmentSchedule.size)
        assertEquals("2026-01", s.installmentSchedule[0].month)
    }

    @Test
    fun `summary toplam tutarliligi korunur`() {
        val s = json.decodeFromString<BudgetSummaryDto>(summaryJson)
        val total = s.totalSpentKurus.toLong()
        val due = s.dueThisMonthKurus.toLong()
        val remaining = s.remainingCommitmentKurus.toLong()
        assertEquals(total, due + remaining, "toplam = bu ay + kalan olmalı")
    }

    @Test
    fun `task alanlari cozer`() {
        val t = json.decodeFromString<TaskDto>(taskJson)
        assertEquals("Nikah şahidini ara", t.title)
        assertEquals("TODO", t.status)
        assertEquals("h1", t.assigneeHelperId)
        assertNotNull(t.assignedAt)
    }

    @Test
    fun `helper alanlari cozer`() {
        val h = json.decodeFromString<HelperDto>(helperJson)
        assertEquals("Ayşe", h.displayName, "displayName boş geldi")
        assertEquals(null, h.tokenRevokedAt)
    }

    @Test
    fun `message beyaz liste alanlari`() {
        val m = json.decodeFromString<MessageDto>(messageJson)
        assertEquals("HELPER", m.senderKind)
        assertEquals("Görevi aldım", m.body)
    }

    @Test
    fun `auth yaniti token ve kullanici`() {
        val a = json.decodeFromString<AuthResponse>(authJson)
        assertTrue(a.accessToken.isNotBlank())
        assertEquals("rt-abc", a.refreshToken)
        assertEquals(900, a.expiresIn)
        assertEquals("Elif", a.user.displayName)
    }

    @Test
    fun `guest usage limiti cozer`() {
        val u = json.decodeFromString<GuestUsageDto>(usageJson)
        assertEquals(30, u.limit)
        assertEquals(12, u.used)
        assertEquals(18, u.remaining)
        assertEquals("FREE", u.plan)
    }

    @Test
    fun `bilinmeyen alan istemciyi kirmaz`() {
        val withExtra = """
            { "id": "x", "coupleNames": "A & B", "yeniAlan": 42, "baska": { "a": 1 } }
        """.trimIndent()
        val w = json.decodeFromString<WeddingDto>(withExtra)
        assertEquals("A & B", w.coupleNames)
    }

    @Test
    fun `eksik optional alan null kalir`() {
        val minimal = """{ "id": "x", "coupleNames": "A & B" }"""
        val w = json.decodeFromString<WeddingDto>(minimal)
        assertEquals(null, w.weddingDate)
        assertEquals("FREE", w.plan)
        assertEquals("Europe/Istanbul", w.timezone)
    }

    @Test
    fun `serilestirme camelCase uretir`() {
        // İstek gövdeleri backend'in beklediği adlarla gitmeli
        val req = ExpenseCreateRequest(
            title = "Test",
            amount = "120000",
            purchaseDate = "2026-01-05",
            installmentCount = 4,
            firstInstallmentMonth = "2026-01",
        )
        val encoded = json.encodeToString(ExpenseCreateRequest.serializer(), req)
        assertTrue(encoded.contains("\"purchaseDate\""), "purchaseDate camelCase olmalı: $encoded")
        assertTrue(encoded.contains("\"installmentCount\""))
        assertTrue(encoded.contains("\"firstInstallmentMonth\""))
        assertTrue(!encoded.contains("purchase_date"), "snake_case sızmamalı")
    }

    @Test
    fun `davetiye yaniti id alani ISTEMEZ`() {
        // Backend yalnızca { token, expiresAt, url } döndürür.
        // `id` zorunlu tutulunca serileştirme patlıyordu — bildirilen hata:
        //   Illegal input: Field 'id' is required for type with serial
        //   name 'com.dugunce.app.data.InvitationDto'
        val raw = """{"invitation":{"token":"abc","expiresAt":"2026-12-01T00:00:00.000Z","url":"/d#abc"}}"""
        val r = json.decodeFromString<InvitationResponse>(raw)
        assertEquals("abc", r.invitation?.token)
        assertEquals("/d#abc", r.invitation?.url)
    }

    @Test
    fun `davetiye yaniti bos govde ile de cozulur`() {
        val r = json.decodeFromString<InvitationResponse>("""{"invitation":{}}""")
        assertEquals(null, r.invitation?.token)
    }

    @Test
    fun `guest istek govdesi camelCase`() {
        val req = GuestCreateRequest(name = "Ayşe", phone = null, side = "BRIDE")
        val encoded = json.encodeToString(GuestCreateRequest.serializer(), req)
        assertTrue(encoded.contains("\"name\""))
        assertTrue(encoded.contains("\"side\""))
    }
}
