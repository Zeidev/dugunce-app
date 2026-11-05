package com.lumibyte.dugunce.ui.screens

import com.lumibyte.dugunce.ui.icons.AppIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lumibyte.dugunce.data.BudgetSummaryDto
import com.lumibyte.dugunce.data.ExpenseDto
import com.lumibyte.dugunce.data.InstallmentDto
import com.lumibyte.dugunce.data.Money
import com.lumibyte.dugunce.data.Repository
import com.lumibyte.dugunce.ui.components.DugunceCard
import com.lumibyte.dugunce.ui.components.EmptyState
import com.lumibyte.dugunce.ui.components.ErrorState
import com.lumibyte.dugunce.ui.components.LoadingState
import com.lumibyte.dugunce.ui.components.MoneyText
import com.lumibyte.dugunce.ui.components.SectionHeader
import com.lumibyte.dugunce.ui.components.StatusChip
import com.lumibyte.dugunce.ui.components.StatusTone
import com.lumibyte.dugunce.ui.components.TopBar
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import com.lumibyte.dugunce.util.Dates
import kotlinx.coroutines.launch

/**
 * Bütçe ekranı — brief §5.3.
 *
 * KRİTİK (SECURITY §10.1 #7): "toplam harcama" ile "bu ay ödenecek"
 * AYRI gösterilir. Karışırsa bütçe iki katı görünür.
 */
