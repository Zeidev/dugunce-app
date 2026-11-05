package com.lumibyte.dugunce.data

import kotlinx.serialization.Serializable

/**
 * API veri modelleri.
 *
 * **KRİTİK:** Backend, Drizzle'dan dönen nesneleri **camelCase** olarak
 * serileştirir (`coupleNames`, `weddingDate`, `amountKurus`, `inviteStatus`).
 * Snake_case `@SerialName` kullanmak alanların sessizce boş gelmesine yol
 * açar — bu yüzden `@SerialName` YALNIZCA gerçekten farklı ad gerektiğinde
 * kullanılır.
 *
 * Kanıt: `guestStore.listByWedding` çıktısı
 * `["id","weddingId","name","phone","side","inviteStatus","rsvp","note","deletedAt"]`
 *
 * Her DTO `DtoContractTest` içinde gerçek backend JSON'u ile çözülür.
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
    /**
     * Backend bu alanı GÖNDERMİYOR (`routes/auth.ts` yalnızca
     * accessToken/refreshToken/user döner). Zorunlu tutmak, doğrulama
     * başarılı olsa bile JSON çözümlemesini patlatıyordu.
     */
    val expiresIn: Int = 900,
    val user: UserDto,
)

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    val displayName: String? = null,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class RefreshResponse(val refreshToken: String, val accessToken: String? = null)

// --- Düğün ---

@Serializable
data class WeddingDto(
    val id: String,
    val coupleNames: String,
    val weddingDate: String? = null,
    val timezone: String = "Europe/Istanbul",
    val venueName: String? = null,
    val venueAddress: String? = null,
    val venueLat: String? = null,
    val venueLng: String? = null,
    val mapUrl: String? = null,
    val giftNote: String? = null,
    val rsvpDeadline: String? = null,
    val program: List<ProgramItemDto>? = null,
    val plan: String = "FREE",
    val status: String = "ACTIVE",
    val role: String? = null,
    val createdAt: String? = null,
    /** Davetiye şablonu — `TemplateScreen` içindeki anahtarlarla aynı. */
    val template: String = "ZARIF",
    /** Seçilen font; boş dize "şablonun önerileni" demektir. */
    val fontKey: String = "",
    /** Davetliye "kaç kişi" sorusu sorulsun mu. */
    val partySizeEnabled: Boolean = true,
    /** Yeni davetiyenin başlangıç izni. */
    val defaultPartySize: Int = 2,
    /** Çiftin izin verdiği üst sınır. */
    val maxPartySize: Int = 10,
    /** Davetiye karşılama metni — PREMIUM özellik; boşsa varsayılan. */
    val invitationMessage: String? = null,
)

@Serializable
data class ProgramItemDto(
    val time: String,
    val title: String,
    val note: String? = null,
)

@Serializable
data class WeddingListResponse(val weddings: List<WeddingDto>)

@Serializable
data class WeddingResponse(val wedding: WeddingDto)

@Serializable
data class WeddingCreateRequest(
    val coupleNames: String,
    val weddingDate: String,
    val timezone: String = "Europe/Istanbul",
    val venueName: String? = null,
    val venueAddress: String? = null,
    val mapUrl: String? = null,
    val giftNote: String? = null,
    val rsvpDeadline: String? = null,
    /** Yalnız güncellemede gönderilir; oluşturmada sunucu varsayılanı kullanır. */
    val template: String? = null,
    val fontKey: String? = null,
)

/**
 * Kısmi düğün güncellemesi.
 *
 * `WeddingCreateRequest`'ten farkı: TÜM alanlar opsiyonel. `PATCH` yalnız
 * gönderilen alanları değiştirir; gönderilmeyenler sunucuda korunur.
 * Oluşturma için `WeddingCreateRequest` kullanılmaya devam eder.
 */
