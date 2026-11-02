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
import com.dugunce.app.data.GuestDto
import com.dugunce.app.data.GuestUsageDto
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.theme.DugunceColors

/**
 * Davetli listesi.
 *
 * Limit göstergesi kritik: kullanıcı duvara çarpmadan önce görsün
 * (design "Şeffaflık şartı").
 */
@Composable
fun GuestsScreen(
    repository: Repository,
    weddingId: String,
) {
    var guests by remember { mutableStateOf<List<GuestDto>>(emptyList()) }
    var usage by remember { mutableStateOf<GuestUsageDto?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(weddingId) {
        loading = true
        guests = repository.listGuests(weddingId).getOrNull() ?: emptyList()
        usage = repository.guestUsage(weddingId).getOrNull()
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
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Davetliler",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                usage?.let { u ->
                    val label = if (u.limit == null) {
                        "${u.used} / sınırsız"
                    } else {
                        "${u.used} / ${u.limit}"
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (u.limit != null && u.used >= u.limit) {
                            DugunceColors.Danger
                        } else {
                            DugunceColors.Muted
                        },
                    )
                }
            }
        }

        if (guests.isEmpty()) {
            item {
                Text(
                    text = "Henüz davetli eklenmemiş.",
                    color = DugunceColors.Muted,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
            }
        }

        items(guests) { guest ->
            GuestRow(guest)
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun GuestRow(guest: GuestDto) {
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
                    text = guest.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = DugunceColors.Ink,
                )
                Text(
                    text = buildString {
                        append(if (guest.side == "BRIDE") "Gelin tarafı" else "Damat tarafı")
                        guest.phone?.let { append(" · $it") }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = DugunceColors.Muted,
                )
            }
            RsvpBadge(guest.rsvp)
        }
    }
}

@Composable
private fun RsvpBadge(rsvp: String) {
    val (label, bg, fg) = when (rsvp) {
        "ATTENDING" -> Triple("Geliyor", DugunceColors.AccentSoft, DugunceColors.Accent)
        "DECLINED" -> Triple("Gelmiyor", DugunceColors.DangerSoft, DugunceColors.Danger)
        else -> Triple("Bekliyor", DugunceColors.Background, DugunceColors.Muted)
    }

    Card(
        shape = RoundedCornerShape(999.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = fg,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}
