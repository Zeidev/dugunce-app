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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dugunce.app.api.ApiException
import com.dugunce.app.data.ExpenseCreateRequest
import com.dugunce.app.data.Money
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.components.ButtonVariant
import com.dugunce.app.ui.components.DateField
import com.dugunce.app.ui.components.CheckRow
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.DugunceTextField
import com.dugunce.app.ui.components.ErrorState
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.components.MoneyField
import com.dugunce.app.ui.components.SegmentedPicker
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.util.Dates
import kotlinx.coroutines.launch

/**
 * Harcama formu — brief §5.3 (15 alan).
 *
 * Alanlar: tutar, kategori, açıklama, ödeme tarafı, kişi, tarih,
 * yöntem, durum, taksitli mi, taksit sayısı, ilk taksit ayı.
 *
 * Taksit kuralı (SECURITY §10.1 #2): taksit > 1 ise ilk ay ZORUNLU.
 */
@Composable
fun ExpenseFormScreen(
    repository: Repository,
    weddingId: String,
    expenseId: String?,
    onBack: () -> Unit,
    onSaved: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(expenseId != null) }
    var error by remember { mutableStateOf<String?>(null) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }

    var title by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var side by remember { mutableStateOf("SHARED") }
    var method by remember { mutableStateOf("CARD") }
    var status by remember { mutableStateOf("PAID") }
    var dateText by remember { mutableStateOf(Dates.formatShort(Dates.todayIso())) }
    var installmentText by remember { mutableStateOf("1") }
    // Onay kutusu: işaretlenmedikçe taksit alanları gizli ve peşin sayılır
    var isInstallment by remember { mutableStateOf(false) }
    var firstMonth by remember { mutableStateOf(Dates.currentMonth()) }
    var categories by remember { mutableStateOf<List<com.dugunce.app.data.CategoryDto>>(emptyList()) }
    var categoryId by remember { mutableStateOf<String?>(null) }
    var showNewCategory by remember { mutableStateOf(false) }
    var newCategoryName by remember { mutableStateOf("") }
    var cards by remember { mutableStateOf<List<com.dugunce.app.data.CardDto>>(emptyList()) }
    var cardId by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()

    // Kategoriler (brief §5.3) — sistem + düğüne özel
    LaunchedEffect(weddingId) {
        repository.listCategories(weddingId).onSuccess { categories = it }
    }

    // Kartlar — yalnızca taksitli harcamada anlamlı
    LaunchedEffect(weddingId) {
        repository.listCards(weddingId).onSuccess { cards = it }
    }

    LaunchedEffect(expenseId) {
        if (expenseId == null) return@LaunchedEffect
        loading = true
        repository.listExpenses(weddingId).fold(
            onSuccess = { list ->
                val e = list.find { it.id == expenseId }
                if (e != null) {
                    title = e.title
                    amount = Money.formatKurus(e.amountKurus)
                        .replace(" ₺", "")
                        .replace(".", "")
                        .replace(",", ".")
                    description = e.description ?: ""
                    side = e.paidBySide
                    method = e.paymentMethod
                    status = e.paymentStatus
                    dateText = Dates.formatShort(e.purchaseDate)
                    installmentText = (e.installmentCount ?: 1).toString()
                    isInstallment = (e.installmentCount ?: 1) > 1
                    firstMonth = e.firstInstallmentMonth ?: Dates.currentMonth()
                }
                loading = false
            },
            onFailure = { error = it.message; loading = false },
        )
    }

    val parsedAmount = Money.parseToKurus(amount)
    // Taksit YALNIZ açıkça işaretlenirse etkin. Varsayılan: peşin.
    // Önceden metin kutusunda "1" durduğu için nakit ödeme bile taksitli
    // sayılıp takvime düşüyordu.
    val installmentCount = if (isInstallment) (installmentText.toIntOrNull() ?: 1) else 1
    val isoDate = parseTurkishDate(dateText)
    val needsFirstMonth = installmentCount > 1

    val canSave = title.trim().isNotEmpty() &&
        parsedAmount != null && parsedAmount != "0" &&
        isoDate != null &&
        (!needsFirstMonth || firstMonth.matches(Regex("""^\d{4}-(0[1-9]|1[0-2])$""")))

    if (loading) {
        LoadingState(Modifier.fillMaxSize(), "Harcama yükleniyor…")
        return
    }
    if (error != null) {
        ErrorState(error!!, modifier = Modifier.fillMaxSize())
        return
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar(
            if (expenseId == null) "Yeni harcama" else "Harcamayı düzenle",
            onBack = onBack,
        )

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(
                horizontal = Spacing.screenH,
                vertical = Spacing.sm,
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DugunceTextField(
                    value = title,
                    onValueChange = { title = it; saveError = null },
                    label = "Ne için?",
                    placeholder = "Düğün salonu",
                    enabled = !saving,
                )
            }

            item {
                MoneyField(
                    value = amount,
                    onValueChange = { amount = it; saveError = null },
                    error = if (amount.isNotBlank() && parsedAmount == null) "Geçerli bir tutar gir" else null,
                )
            }

            item {
                // ÖNCEDEN: DateField(onClick = { }) — tarih seçilemiyordu.
                com.dugunce.app.ui.components.DatePickerField(
                    isoValue = isoDate,
                    onIsoChange = { iso -> dateText = iso?.let { Dates.formatShort(it) } ?: "" },
                    label = "Satın alma tarihi",
                )
            }

            item {
                FieldLabel("Ödemeyi yapan taraf")
                SegmentedPicker(
                    options = listOf(
                        "BRIDE" to "Gelin",
                        "GROOM" to "Damat",
                        "SHARED" to "Ortak",
                    ),
                    selected = side,
                    onSelect = { side = it },
                )
            }

            if (categories.isNotEmpty()) {
                item {
                    FieldLabel("Kategori")
                    androidx.compose.foundation.lazy.LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    ) {
                        item {
                            CategoryPill("Kategorisiz", categoryId == null) { categoryId = null }
                        }
                        items(categories.size) { idx ->
                            val cat = categories[idx]
                            CategoryPill(cat.name, categoryId == cat.id) { categoryId = cat.id }
                        }
                        item {
                            CategoryPill("+ Yeni", false) { showNewCategory = !showNewCategory }
                        }
                    }
                }
            }

            if (showNewCategory) {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    ) {
                        DugunceTextField(
                            value = newCategoryName,
                            onValueChange = { newCategoryName = it },
                            label = "Yeni kategori",
                            placeholder = "Örn. Nikah masası",
                            modifier = Modifier.weight(1f),
                            enabled = !saving,
                        )
                        DugunceButton(
                            "Ekle",
                            onClick = {
                                val name = newCategoryName.trim()
                                if (name.isEmpty()) return@DugunceButton
                                scope.launch {
                                    repository.createCategory(weddingId, name).fold(
                                        onSuccess = { created ->
                                            categories = categories + created
                                            categoryId = created.id
                                            newCategoryName = ""
                                            showNewCategory = false
                                        },
                                        onFailure = { saveError = it.message },
                                    )
                                }
                            },
                            enabled = newCategoryName.trim().isNotEmpty(),
                            fullWidth = false,
                        )
                    }
                }
            }

            item {
                FieldLabel("Ödeme yöntemi")
                SegmentedPicker(
                    options = listOf(
                        "CARD" to "Kart",
                        "CASH" to "Nakit",
                        "TRANSFER" to "Havale",
                    ),
                    selected = method,
                    onSelect = {
                        method = it
                        // Kart dışına geçilince taksit ANLAMSIZ: işareti
                        // temizle, yoksa gizli kalan taksit kaydedilir.
                        if (it != "CARD") {
                            isInstallment = false
                            cardId = null
                        }
                        saveError = null
                    },
                )
            }

            item {
                FieldLabel("Ödeme durumu")
                SegmentedPicker(
                    options = listOf(
                        "PAID" to "Ödendi",
                        "PENDING" to "Bekliyor",
                    ),
                    selected = status,
                    onSelect = { status = it },
                )
            }

            // Taksit — YALNIZ kartla ödemede.
            //
            // Nakit/havalede taksit kavramı yok; blok tamamen gizlenir.
            // Yöntem kart dışına çıkınca işaret de temizlenir ki arkada
            // taksit kalmasın.
            if (method == "CARD") {
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.md),
                    color = c.surfaceAlt,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        CheckRow(
                            label = "Taksitli ödeme",
                            checked = isInstallment,
                            description = "İşaretlemezsen harcama peşin sayılır.",
                            onCheckedChange = { on ->
                                isInstallment = on
                                saveError = null
                                if (on && installmentText.isBlank()) installmentText = "2"
                            },
                        )
                        if (isInstallment) {
                            DugunceTextField(
                                value = installmentText,
                                onValueChange = {
                                    installmentText = it.filter { ch -> ch.isDigit() }.take(2)
                                    saveError = null
                                },
                                label = "Taksit sayısı",
                                keyboard = KeyboardType.Number,
                                imeAction = ImeAction.Next,
                                helper = "En az 2, en fazla 36.",
                                enabled = !saving,
                            )
                        }
                        if (needsFirstMonth) {
                            DugunceTextField(
                                value = firstMonth,
                                onValueChange = { firstMonth = it; saveError = null },
                                label = "İlk taksit ayı",
                                placeholder = "2026-01",
                                helper = "YYYY-AA biçiminde (zorunlu)",
                                error = if (!firstMonth.matches(Regex("""^\d{4}-(0[1-9]|1[0-2])$"""))) {
                                    "YYYY-AA biçiminde gir"
                                } else null,
                                enabled = !saving,
                            )
                            // Önizleme
                            val total = parsedAmount?.toLongOrNull() ?: 0L
                            if (total > 0) {
                                val per = total / installmentCount
                                Text(
                                    "Aylık ≈ ${Money.formatKurus(per)} · toplam ${Money.formatKurus(total)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = c.sage,
                                )
                            }
                        }
                    }
                }
            }
            }

            if (cards.isNotEmpty() && installmentCount > 1) {
                item {
                    FieldLabel("Hangi karttan?")
                    androidx.compose.foundation.lazy.LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    ) {
                        item {
                            CategoryPill("Kart yok", cardId == null) { cardId = null }
                        }
                        items(cards.size) { idx ->
                            val card = cards[idx]
                            val suffix = card.lastFour?.let { " ****$it" } ?: ""
                            CategoryPill(card.label + suffix, cardId == card.id) { cardId = card.id }
                        }
                    }
                }
            }

            item {
                DugunceTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = "Not (isteğe bağlı)",
                    placeholder = "Kapora, kalanı düğünden sonra",
                    singleLine = false,
                    minLines = 2,
                    enabled = !saving,
                )
            }

            if (saveError != null) {
                item {
                    Text(saveError!!, style = MaterialTheme.typography.bodySmall, color = c.danger)
                }
            }

            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            DugunceButton(
                if (expenseId == null) "Harcamayı kaydet" else "Değişiklikleri kaydet",
                onClick = {
                    if (!canSave || saving) return@DugunceButton
                    saving = true
                    saveError = null
                    scope.launch {
                        repository.createExpense(
                            weddingId,
                            ExpenseCreateRequest(
                                title = title.trim(),
                                amount = Money.kurusToTlString(parsedAmount),
                                purchaseDate = isoDate,
                                description = description.trim().ifBlank { null },
                                categoryId = categoryId,
                                cardId = if (installmentCount > 1) cardId else null,
                                paidBySide = side,
                                paymentMethod = method,
                                paymentStatus = status,
                                installmentCount = installmentCount,
                                firstInstallmentMonth = if (needsFirstMonth) firstMonth else null,
                            ),
                        ).fold(
                            onSuccess = { saving = false; onSaved() },
                            onFailure = { e ->
                                saving = false
                                saveError = if (e is ApiException) e.message else "Kaydedilemedi"
                            },
                        )
                    }
                },
                enabled = canSave,
                loading = saving,
            )
        }
    }
}

