package com.dugunce.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * API veri modelleri.
 *
 * Backend sözleşmesiyle BİREBİR eşleşir. Alan eklenirse
 * `ignoreUnknownKeys` sayesinde istemci kırılmaz.
 */

// --- Auth ---

@Serializable
data class MagicLinkRequest(val email: String)

@Serializable
data class MagicLinkResponse(val ok: Boolean = true)

@Serializable
data class VerifyRequest(
    val token: String? = null,
    val email: String? = null,
    val code: String? = null,
)

@Serializable
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Int,
    val user: UserDto,
)

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
)

// --- Düğün ---

@Serializable
data class WeddingDto(
    val id: String,
    @SerialName("couple_names") val coupleNames: String,
    @SerialName("wedding_date") val weddingDate: String? = null,
    val timezone: String = "Europe/Istanbul",
    @SerialName("venue_name") val venueName: String? = null,
    @SerialName("venue_address") val venueAddress: String? = null,
    @SerialName("map_url") val mapUrl: String? = null,
    @SerialName("gift_note") val giftNote: String? = null,
    val plan: String = "FREE",
    val status: String = "ACTIVE",
)

@Serializable
data class WeddingListResponse(val weddings: List<WeddingDto>)

// --- Bütçe ---

@Serializable
data class ExpenseDto(
    val id: String,
    val title: String,
    val description: String? = null,
    @SerialName("amountKurus") val amountKurus: String,
    @SerialName("paidBySide") val paidBySide: String = "SHARED",
    @SerialName("paymentMethod") val paymentMethod: String = "CASH",
    @SerialName("installmentCount") val installmentCount: Int? = null,
    @SerialName("purchaseDate") val purchaseDate: String? = null,
    val installments: List<InstallmentDto> = emptyList(),
)

@Serializable
data class InstallmentDto(
    val id: String,
    val number: Int,
    @SerialName("amountKurus") val amountKurus: String,
    @SerialName("dueMonth") val dueMonth: String,
    val status: String = "PENDING",
    @SerialName("paidAt") val paidAt: String? = null,
)

@Serializable
data class BudgetSummaryDto(
    @SerialName("totalSpentKurus") val totalSpentKurus: String,
    @SerialName("dueThisMonthKurus") val dueThisMonthKurus: String,
    @SerialName("remainingCommitmentKurus") val remainingCommitmentKurus: String,
    @SerialName("bySide") val bySide: SideBreakdownDto? = null,
    @SerialName("byCategory") val byCategory: List<CategoryBreakdownDto> = emptyList(),
    @SerialName("installmentSchedule") val installmentSchedule: List<MonthTotalDto> = emptyList(),
)

@Serializable
data class SideBreakdownDto(
    @SerialName("BRIDE") val bride: String = "0",
    @SerialName("GROOM") val groom: String = "0",
    @SerialName("SHARED") val shared: String = "0",
)

@Serializable
data class CategoryBreakdownDto(
    @SerialName("categoryName") val categoryName: String,
    @SerialName("totalKurus") val totalKurus: String,
)

@Serializable
data class MonthTotalDto(
    val month: String,
    @SerialName("totalKurus") val totalKurus: String,
)

@Serializable
data class BudgetSummaryResponse(val summary: BudgetSummaryDto)

// --- Davetli ---

@Serializable
data class GuestDto(
    val id: String,
    val name: String,
    val phone: String? = null,
    val side: String = "BRIDE",
    val rsvp: String = "PENDING",
    @SerialName("inviteStatus") val inviteStatus: String = "NOT_SENT",
    val note: String? = null,
)

@Serializable
data class GuestListResponse(val guests: List<GuestDto>)

@Serializable
data class GuestUsageDto(
    val limit: Int? = null,
    val used: Int,
    val remaining: Int? = null,
    val plan: String = "FREE",
)

@Serializable
data class GuestUsageResponse(val usage: GuestUsageDto)

// --- Görev ---

@Serializable
data class TaskDto(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: String = "TODO",
    val priority: String = "NORMAL",
    @SerialName("dueDate") val dueDate: String? = null,
    @SerialName("assigneeHelperId") val assigneeHelperId: String? = null,
)

@Serializable
data class TaskListResponse(val tasks: List<TaskDto>)

@Serializable
data class HelperDto(
    val id: String,
    @SerialName("displayName") val displayName: String,
    @SerialName("tokenRevokedAt") val tokenRevokedAt: String? = null,
)

@Serializable
data class HelperListResponse(val helpers: List<HelperDto>)

@Serializable
data class MessageDto(
    val id: String,
    val body: String,
    @SerialName("senderKind") val senderKind: String,
    @SerialName("createdAt") val createdAt: String,
)

@Serializable
data class MessageListResponse(val messages: List<MessageDto>)
