package com.dugunce.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.TaskAlt
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.BudgetSummaryDto
import com.dugunce.app.data.GuestDto
import com.dugunce.app.data.Money
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TaskDto
import com.dugunce.app.data.WeddingDto
import com.dugunce.app.ui.components.DugunceCard
import com.dugunce.app.ui.components.EmptyState
import com.dugunce.app.ui.components.ErrorState
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.components.MoneyText
import com.dugunce.app.ui.components.SectionHeader
import com.dugunce.app.ui.components.StatusChip
import com.dugunce.app.ui.components.StatusTone
import com.dugunce.app.ui.components.TextAction
import com.dugunce.app.ui.nav.Screen
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.util.Dates

/**
 * Ana panel — brief §5.2.
 *
 * Özet kartları: toplam harcama, bu ay ödenecek, kalan taahhüt,
 * davetli sayıları, açık/yaklaşan görevler.
 *
 * Brief §5.2: "Veri yokken boş ekran yerine açıklayıcı empty state ve
 * ilgili ilk eylem butonu göster."
 */
@Composable
fun DashboardScreen(
    repository: Repository,
    wedding: WeddingDto,
    onNavigate: (Screen) -> Unit,
    onAddExpense: () -> Unit,
    onAddGuest: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var summary by remember { mutableStateOf<BudgetSummaryDto?>(null) }
    var guests by remember { mutableStateOf<List<GuestDto>>(emptyList()) }
    var tasks by remember { mutableStateOf<List<TaskDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(wedding.id, reloadKey) {
        loading = true
        error = null
        val s = repository.budgetSummary(wedding.id)
        val g = repository.listGuests(wedding.id)
        val t = repository.listTasks(wedding.id)
        if (s.isFailure) {
            error = s.exceptionOrNull()?.message ?: "Veriler yüklenemedi"
            loading = false
            return@LaunchedEffect
        }
        summary = s.getOrNull()
        guests = g.getOrNull() ?: emptyList()
        tasks = t.getOrNull() ?: emptyList()
        loading = false
    }

    val daysLeft = Dates.daysUntil(wedding.weddingDate)
    val attending = guests.count { it.rsvp == "ATTENDING" }
    val declined = guests.count { it.rsvp == "DECLINED" }
    val pending = guests.count { it.rsvp == "PENDING" }
    val openTasks = tasks.count { it.status != "DONE" }
    val upcomingTasks = tasks
        .filter { it.status != "DONE" && it.dueDate != null }
        .sortedBy { it.dueDate }

    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(c.cream),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = Spacing.screenH,
            vertical = Spacing.md,
        ),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        // Başlık
        item {
            Column {
                Text(
                    wedding.coupleNames,
                    style = MaterialTheme.typography.headlineLarge,
                    color = c.ink,
                )
                Spacer(Modifier.height(Spacing.xs))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.CalendarMonth,
                        contentDescription = null,
                        tint = c.muted,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(Spacing.xs))
                    Text(
                        buildString {
                            append(Dates.formatDate(wedding.weddingDate))
                            if (daysLeft != null && daysLeft >= 0) {
                                append(" · ${Dates.relativeDays(wedding.weddingDate)}")
                            }
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.muted,
                    )
                }
            }
        }

        when {
            loading -> item { LoadingState(label = "Panel hazırlanıyor…") }

            error != null -> item {
                ErrorState(error!!, onRetry = { reloadKey++ })
            }

            else -> {
                // Bütçe kartı
                item {
                    BudgetHeroCard(
                        totalSpent = summary?.totalSpentKurus ?: "0",
                        dueThisMonth = summary?.dueThisMonthKurus ?: "0",
                        remaining = summary?.remainingCommitmentKurus ?: "0",
                        onClick = { onNavigate(Screen.BUDGET) },
                    )
                }

                // Davetli özeti
                item {
                    SectionHeader(
                        "Davetliler",
                        actionLabel = "Tümü",
                        onAction = { onNavigate(Screen.GUESTS) },
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        StatCard(
                            Icons.Filled.CheckCircle,
                            "Katılacak",
                            attending.toString(),
                            StatusTone.SUCCESS,
                            Modifier.weight(1f),
                        )
                        StatCard(
                            Icons.Filled.EventBusy,
                            "Katılmayacak",
                            declined.toString(),
                            StatusTone.DANGER,
                            Modifier.weight(1f),
                        )
                        StatCard(
                            Icons.Filled.HourglassEmpty,
                            "Bekleyen",
                            pending.toString(),
                            StatusTone.WARNING,
                            Modifier.weight(1f),
                        )
                    }
                }

                if (guests.isEmpty()) {
                    item {
                        EmptyState(
                            title = "Henüz davetli yok",
                            description = "İlk davetlini ekle, sonra WhatsApp'tan davetiye gönder.",
                            icon = Icons.Filled.People,
                            actionLabel = "Davetli ekle",
                            onAction = onAddGuest,
                        )
                    }
                }

                // Görev özeti
                item {
                    SectionHeader(
                        "Görevler",
                        actionLabel = "Tümü",
                        onAction = { onNavigate(Screen.TASKS) },
                    )
                }
                item {
                    DugunceCard(onClick = { onNavigate(Screen.TASKS) }) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Filled.TaskAlt,
                                    contentDescription = null,
                                    tint = c.sage,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(Modifier.width(Spacing.sm))
                                Text(
                                    "Açık görev",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = c.inkSoft,
                                )
                            }
                            Text(
                                openTasks.toString(),
                                style = MaterialTheme.typography.titleLarge,
                                color = c.ink,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                // Yaklaşan görevler
                if (upcomingTasks.isNotEmpty()) {
                    items(upcomingTasks.take(3)) { task ->
                        DugunceCard(onClick = { onNavigate(Screen.TASKS) }) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        task.title,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = c.ink,
                                    )
                                    if (task.dueDate != null) {
                                        Text(
                                            Dates.formatDate(task.dueDate),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = c.muted,
                                        )
                                    }
                                }
                                StatusChip(
                                    Dates.relativeDays(task.dueDate),
                                    tone = StatusTone.WARNING,
                                )
                            }
                        }
                    }
                }

                // Yaklaşan ödemeler
                val schedule = summary?.installmentSchedule?.take(3) ?: emptyList()
                if (schedule.isNotEmpty()) {
                    item {
                        SectionHeader(
                            "Yaklaşan ödemeler",
                            actionLabel = "Takvim",
                            onAction = { onNavigate(Screen.INSTALLMENT_CALENDAR) },
                        )
                    }
                    items(schedule) { month ->
                        DugunceCard {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    Dates.formatMonth(month.month),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = c.inkSoft,
                                )
                                MoneyText(Money.formatKurus(month.totalKurus))
                            }
                        }
                    }
                }

                // Hızlı eylemler
                item {
                    Spacer(Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        QuickAction(
                            Icons.Filled.AccountBalanceWallet,
                            "Harcama ekle",
                            onAddExpense,
                            Modifier.weight(1f),
                        )
                        QuickAction(
                            Icons.Filled.People,
                            "Davetli ekle",
                            onAddGuest,
                            Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        item { Spacer(Modifier.height(Spacing.xl)) }
    }
}

/** Bütçe kahraman kartı — üç rakam, birbirine karışmaz (SECURITY §10.1 #7). */
@Composable
private fun BudgetHeroCard(
    totalSpent: String,
    dueThisMonth: String,
    remaining: String,
    onClick: () -> Unit,
) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(Radius.lg),
        color = c.sage,
    ) {
        Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Text(
                "Toplam harcama",
                style = MaterialTheme.typography.labelMedium,
                color = c.sageSoft,
            )
            MoneyText(
                Money.formatKurus(totalSpent),
                big = true,
                color = androidx.compose.ui.graphics.Color.White,
            )

            com.dugunce.app.ui.components.Divider(
                Modifier.background(androidx.compose.ui.graphics.Color(0x33FFFFFF)),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(
                        "Bu ay ödenecek",
                        style = MaterialTheme.typography.labelMedium,
                        color = c.sageSoft,
                    )
                    Spacer(Modifier.height(Spacing.xxs))
                    Text(
                        Money.formatKurus(dueThisMonth),
                        style = MaterialTheme.typography.titleMedium,
                        color = androidx.compose.ui.graphics.Color.White,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "Kalan taahhüt",
                        style = MaterialTheme.typography.labelMedium,
                        color = c.sageSoft,
                    )
                    Spacer(Modifier.height(Spacing.xxs))
                    Text(
                        Money.formatKurus(remaining),
                        style = MaterialTheme.typography.titleMedium,
                        color = androidx.compose.ui.graphics.Color.White,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

/** Küçük istatistik kartı — ikon + etiket + sayı. */
@Composable
private fun StatCard(
    icon: ImageVector,
    label: String,
    value: String,
    tone: StatusTone,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    val tint = when (tone) {
        StatusTone.SUCCESS -> c.success
        StatusTone.WARNING -> c.warning
        StatusTone.DANGER -> c.danger
        StatusTone.INFO -> c.info
        StatusTone.ACCENT -> c.sage
        StatusTone.NEUTRAL -> c.inkSoft
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(Radius.md),
        color = c.surface,
    ) {
        Column(Modifier.padding(Spacing.md), horizontalAlignment = Alignment.Start) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
            Spacer(Modifier.height(Spacing.sm))
            Text(
                value,
                style = MaterialTheme.typography.headlineSmall,
                color = c.ink,
                fontWeight = FontWeight.SemiBold,
            )
            Text(label, style = MaterialTheme.typography.labelSmall, color = c.muted)
        }
    }
}

/** Hızlı eylem kutusu. */
@Composable
private fun QuickAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        modifier = modifier.height(72.dp),
        shape = RoundedCornerShape(Radius.md),
        color = c.sageSoft,
    ) {
        Column(
            Modifier.padding(Spacing.md),
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(icon, contentDescription = null, tint = c.sage, modifier = Modifier.size(20.dp))
            Spacer(Modifier.height(Spacing.xs))
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = c.sage,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}