@Serializable
data class WeddingPatchRequest(
    val coupleNames: String? = null,
    val weddingDate: String? = null,
    val timezone: String? = null,
    val venueName: String? = null,
    val venueAddress: String? = null,
    val mapUrl: String? = null,
    val giftNote: String? = null,
    val rsvpDeadline: String? = null,
    val template: String? = null,
    val fontKey: String? = null,
    val partySizeEnabled: Boolean? = null,
    val defaultPartySize: Int? = null,
    val maxPartySize: Int? = null,
    val invitationMessage: String? = null,
)

// --- Bütçe ---

@Serializable
data class ExpenseDto(
    val id: String,
    val title: String,
    val description: String? = null,
    val amountKurus: String,
    val paidBySide: String = "SHARED",
    val paidByPersonId: String? = null,
    val paymentMethod: String = "CASH",
    val paymentStatus: String = "PAID",
    val categoryId: String? = null,
    val cardId: String? = null,
    val installmentCount: Int? = null,
    val firstInstallmentMonth: String? = null,
    val purchaseDate: String? = null,
    val installments: List<InstallmentDto> = emptyList(),
    val createdAt: String? = null,
)

@Serializable
data class InstallmentDto(
    val id: String,
    val installmentNumber: Int = 0,
    val number: Int = 0,
    val amountKurus: String,
    val dueMonth: String,
    val status: String = "PENDING",
    val paidAt: String? = null,
)

@Serializable
data class ExpenseListResponse(val expenses: List<ExpenseDto>)

@Serializable
data class ExpenseResponse(val expense: ExpenseDto)

@Serializable
data class ExpenseCreateRequest(
    val title: String,
    val amount: String,
    val purchaseDate: String,
    val description: String? = null,
    val categoryId: String? = null,
    val paidBySide: String = "SHARED",
    val paidByPersonId: String? = null,
    val paymentMethod: String = "CASH",
    val paymentStatus: String = "PAID",
    val cardId: String? = null,
    val installmentCount: Int? = null,
    val firstInstallmentMonth: String? = null,
)

@Serializable
data class BudgetSummaryDto(
    val totalSpentKurus: String = "0",
    val dueThisMonthKurus: String = "0",
    val remainingCommitmentKurus: String = "0",
    val bySide: SideBreakdownDto? = null,
    val byCategory: List<CategoryBreakdownDto> = emptyList(),
    val installmentSchedule: List<MonthTotalDto> = emptyList(),
)

@Serializable
data class SideBreakdownDto(
    val bride: String = "0",
    val groom: String = "0",
    val shared: String = "0",
)

@Serializable
data class CategoryBreakdownDto(
    val categoryName: String,
    val totalKurus: String,
)

@Serializable
data class MonthTotalDto(
    val month: String,
    val totalKurus: String,
)

@Serializable
data class BudgetSummaryResponse(val summary: BudgetSummaryDto)

// --- Kategori (brief §5.3) ---

@Serializable
data class CategoryDto(
    val id: String,
    val weddingId: String? = null,
    val name: String,
    val icon: String? = null,
    val sortOrder: Int = 0,
    val isSystem: Boolean = false,
)

@Serializable
data class CategoryListResponse(val categories: List<CategoryDto>)

@Serializable
data class CategoryResponse(val category: CategoryDto)

@Serializable
data class CategoryCreateRequest(val name: String, val icon: String? = null)

// --- Kart (spec §6b.5) ---
//
// GÜVENLİK: Tam kart numarası, CVV, son kullanma tarihi GÖNDERİLMEZ.
// Yalnızca etiket + son 4 hane. Backend bu alanları reddeder.

@Serializable
data class CardDto(
    val id: String,
    val weddingId: String? = null,
    val label: String,
    val bankName: String? = null,
    val lastFour: String? = null,
    val statementDay: Int? = null,
    val isActive: Boolean = true,
)

@Serializable
data class CardListResponse(val cards: List<CardDto>)

@Serializable
data class CardResponse(val card: CardDto)

@Serializable
data class CardCreateRequest(
    val label: String,
    val bankName: String? = null,
    val lastFour: String? = null,
    val statementDay: Int? = null,
)

@Serializable
data class InstallmentResponse(val installment: InstallmentDto)

