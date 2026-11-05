package com.lumibyte.dugunce.ui.screens

import com.lumibyte.dugunce.ui.icons.AppIcons
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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.lumibyte.dugunce.data.BudgetSummaryDto
import com.lumibyte.dugunce.data.GuestDto
import com.lumibyte.dugunce.data.Money
import com.lumibyte.dugunce.data.Repository
import com.lumibyte.dugunce.data.TaskDto
import com.lumibyte.dugunce.data.WeddingDto
import com.lumibyte.dugunce.ui.components.DugunceCard
import com.lumibyte.dugunce.ui.components.EmptyState
import com.lumibyte.dugunce.ui.components.ErrorState
import com.lumibyte.dugunce.ui.components.LoadingState
import com.lumibyte.dugunce.ui.components.MoneyText
import com.lumibyte.dugunce.ui.components.SectionHeader
import com.lumibyte.dugunce.ui.components.StatusChip
import com.lumibyte.dugunce.ui.components.StatusTone
import com.lumibyte.dugunce.ui.components.TextAction
import com.lumibyte.dugunce.ui.nav.Screen
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import com.lumibyte.dugunce.util.Dates

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
        // Başlık — web'deki `.hero` ile aynı dil:
        // altın eyebrow (tarih), serif isim, mekân satırı.
        item {
            Column {
                Text(
                    buildString {
                        append(Dates.formatDate(wedding.weddingDate))
                        if (daysLeft != null && daysLeft >= 0) {
                            append(" · ${Dates.relativeDays(wedding.weddingDate)}")
                        }
                    }.uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 2.6.sp),
                    color = c.gold,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(Spacing.sm))
                Text(
                    wedding.coupleNames,
                    style = MaterialTheme.typography.headlineLarge,
                    color = c.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (wedding.venueName != null) {
                    Spacer(Modifier.height(Spacing.sm))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            AppIcons.CalendarMonth,
                            contentDescription = null,
                            tint = c.muted,
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(Spacing.xs))
                        Text(
                            wedding.venueName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = c.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
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
                            AppIcons.CheckCircle,
                            "Katılacak",
                            attending.toString(),
                            StatusTone.SUCCESS,
                            Modifier.weight(1f),
                        )
                        StatCard(
                            AppIcons.EventBusy,
                            "Katılmayacak",
                            declined.toString(),
                            StatusTone.DANGER,
                            Modifier.weight(1f),
                        )
                        StatCard(
                            AppIcons.HourglassEmpty,
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
                            icon = AppIcons.People,
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
                                    AppIcons.TaskAlt,
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
                    items(upcomingTasks.take(2)) { task ->
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
                            AppIcons.AccountBalanceWallet,
                            "Harcama ekle",
                            onAddExpense,
                            Modifier.weight(1f),
                        )
                        QuickAction(
                            AppIcons.People,
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
    val isDark = c.isDark
    // Koyu tema: kart zemini sayfadan AYRIŞMALI. Açık tema: adaçayı koyu blok.
    // Ölçüldü — koyu temada kart/zemin kontrastı 1.39:1, kenarlık şart.
    val cardBg = if (isDark) androidx.compose.ui.graphics.Color(0xFF2A3328) else c.sage
    val cardBorder = if (isDark) {
        androidx.compose.foundation.BorderStroke(1.dp, androidx.compose.ui.graphics.Color(0xFF3A4536))
    } else {
        null
    }
    val labelColor = if (isDark) c.goldBright else androidx.compose.ui.graphics.Color(0xFFC9A961)
    val subLabelColor = if (isDark) {
        androidx.compose.ui.graphics.Color(0xFFA8A29A)
    } else {
        androidx.compose.ui.graphics.Color(0xB8F2EFE8)
    }
    val valueColor = if (isDark) c.ink else androidx.compose.ui.graphics.Color.White

    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(Radius.lg),
        color = cardBg,
        border = cardBorder,
    ) {
        Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Text(
                "TOPLAM HARCANAN",
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 2.2.sp),
                color = labelColor,
                fontWeight = FontWeight.SemiBold,
            )
            // Rakam serif + büyük — web'deki `.budget-num`.
            Text(
                Money.formatKurus(totalSpent),
                style = MaterialTheme.typography.displaySmall,
                color = valueColor,
                fontWeight = FontWeight.Bold,
            )

            com.lumibyte.dugunce.ui.components.Divider(
                Modifier.background(
                    if (isDark) androidx.compose.ui.graphics.Color(0xFF3A4536)
                    else androidx.compose.ui.graphics.Color(0x33FFFFFF),
                ),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(
                        "BU AY",
                        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.6.sp),
                        color = subLabelColor,
                    )
                    Spacer(Modifier.height(Spacing.xxs))
                    Text(
                        Money.formatKurus(dueThisMonth),
                        style = MaterialTheme.typography.titleMedium,
                        color = valueColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "KALAN",
                        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.6.sp),
                        color = subLabelColor,
                    )
                    Spacer(Modifier.height(Spacing.xxs))
                    Text(
                        Money.formatKurus(remaining),
                        style = MaterialTheme.typography.titleMedium,
                        color = valueColor,
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
    // Web'deki `.stat`: renkli nokta + sol yaslı serif rakam.
    // Renk TEK BAŞINA anlam taşımaz — metin etiket her zaman görünür
    // (brief §3.1).
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(Radius.md),
        color = c.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, c.line),
    ) {
        Column(Modifier.padding(Spacing.md), horizontalAlignment = Alignment.Start) {
            Box(
                Modifier
                    .size(6.dp)
                    .background(tint, CircleShape),
            )
            Spacer(Modifier.height(Spacing.sm))
            Text(
                value,
                style = MaterialTheme.typography.headlineMedium,
                color = c.ink,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(2.dp))
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
