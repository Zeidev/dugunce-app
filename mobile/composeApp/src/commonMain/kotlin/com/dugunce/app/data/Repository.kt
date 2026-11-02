package com.dugunce.app.data

import com.dugunce.app.api.ApiClient
import com.dugunce.app.api.ApiErrorBody
import com.dugunce.app.api.ApiException
import com.dugunce.app.api.NetworkException
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.isSuccess

/**
 * API repository'si.
 *
 * Tüm hata dönüşümü burada: HTTP durum kodu → `ApiException`.
 * UI katmanı yalnızca `ApiException` görür (brief §16.3: "ağ çağrılarını
 * doğrudan composable içine gömme").
 *
 * 401 alınınca access token yenilenir ve istek BİR kez tekrarlanır; refresh
 * de başarısızsa `onSessionExpired` çağrılır ve çağıran oturumu kapatır.
 */
class Repository(
    private val api: ApiClient,
    private val tokens: TokenStore,
    private val onSessionExpired: () -> Unit = {},
) {
    private val json = api.json
    private val cache = OfflineCache(tokens, json)

    // --- Auth ---

    suspend fun requestMagicLink(email: String): Result<Unit> = safeCall {
        val res = api.http.post("auth/magic-link") {
            setBody(MagicLinkRequest(email))
        }
        ensureSuccess(res)
    }

    suspend fun verify(token: String): Result<AuthResponse> = safeCall {
        val res = api.http.post("auth/verify") {
            setBody(VerifyRequest(token = token))
        }
        ensureSuccess(res)
        res.body<AuthResponse>().also { storeTokens(it) }
    }

    suspend fun verifyCode(email: String, code: String): Result<AuthResponse> = safeCall {
        val res = api.http.post("auth/verify") {
            setBody(VerifyRequest(email = email, code = code))
        }
        ensureSuccess(res)
        res.body<AuthResponse>().also { storeTokens(it) }
    }

    /** Refresh token ile yeni access token. Başarısızsa oturum kapanır. */
    suspend fun refresh(): Result<Unit> = safeCall {
        val rt = tokens.refreshToken
        if (rt.isNullOrBlank()) throw ApiException(401, "NO_REFRESH", "Oturum süresi doldu")
        val res = api.http.post("auth/refresh") {
            setBody(RefreshRequest(rt))
        }
        ensureSuccess(res)
        val body = res.body<RefreshResponse>()
        tokens.accessToken = body.accessToken
        tokens.refreshToken = body.refreshToken
    }

    suspend fun logout(): Result<Unit> = safeCall {
        runCatching { api.http.post("auth/logout") }
        tokens.clear()
    }

    private fun storeTokens(auth: AuthResponse) {
        tokens.accessToken = auth.accessToken
        tokens.refreshToken = auth.refreshToken
        tokens.userId = auth.user.id
        tokens.userEmail = auth.user.email
    }

    // --- Düğün ---

    suspend fun listWeddings(): Result<List<WeddingDto>> = safeCall {
        val res = api.http.get("weddings")
        ensureSuccess(res)
        val list = res.body<WeddingListResponse>().weddings
        list.firstOrNull()?.let {
            cache.putList(OfflineCache.WEDDINGS, "all", WeddingDto.serializer(), list)
        }
        list
    }

    /** Önbellekteki düğünler — açılışta ağ yoksa (spec §11). */
    fun cachedWeddings(): List<WeddingDto>? =
        cache.getList(OfflineCache.WEDDINGS, "all", WeddingDto.serializer())

    suspend fun getWedding(weddingId: String): Result<WeddingDto> = safeCall {
        val res = api.http.get("weddings/$weddingId")
        ensureSuccess(res)
        res.body<WeddingResponse>().wedding
    }

    suspend fun createWedding(body: WeddingCreateRequest): Result<WeddingDto> = safeCall {
        val res = api.http.post("weddings") { setBody(body) }
        ensureSuccess(res)
        res.body<WeddingResponse>().wedding
    }

    suspend fun updateWedding(weddingId: String, body: WeddingCreateRequest): Result<WeddingDto> =
        safeCall {
            val res = api.http.patch("weddings/$weddingId") { setBody(body) }
            ensureSuccess(res)
            res.body<WeddingResponse>().wedding
        }

    // --- Bütçe ---

    suspend fun budgetSummary(weddingId: String, month: String? = null): Result<BudgetSummaryDto> =
        safeCall {
            val path = if (month != null) {
                "weddings/$weddingId/budget-summary?month=$month"
            } else {
                "weddings/$weddingId/budget-summary"
            }
            val res = api.http.get(path)
            ensureSuccess(res)
            val s = res.body<BudgetSummaryResponse>().summary
            cache.put(OfflineCache.SUMMARY, weddingId, BudgetSummaryDto.serializer(), s)
            s
        }

    /** Önbellekteki bütçe özeti — çevrimdışı görüntüleme. */
    fun cachedSummary(weddingId: String): BudgetSummaryDto? =
        cache.get(OfflineCache.SUMMARY, weddingId, BudgetSummaryDto.serializer())

    // --- Kategori (brief §5.3) ---

    suspend fun listCategories(weddingId: String): Result<List<CategoryDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/categories")
        ensureSuccess(res)
        res.body<CategoryListResponse>().categories
    }

    suspend fun createCategory(weddingId: String, name: String): Result<CategoryDto> = safeCall {
        val res = api.http.post("weddings/$weddingId/categories") {
            setBody(CategoryCreateRequest(name))
        }
        ensureSuccess(res)
        res.body<CategoryResponse>().category
    }

    // --- Kart (spec §6b.5) ---

    suspend fun listCards(weddingId: String): Result<List<CardDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/cards")
        ensureSuccess(res)
        res.body<CardListResponse>().cards
    }

    suspend fun createCard(weddingId: String, body: CardCreateRequest): Result<CardDto> = safeCall {
        val res = api.http.post("weddings/$weddingId/cards") { setBody(body) }
        ensureSuccess(res)
        res.body<CardResponse>().card
    }

    suspend fun deleteCard(weddingId: String, cardId: String): Result<Unit> = safeCall {
        val res = api.http.delete("weddings/$weddingId/cards/$cardId")
        ensureSuccess(res)
    }

    suspend fun listExpenses(weddingId: String): Result<List<ExpenseDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/expenses")
        ensureSuccess(res)
        val list = res.body<ExpenseListResponse>().expenses
        cache.putList(OfflineCache.EXPENSES, weddingId, ExpenseDto.serializer(), list)
        list
    }

    /** Önbellekteki harcamalar — çevrimdışı görüntüleme. */
    fun cachedExpenses(weddingId: String): List<ExpenseDto>? =
        cache.getList(OfflineCache.EXPENSES, weddingId, ExpenseDto.serializer())

    suspend fun getExpense(weddingId: String, expenseId: String): Result<ExpenseDto> = safeCall {
        val res = api.http.get("weddings/$weddingId/expenses/$expenseId")
        ensureSuccess(res)
        res.body<ExpenseResponse>().expense
    }

    suspend fun createExpense(weddingId: String, body: ExpenseCreateRequest): Result<ExpenseDto> =
        safeCall {
            val res = api.http.post("weddings/$weddingId/expenses") { setBody(body) }
            ensureSuccess(res)
            res.body<ExpenseResponse>().expense
        }

    suspend fun deleteExpense(weddingId: String, expenseId: String): Result<Unit> = safeCall {
        val res = api.http.delete("weddings/$weddingId/expenses/$expenseId")
        ensureSuccess(res)
    }

    suspend fun setInstallmentPaid(
        weddingId: String,
        installmentId: String,
        paid: Boolean,
    ): Result<Unit> = safeCall {
        val res = api.http.patch("weddings/$weddingId/installments/$installmentId") {
            setBody(mapOf("paid" to paid))
        }
        ensureSuccess(res)
    }

    // --- Davetli ---

    suspend fun listGuests(
        weddingId: String,
        side: String? = null,
        rsvp: String? = null,
    ): Result<List<GuestDto>> = safeCall {
        val query = queryString("side" to side, "rsvp" to rsvp)
        val res = api.http.get("weddings/$weddingId/guests$query")
        ensureSuccess(res)
        val list = res.body<GuestListResponse>().guests
        // Filtresiz liste önbelleğe yazılır — filtreli sonuç tam listeyi temsil etmez
        if (side == null && rsvp == null) {
            cache.putList(OfflineCache.GUESTS, weddingId, GuestDto.serializer(), list)
        }
        list
    }

    /** Önbellekteki davetliler — çevrimdışı görüntüleme (spec §11). */
    fun cachedGuests(weddingId: String): List<GuestDto>? =
        cache.getList(OfflineCache.GUESTS, weddingId, GuestDto.serializer())

    suspend fun guestUsage(weddingId: String): Result<GuestUsageDto> = safeCall {
        val res = api.http.get("weddings/$weddingId/guests/limit")
        ensureSuccess(res)
        res.body<GuestUsageResponse>().usage
    }

    suspend fun createGuest(weddingId: String, body: GuestCreateRequest): Result<GuestDto> =
        safeCall {
            val res = api.http.post("weddings/$weddingId/guests") { setBody(body) }
            ensureSuccess(res)
            res.body<GuestResponse>().guest
        }

    suspend fun createGuestsBulk(
        weddingId: String,
        guests: List<GuestCreateRequest>,
    ): Result<List<GuestDto>> = safeCall {
        val res = api.http.post("weddings/$weddingId/guests/bulk") {
            setBody(mapOf("guests" to guests))
        }
        ensureSuccess(res)
        res.body<GuestListResponse>().guests
    }

    suspend fun updateGuest(
        weddingId: String,
        guestId: String,
        body: GuestPatchRequest,
    ): Result<GuestDto> = safeCall {
        val res = api.http.patch("weddings/$weddingId/guests/$guestId") { setBody(body) }
        ensureSuccess(res)
        res.body<GuestResponse>().guest
    }

    /**
     * Davetliyi siler.
     *
     * Backend'de DELETE `/weddings/:id/guests/:gid` var (204). PATCH yolu
     * `deleted` alanını KABUL ETMEZ: `patchSchema` bilinmeyen alanı
     * `.strip()` ile atar, geriye boş nesne kalınca "Güncelleme boş olamaz"
     * hatası döner.
     */
    suspend fun deleteGuest(weddingId: String, guestId: String): Result<Unit> = safeCall {
        val res = api.http.delete("weddings/$weddingId/guests/$guestId")
        ensureSuccess(res)
    }

    suspend fun setGuestRsvp(
        weddingId: String,
        guestId: String,
        rsvp: String,
        partySize: Int? = null,
    ): Result<GuestDto> = safeCall {
        val res = api.http.patch("weddings/$weddingId/guests/$guestId/rsvp") {
            setBody(GuestRsvpRequest(rsvp = rsvp, partySize = partySize))
        }
        ensureSuccess(res)
        res.body<GuestResponse>().guest
    }

    suspend fun createInvitation(
        weddingId: String,
        guestId: String,
    ): Result<InvitationResponse> = safeCall {
        val res = api.http.post("weddings/$weddingId/guests/$guestId/invitation")
        ensureSuccess(res)
        res.body<InvitationResponse>()
    }

    // --- Görev ---

    suspend fun listTasks(
        weddingId: String,
        status: String? = null,
        assigneeHelperId: String? = null,
    ): Result<List<TaskDto>> = safeCall {
        val query = queryString("status" to status, "assigneeHelperId" to assigneeHelperId)
        val res = api.http.get("weddings/$weddingId/tasks$query")
        ensureSuccess(res)
        val list = res.body<TaskListResponse>().tasks
        if (status == null && assigneeHelperId == null) {
            cache.putList(OfflineCache.TASKS, weddingId, TaskDto.serializer(), list)
        }
        list
    }

    /** Önbellekteki görevler — çevrimdışı görüntüleme. */
    fun cachedTasks(weddingId: String): List<TaskDto>? =
        cache.getList(OfflineCache.TASKS, weddingId, TaskDto.serializer())

    suspend fun createTask(weddingId: String, body: TaskCreateRequest): Result<TaskDto> = safeCall {
        val res = api.http.post("weddings/$weddingId/tasks") { setBody(body) }
        ensureSuccess(res)
        res.body<TaskResponse>().task
    }

    suspend fun updateTask(
        weddingId: String,
        taskId: String,
        body: TaskPatchRequest,
    ): Result<TaskDto> = safeCall {
        val res = api.http.patch("weddings/$weddingId/tasks/$taskId") { setBody(body) }
        ensureSuccess(res)
        res.body<TaskResponse>().task
    }

    suspend fun deleteTask(weddingId: String, taskId: String): Result<Unit> = safeCall {
        val res = api.http.delete("weddings/$weddingId/tasks/$taskId")
        ensureSuccess(res)
    }

    suspend fun updateTaskStatus(
        weddingId: String,
        taskId: String,
        status: String,
    ): Result<TaskDto> = updateTask(weddingId, taskId, TaskPatchRequest(status = status))

    suspend fun assignTask(
        weddingId: String,
        taskId: String,
        helperId: String?,
    ): Result<TaskDto> = safeCall {
        val res = api.http.patch("weddings/$weddingId/tasks/$taskId/assign") {
            setBody(TaskAssignRequest(helperId))
        }
        ensureSuccess(res)
        res.body<TaskResponse>().task
    }

    // --- Yardımcı ---

    suspend fun listHelpers(weddingId: String): Result<List<HelperDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/helpers")
        ensureSuccess(res)
        res.body<HelperListResponse>().helpers
    }

    suspend fun createHelper(
        weddingId: String,
        displayName: String,
    ): Result<HelperCreatedResponse> = safeCall {
        val res = api.http.post("weddings/$weddingId/helpers") {
            setBody(HelperCreateRequest(displayName))
        }
        ensureSuccess(res)
        res.body<HelperCreatedResponse>()
    }

    suspend fun revokeHelper(weddingId: String, helperId: String): Result<Unit> = safeCall {
        val res = api.http.post("weddings/$weddingId/helpers/$helperId/revoke")
        ensureSuccess(res)
    }

    suspend fun deleteHelper(weddingId: String, helperId: String): Result<Unit> = safeCall {
        val res = api.http.delete("weddings/$weddingId/helpers/$helperId")
        ensureSuccess(res)
    }

    // --- Sohbet ---

    suspend fun listMessages(
        weddingId: String,
        taskId: String,
        limit: Int = 30,
        before: String? = null,
    ): Result<List<MessageDto>> = safeCall {
        val path = buildString {
            append("weddings/$weddingId/tasks/$taskId/messages?limit=$limit")
            if (before != null) append("&before=$before")
        }
        val res = api.http.get(path)
        ensureSuccess(res)
        res.body<MessageListResponse>().messages
    }

    suspend fun sendMessage(
        weddingId: String,
        taskId: String,
        body: String,
        idempotencyKey: String? = null,
    ): Result<MessageDto> = safeCall {
        val res = api.http.post("weddings/$weddingId/tasks/$taskId/messages") {
            setBody(MessageSendRequest(body = body, idempotencyKey = idempotencyKey))
        }
        ensureSuccess(res)
        res.body<MessageResponse>().message
    }

    // --- Davet kodu (2. eş) ---

    suspend fun createInvite(
        weddingId: String,
        role: String = "CO_OWNER",
    ): Result<InviteResponse> = safeCall {
        val res = api.http.post("weddings/$weddingId/invites") {
            setBody(InviteCreateRequest(role = role))
        }
        ensureSuccess(res)
        res.body<InviteResponse>()
    }

    suspend fun acceptInvite(code: String): Result<Unit> = safeCall {
        val res = api.http.post("invites/accept") { setBody(InviteAcceptRequest(code)) }
        ensureSuccess(res)
    }

    // -----------------------------------------------------------------------
    // Ortak
    // -----------------------------------------------------------------------

    /**
     * Query string kurar — null değerler atlanır.
     *
     * `null` dönerse parametre yok. Değerler URL-encode edilir; `&`/`?`
     * mantığını her çağrıda elle yazmak hata kaynağıydı.
     */
    internal fun queryString(vararg params: Pair<String, String?>): String {
        val parts = params.mapNotNull { (k, v) ->
            if (v == null) null else "$k=${urlEncode(v)}"
        }
        return if (parts.isEmpty()) "" else "?" + parts.joinToString("&")
    }

    /** Yalnızca ASCII güvenli karakterler bırakır. */
    internal fun urlEncode(value: String): String {
        val sb = StringBuilder()
        for (ch in value) {
            if ((ch in 'a'..'z') || (ch in 'A'..'Z') || (ch in '0'..'9') || ch in "-_.~") {
                sb.append(ch)
            } else {
                for (b in ch.toString().encodeToByteArray()) {
                    sb.append('%')
                    sb.append(HEX_CHARS[(b.toInt() shr 4) and 0xF])
                    sb.append(HEX_CHARS[b.toInt() and 0xF])
                }
            }
        }
        return sb.toString()
    }

    /**
     * Başarısız yanıtı `ApiException`'a çevirir.
     *
     * 401 görülürse bir kez token yenilenir ve istek tekrarlanır; bu da
     * başarısızsa oturum kapatılır (brief §15.1).
     */
    private suspend fun ensureSuccess(res: HttpResponse) {
        if (res.status.isSuccess()) return
        if (res.status.value == 401) {
            val refreshed = refresh().isSuccess
            if (!refreshed) {
                onSessionExpired()
                throw res.toApiException()
            }
        }
        throw res.toApiException()
    }

    private suspend fun HttpResponse.toApiException(): ApiException {
        val status = status.value
        val text = runCatching { body<String>() }.getOrNull()

        val parsed = text?.let {
            runCatching { json.decodeFromString<ApiErrorBody>(it) }.getOrNull()
        }

        return if (parsed != null) {
            ApiException(
                statusCode = status,
                code = parsed.error.code,
                message = parsed.error.message,
                details = parsed.error.details,
            )
        } else {
            ApiException(
                statusCode = status,
                code = "UNKNOWN",
                message = "Beklenmeyen bir hata oluştu ($status)",
            )
        }
    }

    private companion object {
        const val HEX_CHARS = "0123456789ABCDEF"
    }

    private suspend fun <T> safeCall(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: ApiException) {
        Result.failure(e)
    } catch (e: Throwable) {
        Result.failure(NetworkException(e.message ?: "Bağlantı hatası"))
    }
}