/** Kategori seçim çipi. */
@Composable
private fun CategoryPill(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        modifier = Modifier.heightIn(min = 36.dp),
        shape = RoundedCornerShape(Radius.pill),
        color = if (selected) c.sageSoft else c.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) c.sage else c.line),
    ) {
        androidx.compose.foundation.layout.Box(
            Modifier.padding(horizontal = Spacing.md),
            contentAlignment = androidx.compose.ui.Alignment.Center,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) c.sage else c.inkSoft,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

/** Form alanı etiketi. */
@Composable
internal fun FieldLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = DugunceTheme.colors.ink,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(bottom = Spacing.xs),
    )
}

/**
 * Harcama detayı — brief §5.3.
 *
 * Taksit listesi, toplam, düzenle/sil.
 */
@Composable
fun ExpenseDetailScreen(
    repository: Repository,
    weddingId: String,
    expenseId: String,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDeleted: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var expense by remember { mutableStateOf<com.dugunce.app.data.ExpenseDto?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(expenseId, reloadKey) {
        loading = true
        repository.getExpense(weddingId, expenseId).fold(
            onSuccess = { expense = it; loading = false; error = null },
            onFailure = { error = it.message; loading = false },
        )
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar(
            "Harcama",
            onBack = onBack,
            actionLabel = "Düzenle",
            onAction = onEdit,
        )

        when {
            loading -> LoadingState(Modifier.fillMaxSize())
            error != null -> ErrorState(error!!, modifier = Modifier.fillMaxSize())
            expense != null -> {
                val e = expense!!
                LazyColumn(
                    contentPadding = PaddingValues(
                        horizontal = Spacing.screenH,
                        vertical = Spacing.sm,
                    ),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md),
                ) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(Radius.lg),
                            color = c.sage,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(Spacing.lg)) {
                                Text(e.title, style = MaterialTheme.typography.titleMedium, color = c.sageSoft)
                                Spacer(Modifier.height(Spacing.xs))
                                com.dugunce.app.ui.components.MoneyText(
                                    Money.formatKurus(e.amountKurus),
                                    big = true,
                                    color = androidx.compose.ui.graphics.Color.White,
                                )
                            }
                        }
                    }

                    item {
                        Surface(
                            shape = RoundedCornerShape(Radius.md),
                            color = c.surface,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                Modifier.padding(Spacing.lg),
                                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                            ) {
                                DetailRow("Tarih", Dates.formatDate(e.purchaseDate))
                                DetailRow("Taraf", sideLabel(e.paidBySide))
                                DetailRow("Yöntem", methodLabel(e.paymentMethod))
                                DetailRow("Durum", if (e.paymentStatus == "PAID") "Ödendi" else "Bekliyor")
                                if ((e.installmentCount ?: 1) > 1) {
                                    DetailRow("Taksit", "${e.installmentCount} taksit")
                                }
                                if (!e.description.isNullOrBlank()) {
                                    DetailRow("Not", e.description)
                                }
                            }
                        }
                    }

                    if (e.installments.isNotEmpty()) {
                        item {
                            com.dugunce.app.ui.components.SectionHeader("Taksitler")
                        }
                        items(e.installments.size) { idx ->
                            val inst = e.installments[idx]
                            Surface(
                                shape = RoundedCornerShape(Radius.md),
                                color = c.surface,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    Modifier.padding(Spacing.md).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text(
                                            "${inst.installmentNumber.takeIf { it > 0 } ?: inst.number}. taksit",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = c.ink,
                                        )
                                        Text(
                                            Dates.formatMonth(inst.dueMonth),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = c.muted,
                                        )
                                    }
                                    com.dugunce.app.ui.components.MoneyText(
                                        Money.formatKurus(inst.amountKurus),
                                        color = if (inst.status == "PAID") c.muted else c.ink,
                                    )
                                }
                            }
                        }
                    }

                    item {
                        Spacer(Modifier.height(Spacing.lg))
                        if (!confirmDelete) {
                            DugunceButton(
                                "Harcamayı sil",
                                onClick = { confirmDelete = true },
                                variant = ButtonVariant.DANGER,
                            )
                        } else {
                            Surface(
                                shape = RoundedCornerShape(Radius.md),
                                color = c.dangerSoft,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(Modifier.padding(Spacing.md)) {
                                    Text(
                                        "Bu harcama silinsin mi? Taksitleri de silinir.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = c.danger,
                                    )
                                    Spacer(Modifier.height(Spacing.sm))
                                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                        DugunceButton(
                                            "Evet, sil",
                                            onClick = {
                                                scope.launch {
                                                    repository.deleteExpense(weddingId, expenseId).fold(
                                                        onSuccess = { onDeleted() },
                                                        onFailure = { err ->
                                                            error = err.message
                                                            confirmDelete = false
                                                        },
                                                    )
                                                }
                                            },
                                            variant = ButtonVariant.DANGER,
                                            modifier = Modifier.weight(1f),
                                        )
                                        DugunceButton(
                                            "Vazgeç",
                                            onClick = { confirmDelete = false },
                                            variant = ButtonVariant.SECONDARY,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    item { Spacer(Modifier.height(Spacing.xxl)) }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    val c = DugunceTheme.colors
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = c.muted)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = c.ink,
            fontWeight = FontWeight.Medium,
        )
    }
}

internal fun methodLabel(method: String?): String = when (method) {
    "CASH" -> "Nakit"
    "CARD" -> "Kredi kartı"
    "TRANSFER" -> "Havale/EFT"
    "OTHER" -> "Diğer"
    else -> "—"
}