@Composable
fun BudgetScreen(
    repository: Repository,
    weddingId: String,
    onAddExpense: () -> Unit,
    onOpenExpense: (String) -> Unit,
    onOpenCalendar: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var summary by remember { mutableStateOf<BudgetSummaryDto?>(null) }
    var expenses by remember { mutableStateOf<List<ExpenseDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }
    var filterSide by remember { mutableStateOf<String?>(null) }
    var filterCard by remember { mutableStateOf<String?>(null) }
    var cards by remember { mutableStateOf<List<com.lumibyte.dugunce.data.CardDto>>(emptyList()) }
    var offline by remember { mutableStateOf(false) }

    LaunchedEffect(weddingId, reloadKey) {
        loading = true
        error = null
        val s = repository.budgetSummary(weddingId)
        val e = repository.listExpenses(weddingId)
        if (s.isFailure) {
            // spec §11: internet yokken son veri görünür
            val cachedSummary = repository.cachedSummary(weddingId)
            val cachedExpenses = repository.cachedExpenses(weddingId)
            if (cachedSummary != null || cachedExpenses != null) {
                summary = cachedSummary
                expenses = cachedExpenses ?: emptyList()
                offline = true
                error = null
            } else {
                error = s.exceptionOrNull()?.message ?: "Bütçe yüklenemedi"
            }
            loading = false
            return@LaunchedEffect
        }
        summary = s.getOrNull()
        expenses = e.getOrNull() ?: emptyList()
        offline = false
        loading = false
        repository.listCards(weddingId).onSuccess { cards = it }
    }

    val filtered = expenses.filter { e ->
        (filterSide == null || e.paidBySide == filterSide) &&
            (filterCard == null || e.cardId == filterCard)
    }

    Box(Modifier.fillMaxSize().background(c.cream)) {
        when {
            loading -> LoadingState(Modifier.fillMaxSize(), "Bütçe yükleniyor…")

            error != null -> ErrorState(
                error!!,
                onRetry = { reloadKey++ },
                modifier = Modifier.fillMaxSize(),
            )

            expenses.isEmpty() -> EmptyState(
                title = "Henüz harcama yok",
                description = "İlk harcamanı ekle — düğün hazırlığında ne harcadığını " +
                    "görmeye başla. Taksitli alışverişte aylık yük de hesaplanır.",
                icon = AppIcons.AccountBalanceWallet,
                actionLabel = "Harcama ekle",
                onAction = onAddExpense,
                modifier = Modifier.align(Alignment.Center),
            )

            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    horizontal = Spacing.screenH,
                    vertical = Spacing.md,
                ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                if (offline) {
                    item {
                        com.lumibyte.dugunce.ui.components.InfoBanner(
                            text = "Çevrimdışısın — son yüklenen bütçe gösteriliyor.",
                        )
                    }
                }
                item { SummaryCards(summary = summary, onOpenCalendar = onOpenCalendar) }

                val byCategory = summary?.byCategory ?: emptyList()
                if (byCategory.isNotEmpty()) {
                    item { SectionHeader("Kategori dağılımı") }
                    item {
                        DugunceCard {
                            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                byCategory.take(6).forEach { cat ->
                                    CategoryRow(
                                        cat.categoryName,
                                        cat.totalKurus,
                                        summary?.totalSpentKurus ?: "0",
                                    )
                                }
                            }
                        }
                    }
                }

                item { SectionHeader("Harcamalar") }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        item { FilterPill("Tümü", filterSide == null) { filterSide = null } }
                        item { FilterPill("Gelin", filterSide == "BRIDE") { filterSide = "BRIDE" } }
                        item { FilterPill("Damat", filterSide == "GROOM") { filterSide = "GROOM" } }
                        item { FilterPill("Ortak", filterSide == "SHARED") { filterSide = "SHARED" } }
                    }
                }

                // Kart filtresi (spec §6b.7) — yalnızca kart varsa
                if (cards.isNotEmpty()) {
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            item { FilterPill("Tüm kartlar", filterCard == null) { filterCard = null } }
                            items(cards.size) { idx ->
                                val card = cards[idx]
                                FilterPill(card.label, filterCard == card.id) { filterCard = card.id }
                            }
                        }
                    }
                }

                items(filtered, key = { it.id }) { expense ->
                    ExpenseRow(expense) { onOpenExpense(expense.id) }
                }

                item { Spacer(Modifier.height(Spacing.xxl)) }
            }
        }

        if (!loading && error == null && expenses.isNotEmpty()) {
            Surface(
                onClick = onAddExpense,
                modifier = Modifier.align(Alignment.BottomEnd).padding(Spacing.lg),
                shape = RoundedCornerShape(Radius.pill),
                color = c.sage,
                shadowElevation = 6.dp,
            ) {
                Row(
                    Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(AppIcons.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(Spacing.sm))
                    Text(
                        "Harcama",
                        color = Color.White,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryCards(summary: BudgetSummaryDto?, onOpenCalendar: () -> Unit) {
    val c = DugunceTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(Radius.lg),
            color = c.sage,
        ) {
            Column(Modifier.padding(Spacing.lg)) {
                Text("Toplam harcama", style = MaterialTheme.typography.labelMedium, color = c.sageSoft)
                Spacer(Modifier.height(Spacing.xs))
                MoneyText(
                    Money.formatKurus(summary?.totalSpentKurus ?: "0"),
                    big = true,
                    color = Color.White,
                )
                Spacer(Modifier.height(Spacing.xs))
                Text(
                    "Taksitler burada TEKRAR sayılmaz — satın alma bir kez görünür.",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.sageSoft,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Surface(
                onClick = onOpenCalendar,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(Radius.md),
                color = c.surface,
            ) {
                Column(Modifier.padding(Spacing.md)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            AppIcons.Schedule,
                            contentDescription = null,
                            tint = c.warning,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(Spacing.xs))
                        Text("Bu ay", style = MaterialTheme.typography.labelSmall, color = c.muted)
                    }
                    Spacer(Modifier.height(Spacing.xs))
                    MoneyText(Money.formatKurus(summary?.dueThisMonthKurus ?: "0"), color = c.warning)
                }
            }
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(Radius.md),
                color = c.surface,
            ) {
                Column(Modifier.padding(Spacing.md)) {
                    Text("Kalan taahhüt", style = MaterialTheme.typography.labelSmall, color = c.muted)
                    Spacer(Modifier.height(Spacing.xs))
                    MoneyText(Money.formatKurus(summary?.remainingCommitmentKurus ?: "0"))
                }
            }
        }
    }
}

@Composable
private fun CategoryRow(name: String, totalKurus: String, grandTotal: String) {
    val c = DugunceTheme.colors
    val total = totalKurus.toLongOrNull() ?: 0L
    val grand = grandTotal.toLongOrNull() ?: 1L
    val ratio = if (grand <= 0) 0f else (total.toFloat() / grand).coerceIn(0f, 1f)

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(name, style = MaterialTheme.typography.bodySmall, color = c.inkSoft)
            Text(
                Money.formatKurus(totalKurus),
                style = MaterialTheme.typography.bodySmall,
                color = c.ink,
                fontWeight = FontWeight.Medium,
            )
        }
        Surface(
            shape = RoundedCornerShape(Radius.pill),
            color = c.line,
            modifier = Modifier.fillMaxWidth().height(5.dp),
        ) {
            Row(Modifier.fillMaxWidth()) {
                Surface(
                    shape = RoundedCornerShape(Radius.pill),
                    color = c.sage,
                    modifier = Modifier.fillMaxWidth(ratio).height(5.dp),
                ) {}
            }
        }
    }
}

@Composable
private fun FilterPill(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        modifier = Modifier.heightIn(min = 36.dp),
        shape = RoundedCornerShape(Radius.pill),
        color = if (selected) c.sageSoft else c.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) c.sage else c.line),
    ) {
        Box(Modifier.padding(horizontal = Spacing.md), contentAlignment = Alignment.Center) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) c.sage else c.inkSoft,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

