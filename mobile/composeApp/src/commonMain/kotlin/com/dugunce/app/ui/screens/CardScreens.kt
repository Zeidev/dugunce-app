package com.dugunce.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.dugunce.app.api.ApiException
import com.dugunce.app.data.CardCreateRequest
import com.dugunce.app.data.CardDto
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.DugunceTextField
import com.dugunce.app.ui.components.EmptyState
import com.dugunce.app.ui.components.ErrorState
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.components.StatusChip
import com.dugunce.app.ui.components.StatusTone
import com.dugunce.app.ui.components.TextAction
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Kart yönetimi — spec §6b.5.
 *
 * **GÜVENLİK:** Ekran yalnızca etiket, banka adı, son 4 hane ve hesap
 * kesim günü toplar. Tam kart numarası / CVV / son kullanma tarihi
 * alanı YOKTUR — backend bunları reddeder (400).
 */
@Composable
fun CardListScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var cards by remember { mutableStateOf<List<CardDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }
    var showForm by remember { mutableStateOf(false) }
    var label by remember { mutableStateOf("") }
    var bankName by remember { mutableStateOf("") }
    var lastFour by remember { mutableStateOf("") }
    var statementDay by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(weddingId, reloadKey) {
        loading = true
        repository.listCards(weddingId).fold(
            onSuccess = { cards = it; loading = false; error = null },
            onFailure = { error = it.message; loading = false },
        )
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar(
            "Kartlar",
            onBack = onBack,
            actionLabel = if (showForm) "Vazgeç" else "Ekle",
            onAction = { showForm = !showForm; formError = null },
        )

        when {
            loading -> LoadingState(Modifier.fillMaxSize(), "Kartlar yükleniyor…")
            error != null -> ErrorState(error!!, onRetry = { reloadKey++ }, modifier = Modifier.fillMaxSize())

            else -> LazyColumn(
                Modifier.weight(1f).imePadding(),
                contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                // Güvenlik notu — kullanıcı ne girmediğini bilsin
                item {
                    Surface(
                        shape = RoundedCornerShape(Radius.md),
                        color = c.infoSoft,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            "Kart numarası, CVV veya son kullanma tarihi İSTEMİYORUZ. " +
                                "Yalnızca kartı tanıman için bir etiket ve son 4 hane " +
                                "yeterli — bunlar da şifreli saklanır.",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.info,
                            modifier = Modifier.padding(Spacing.md),
                        )
                    }
                }

                if (showForm) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(Radius.lg),
                            color = c.surface,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                Modifier.padding(Spacing.lg),
                                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                            ) {
                                DugunceTextField(
                                    value = label,
                                    onValueChange = { label = it; formError = null },
                                    label = "Kart etiketi",
                                    placeholder = "Ziraat kredi kartı",
                                    enabled = !saving,
                                )
                                DugunceTextField(
                                    value = bankName,
                                    onValueChange = { bankName = it },
                                    label = "Banka (isteğe bağlı)",
                                    placeholder = "Ziraat",
                                    enabled = !saving,
                                )
                                DugunceTextField(
                                    value = lastFour,
                                    onValueChange = { v ->
                                        lastFour = v.filter { ch -> ch.isDigit() }.take(4)
                                        formError = null
                                    },
                                    label = "Son 4 hane (isteğe bağlı)",
                                    placeholder = "1234",
                                    keyboard = KeyboardType.Number,
                                    helper = "Kartın tamamını DEĞİL, sadece son 4 hanesini gir",
                                    enabled = !saving,
                                    maxLength = 4,
                                )
                                DugunceTextField(
                                    value = statementDay,
                                    onValueChange = { v ->
                                        statementDay = v.filter { ch -> ch.isDigit() }.take(2)
                                    },
                                    label = "Hesap kesim günü (isteğe bağlı)",
                                    placeholder = "15",
                                    keyboard = KeyboardType.Number,
                                    imeAction = ImeAction.Done,
                                    helper = "1-31 arası; bilgi amaçlı",
                                    enabled = !saving,
                                    maxLength = 2,
                                )
                                if (formError != null) {
                                    Text(
                                        formError!!,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.danger,
                                    )
                                }
                                DugunceButton(
                                    "Kartı kaydet",
                                    onClick = {
                                        if (label.trim().isEmpty() || saving) return@DugunceButton
                                        saving = true
                                        formError = null
                                        scope.launch {
                                            repository.createCard(
                                                weddingId,
                                                CardCreateRequest(
                                                    label = label.trim(),
                                                    bankName = bankName.trim().ifBlank { null },
                                                    lastFour = lastFour.ifBlank { null },
                                                    statementDay = statementDay.toIntOrNull(),
                                                ),
                                            ).fold(
                                                onSuccess = {
                                                    saving = false
                                                    showForm = false
                                                    label = ""
                                                    bankName = ""
                                                    lastFour = ""
                                                    statementDay = ""
                                                    reloadKey++
                                                },
                                                onFailure = { e ->
                                                    saving = false
                                                    formError = if (e is ApiException) e.message else "Kaydedilemedi"
                                                },
                                            )
                                        }
                                    },
                                    enabled = label.trim().isNotEmpty(),
                                    loading = saving,
                                )
                            }
                        }
                    }
                }

                if (cards.isEmpty() && !showForm) {
                    item {
                        EmptyState(
                            title = "Henüz kart yok",
                            description = "Kart ekleyerek hangi taksitin hangi karttan " +
                                "ödendiğini takip edebilirsin. Kart numarası istemiyoruz.",
                            icon = Icons.Filled.CreditCard,
                            actionLabel = "Kart ekle",
                            onAction = { showForm = true },
                        )
                    }
                } else {
                    items(cards, key = { it.id }) { card ->
                        Surface(
                            shape = RoundedCornerShape(Radius.md),
                            color = c.surface,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                Modifier.padding(Spacing.lg).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        card.label,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = c.ink,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    if (!card.lastFour.isNullOrBlank()) {
                                        Text(
                                            "**** ${card.lastFour}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = c.muted,
                                        )
                                    }
                                    if (card.statementDay != null) {
                                        Text(
                                            "Kesim günü: ${card.statementDay}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = c.muted,
                                        )
                                    }
                                    Spacer(Modifier.height(Spacing.xs))
                                    StatusChip(
                                        if (card.isActive) "Aktif" else "Pasif",
                                        if (card.isActive) StatusTone.SUCCESS else StatusTone.NEUTRAL,
                                    )
                                }
                                TextAction(
                                    "Sil",
                                    onClick = {
                                        scope.launch {
                                            repository.deleteCard(weddingId, card.id)
                                            reloadKey++
                                        }
                                    },
                                )
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(Spacing.xxl)) }
            }
        }
    }
}
