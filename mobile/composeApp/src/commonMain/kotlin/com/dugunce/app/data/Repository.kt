package com.dugunce.app.data

import com.dugunce.app.api.ApiClient
import com.dugunce.app.api.ApiErrorBody
import com.dugunce.app.api.ApiException
import com.dugunce.app.api.NetworkException
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json

/**
 * API repository'si.
 *
 * Tüm hata dönüşümü burada: HTTP durum kodu → `ApiException`.
 * UI katmanı yalnızca `ApiException` görür.
 */
class Repository(
    private val api: ApiClient,
    private val tokens: TokenStore,
) {
    private val json = api.json

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
        res.body<AuthResponse>()
    }

    suspend fun verifyCode(email: String, code: String): Result<AuthResponse> = safeCall {
        val res = api.http.post("auth/verify") {
            setBody(VerifyRequest(email = email, code = code))
        }
        ensureSuccess(res)
        res.body<AuthResponse>()
    }

    // --- Düğün ---

    suspend fun listWeddings(): Result<List<WeddingDto>> = safeCall {
        val res = api.http.get("weddings")
        ensureSuccess(res)
        res.body<WeddingListResponse>().weddings
    }

    // --- Bütçe ---

    suspend fun budgetSummary(weddingId: String, month: String? = null): Result<BudgetSummaryDto> = safeCall {
        val path = if (month != null) {
            "weddings/$weddingId/budget-summary?month=$month"
        } else {
            "weddings/$weddingId/budget-summary"
        }
        val res = api.http.get(path)
        ensureSuccess(res)
        res.body<BudgetSummaryResponse>().summary
    }

    suspend fun listExpenses(weddingId: String): Result<List<ExpenseDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/expenses")
        ensureSuccess(res)
        res.body<ExpenseListResponse>().expenses
    }

    suspend fun createExpense(weddingId: String, body: ExpenseCreateRequest): Result<Unit> = safeCall {
        val res = api.http.post("weddings/$weddingId/expenses") {
            setBody(body)
        }
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

    suspend fun listGuests(weddingId: String): Result<List<GuestDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/guests")
        ensureSuccess(res)
        res.body<GuestListResponse>().guests
    }

    suspend fun guestUsage(weddingId: String): Result<GuestUsageDto> = safeCall {
        val res = api.http.get("weddings/$weddingId/guests/limit")
        ensureSuccess(res)
        res.body<GuestUsageResponse>().usage
    }

    suspend fun createGuest(weddingId: String, body: GuestCreateRequest): Result<Unit> = safeCall {
        val res = api.http.post("weddings/$weddingId/guests") {
            setBody(body)
        }
        ensureSuccess(res)
    }

    suspend fun deleteGuest(weddingId: String, guestId: String): Result<Unit> = safeCall {
        val res = api.http.patch("weddings/$weddingId/guests/$guestId") {
            setBody(mapOf("deleted" to true))
        }
        // DELETE yok, PATCH ile soft delete
        ensureSuccess(res)
    }

    // --- Görev ---

    suspend fun listTasks(weddingId: String): Result<List<TaskDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/tasks")
        ensureSuccess(res)
        res.body<TaskListResponse>().tasks
    }

    suspend fun createTask(weddingId: String, body: TaskCreateRequest): Result<Unit> = safeCall {
        val res = api.http.post("weddings/$weddingId/tasks") {
            setBody(body)
        }
        ensureSuccess(res)
    }

    suspend fun updateTaskStatus(
        weddingId: String,
        taskId: String,
        status: String,
    ): Result<Unit> = safeCall {
        val res = api.http.patch("weddings/$weddingId/tasks/$taskId") {
            setBody(mapOf("status" to status))
        }
        ensureSuccess(res)
    }

    suspend fun listHelpers(weddingId: String): Result<List<HelperDto>> = safeCall {
        val res = api.http.get("weddings/$weddingId/helpers")
        ensureSuccess(res)
        res.body<HelperListResponse>().helpers
    }

    suspend fun assignTask(
        weddingId: String,
        taskId: String,
        helperId: String?,
    ): Result<Unit> = safeCall {
        val res = api.http.patch("weddings/$weddingId/tasks/$taskId/assign") {
            setBody(mapOf("helperId" to helperId))
        }
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
            setBody(
                MessageSendRequest(
                    body = body,
                    idempotencyKey = idempotencyKey,
                ),
            )
        }
        ensureSuccess(res)
        res.body<MessageSendResponse>().message
    }

    // --- Yardımcı ---

    private fun ensureSuccess(res: HttpResponse) {
        if (res.status.isSuccess()) return
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

    private suspend fun <T> safeCall(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: ApiException) {
        Result.failure(e)
    } catch (e: Throwable) {
        // Ağ hatası — sunucuya ulaşılamadı
        Result.failure(NetworkException(e.message ?: "Bağlantı hatası"))
    }
}

// --- İstek gövdeleri ---

@kotlinx.serialization.Serializable
data class ExpenseListResponse(val expenses: List<ExpenseDto>)

@kotlinx.serialization.Serializable
data class ExpenseCreateRequest(
    val title: String,
    val amount: String,
    val purchaseDate: String,
    val paidBySide: String = "SHARED",
    val installmentCount: Int = 1,
    val firstInstallmentMonth: String? = null,
)

@kotlinx.serialization.Serializable
data class GuestCreateRequest(
    val name: String,
    val phone: String? = null,
    val side: String = "BRIDE",
)

@kotlinx.serialization.Serializable
data class TaskCreateRequest(
    val title: String,
    val description: String? = null,
    val priority: String = "NORMAL",
)

@kotlinx.serialization.Serializable
data class MessageSendRequest(
    val body: String,
    val idempotencyKey: String? = null,
)

@kotlinx.serialization.Serializable
data class MessageSendResponse(val message: MessageDto)