/** Harcama satırı. */
@Composable
fun ExpenseRow(expense: ExpenseDto, onClick: () -> Unit) {
    val c = DugunceTheme.colors
    val paid = expense.paymentStatus == "PAID"
    DugunceCard(onClick = onClick) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    expense.title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = c.ink,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(Spacing.xxs))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        Dates.formatShort(expense.purchaseDate),
                        style = MaterialTheme.typography.bodySmall,
                        color = c.muted,
                    )
                    if ((expense.installmentCount ?: 1) > 1) {
                        Text(
                            " · ${expense.installmentCount} taksit",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                    }
                }
                Spacer(Modifier.height(Spacing.sm))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    StatusChip(sideLabel(expense.paidBySide), StatusTone.NEUTRAL)
                    if ((expense.installmentCount ?: 1) > 1) {
                        StatusChip("Taksitli", StatusTone.INFO)
                    }
                    if (!paid) {
                        StatusChip("Bekliyor", StatusTone.WARNING)
                    }
                }
            }
            Spacer(Modifier.width(Spacing.sm))
            MoneyText(Money.formatKurus(expense.amountKurus))
        }
    }
}

internal fun sideLabel(side: String?): String = when (side) {
    "BRIDE" -> "Gelin"
    "GROOM" -> "Damat"
    "SHARED" -> "Ortak"
    else -> "—"
}

/**
 * Taksit takvimi — brief §5.3.
 *
 * Aylık nakit çıkışı; ödendi işaretleme.
 */
@Composable
fun InstallmentCalendarScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var expenses by remember { mutableStateOf<List<ExpenseDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    LaunchedEffect(weddingId, reloadKey) {
        loading = true
        error = null
        repository.listExpenses(weddingId).fold(
            onSuccess = { expenses = it; loading = false },
            onFailure = { error = it.message; loading = false },
        )
    }

    // `toSortedMap()` JVM'e özgüdür, KMP common'da yok. Aylar "YYYY-MM"
    // biçiminde olduğu için sözlük sırası = kronolojik sıra.
    val byMonth = remember(expenses) {
        expenses
            .flatMap { e -> e.installments.map { inst -> inst to e.title } }
            .groupBy { it.first.dueMonth }
            .toList()
            .sortedBy { it.first }
            .toMap()
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Taksit takvimi", onBack = onBack)

        when {
            loading -> LoadingState(Modifier.fillMaxSize(), "Taksitler hesaplanıyor…")
            error != null -> ErrorState(error!!, onRetry = { reloadKey++ }, modifier = Modifier.fillMaxSize())
            byMonth.isEmpty() -> EmptyState(
                title = "Taksit yok",
                description = "Taksitli bir harcama eklediğinde aylık ödeme planı burada görünür.",
                icon = AppIcons.Schedule,
                modifier = Modifier.fillMaxSize(),
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(
                    horizontal = Spacing.screenH,
                    vertical = Spacing.md,
                ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(byMonth.keys.toList()) { month ->
                    val entries = byMonth[month] ?: emptyList()
                    val total = entries.sumOf { it.first.amountKurus.toLongOrNull() ?: 0L }
                    val allPaid = entries.all { it.first.status == "PAID" }

                    Surface(
                        shape = RoundedCornerShape(Radius.lg),
                        color = c.surface,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(Spacing.lg)) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text(
                                        Dates.formatMonth(month),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = c.ink,
                                    )
                                    Text(
                                        "${entries.size} taksit",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.muted,
                                    )
                                }
                                MoneyText(Money.formatKurus(total))
                            }

                            if (allPaid) {
                                Spacer(Modifier.height(Spacing.sm))
                                StatusChip("Hepsi ödendi", StatusTone.SUCCESS, AppIcons.CheckCircle)
                            }

                            Spacer(Modifier.height(Spacing.md))
                            entries.forEach { (inst, title) ->
                                InstallmentRow(
                                    installment = inst,
                                    title = title,
                                    onToggle = { paid ->
                                        scope.launch {
                                            repository.setInstallmentPaid(weddingId, inst.id, paid)
                                            reloadKey++
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(Spacing.xl)) }
            }
        }
    }
}

@Composable
private fun InstallmentRow(
    installment: InstallmentDto,
    title: String,
    onToggle: (Boolean) -> Unit,
) {
    val c = DugunceTheme.colors
    val paid = installment.status == "PAID"

    Row(
        Modifier.fillMaxWidth().padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        androidx.compose.material3.Checkbox(
            checked = paid,
            onCheckedChange = { onToggle(it) },
            colors = androidx.compose.material3.CheckboxDefaults.colors(checkedColor = c.success),
        )
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyMedium,
                color = if (paid) c.muted else c.ink,
            )
            Text(
                "${installment.installmentNumber.takeIf { it > 0 } ?: installment.number}. taksit",
                style = MaterialTheme.typography.bodySmall,
                color = c.muted,
            )
        }
        MoneyText(
            Money.formatKurus(installment.amountKurus),
            color = if (paid) c.muted else c.ink,
        )
    }
}