// --- Davetli ---

@Serializable
data class GuestDto(
    val id: String,
    val name: String,
    val phone: String? = null,
    val side: String = "BRIDE",
    val rsvp: String = "PENDING",
    val inviteStatus: String = "NOT_SENT",
    val note: String? = null,
)

@Serializable
data class GuestListResponse(val guests: List<GuestDto>)

@Serializable
data class GuestResponse(val guest: GuestDto)

@Serializable
data class GuestCreateRequest(
    val name: String,
    val phone: String? = null,
    val side: String = "BRIDE",
    val note: String? = null,
)

@Serializable
data class GuestUsageDto(
    val limit: Int? = null,
    val used: Int = 0,
    val remaining: Int? = null,
    val plan: String = "FREE",
)

@Serializable
data class GuestUsageResponse(val usage: GuestUsageDto)

@Serializable
data class GuestPatchRequest(
    val name: String? = null,
    val phone: String? = null,
    val side: String? = null,
    val note: String? = null,
)

@Serializable
data class GuestRsvpRequest(val rsvp: String, val partySize: Int? = null)

/**
 * Davetiye yanıtı.
 *
 * **Backend yalnızca `{ token, expiresAt, url }` döndürür**
 * (`guests.ts` → `createInvitation` → `invitation.ts`). `id` ve
 * `allowedPartySize` YOKTUR; zorunlu tutmak serileştirmeyi patlatıyordu:
 *
 *   Illegal input: Field 'id' is required for type with serial name
 *   'com.lumibyte.dugunce.data.InvitationDto'
 *
 * Bu, kullanıcının davetiye linki oluştururken gördüğü hataydı.
 */
@Serializable
data class InvitationDto(
    val token: String? = null,
    val url: String? = null,
    val expiresAt: String? = null,
)

@Serializable
data class InvitationResponse(
    val invitation: InvitationDto? = null,
    val url: String? = null,
)

// --- Görev ---

@Serializable
data class TaskDto(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: String = "TODO",
    val priority: String = "NORMAL",
    val dueDate: String? = null,
    val assigneeHelperId: String? = null,
    val assignedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class TaskListResponse(val tasks: List<TaskDto>)

@Serializable
data class TaskResponse(val task: TaskDto)

@Serializable
data class TaskCreateRequest(
    val title: String,
    val description: String? = null,
    val status: String = "TODO",
    val priority: String = "NORMAL",
    val dueDate: String? = null,
)

@Serializable
data class TaskPatchRequest(
    val title: String? = null,
    val description: String? = null,
    val status: String? = null,
    val priority: String? = null,
    val dueDate: String? = null,
)

@Serializable
data class TaskAssignRequest(val helperId: String? = null)

@Serializable
data class HelperDto(
    val id: String,
    val displayName: String,
    val tokenRevokedAt: String? = null,
    val lastSeenAt: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class HelperListResponse(val helpers: List<HelperDto>)

@Serializable
data class HelperCreateRequest(val displayName: String)

@Serializable
data class HelperCreatedResponse(
    val helper: HelperDto,
    /** Ham token — YALNIZCA oluşturma yanıtında döner. */
    val token: String? = null,
    val url: String? = null,
)

@Serializable
data class MessageDto(
    val id: String,
    val body: String,
    val senderKind: String,
    val createdAt: String,
)

@Serializable
data class MessageListResponse(val messages: List<MessageDto>)

@Serializable
data class MessageResponse(val message: MessageDto)

@Serializable
data class MessageSendRequest(
    val body: String,
    val idempotencyKey: String? = null,
)

// --- Davet kodu (2. eş) ---

@Serializable
data class InviteCreateRequest(val role: String = "CO_OWNER", val displayName: String? = null)

@Serializable
data class InviteDto(
    val id: String,
    val code: String,
    val role: String,
    val expiresAt: String? = null,
)

@Serializable
data class InviteResponse(val invite: InviteDto? = null, val code: String? = null)

@Serializable
data class InviteAcceptRequest(val code: String)
