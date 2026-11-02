package com.dugunce.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.BudgetSummaryDto
import com.dugunce.app.data.ExpenseDto
import com.dugunce.app.data.Money
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.theme.DugunceColors

/**
 * Bütçe ekranı.
 *
 * KRİTİK AYRIM (SECURITY §10.1 #7): "toplam harcama" ile "bu ay ödenecek"
 * AYRI gösterilir. Karışırsa bütçe iki katı görünür.
 */
@Composable
fun BudgetScreen(
    repository: Repository,
    weddingId: String,
) {
    var summary by remember { mutableStateOf<BudgetSummaryDto?>(null) }
    var expenses by remember { mutableStateOf<List<ExpenseDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(weddingId) {
        loading = true
        val s = repository.budgetSummary(weddingId)
        val e = repository.listExpenses(weddingId)

        summary = s.getOrNull()
        expenses = e.getOrNull() ?: emptyList()
        error = when {
            s.isFailure -> "Bütçe yüklenemedi"
            e.isFailure -> "Harcamalar yüklenemedi"
            else -> null
        }
        loading = false
    }

    if (loading) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator(color = DugunceColors.Accent)
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = "Bütçe",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 20.dp, bottom = 4.dp),
            )
        }

        error?.let { msg ->
            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = DugunceColors.DangerSoft,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = msg,
                        color = DugunceColors.Danger,
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        summary?.let { s ->
            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = DugunceColors.Accent,
                    ),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(20.dp)) {
                        Text(
                            text = "Toplam harcama",
                            color = DugunceColors.AccentSoft,
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Text(
                            text = Money.formatKurus(s.totalSpentKurus),
                            color = androidx.compose.ui.graphics.Color.White,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StatCard(
                        label = "Bu ay",
                        value = Money.formatKurus(s.dueThisMonthKurus),
                        modifier = Modifier.weight(1f),
                    )
                    StatCard(
                        label = "Kalan yükümlülük",
                        value = Money.formatKurus(s.remainingCommitmentKurus),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        item {
            Text(
                text = "Harcamalar",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 12.dp),
            )
        }

        if (expenses.isEmpty()) {
            item {
                Text(
                    text = "Henüz harcama eklenmemiş.",
                    color = DugunceColors.Muted,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
        }

        items(expenses) { expense ->
            ExpenseRow(expense)
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DugunceColors.Surface),
        modifier = modifier,
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = DugunceColors.Muted,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = DugunceColors.Ink,
            )
        }
    }
}

@Composable
private fun ExpenseRow(expense: ExpenseDto) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DugunceColors.Surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = expense.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = DugunceColors.Ink,
                )
                val sub = buildString {
                    append(sideLabel(expense.paidBySide))
                    expense.installmentCount?.let { n ->
                        if (n > 1) append(" · $n taksit")
                    }
                }
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = DugunceColors.Muted,
                )
            }
            Text(
                text = Money.formatKurus(expense.amountKurus),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = DugunceColors.Ink,
            )
        }
    }
}

private fun sideLabel(side: String): String = when (side) {
    "BRIDE" -> "Gelin tarafı"
    "GROOM" -> "Damat tarafı"
    else -> "Ortak"
}
