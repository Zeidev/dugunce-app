package com.dugunce.app.ui.screens

import com.dugunce.app.ui.icons.AppIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.GuestDto
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.EmptyState
import com.dugunce.app.ui.components.ErrorState
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.components.SectionHeader
import com.dugunce.app.ui.components.StatusChip
import com.dugunce.app.ui.components.StatusTone
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Davetli detayı — brief §5.4, §5.5.
 *
 * Detay + RSVP güncelle + davetiye linki üret + WhatsApp paylaşımı.
 *
 * WhatsApp (brief §5.5): mesajı kullanıcı KENDİ hesabından gönderir;
 * otomatik gönderim yok. "Gönderildi" işareti teslim bilgisi değildir.
 */
@Composable
fun GuestDetailScreen(
    repository: Repository,
    weddingId: String,
    guestId: String,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDeleted: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var guest by remember { mutableStateOf<GuestDto?>(null) }
    var inviteUrl by remember { mutableStateOf<String?>(null) }
    var generating by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(guestId, reloadKey) {
        loading = true
        repository.listGuests(weddingId).fold(
            onSuccess = { list ->
                guest = list.find { it.id == guestId }
                loading = false
                error = null
            },
            onFailure = { error = it.message; loading = false },
        )
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Davetli", onBack = onBack, actionLabel = "Düzenle", onAction = onEdit)

        when {
            loading -> LoadingState(Modifier.fillMaxSize())
            error != null -> ErrorState(error!!, modifier = Modifier.fillMaxSize())
            guest == null -> EmptyState(
                title = "Davetli bulunamadı",
                description = "Bu kayıt silinmiş olabilir.",
                icon = AppIcons.People,
                modifier = Modifier.fillMaxSize(),
            )
            else -> {
                val g = guest!!
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md),
                ) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(Radius.lg),
                            color = c.surface,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(Spacing.lg)) {
                                Text(
                                    g.name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = c.ink,
                                )
                                Spacer(Modifier.height(Spacing.sm))
                                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                    StatusChip(sideLabel(g.side), StatusTone.NEUTRAL)
                                    StatusChip(rsvpLabel(g.rsvp), rsvpTone(g.rsvp), rsvpIcon(g.rsvp))
                                }
                                if (!g.phone.isNullOrBlank()) {
                                    Spacer(Modifier.height(Spacing.sm))
                                    Text(
                                        g.phone,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = c.muted,
                                    )
                                }
                                if (!g.note.isNullOrBlank()) {
                                    Spacer(Modifier.height(Spacing.sm))
                                    Text(
                                        g.note,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.muted,
                                    )
                                }
                            }
                        }
                    }

                    // RSVP güncelle (çift telefonla gelen yanıtı girer)
                    item {
                        SectionHeader("Yanıtı güncelle")
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            DugunceButton(
                                "Katılacak",
                                onClick = {
                                    scope.launch {
                                        repository.setGuestRsvp(weddingId, guestId, "ATTENDING")
                                        reloadKey++
                                    }
                                },
                                variant = if (g.rsvp == "ATTENDING") {
                                    com.dugunce.app.ui.components.ButtonVariant.PRIMARY
                                } else {
                                    com.dugunce.app.ui.components.ButtonVariant.SECONDARY
                                },
                                modifier = Modifier.weight(1f),
                            )
                            DugunceButton(
                                "Katılmayacak",
                                onClick = {
                                    scope.launch {
                                        repository.setGuestRsvp(weddingId, guestId, "DECLINED")
                                        reloadKey++
                                    }
                                },
                                variant = if (g.rsvp == "DECLINED") {
                                    com.dugunce.app.ui.components.ButtonVariant.PRIMARY
                                } else {
                                    com.dugunce.app.ui.components.ButtonVariant.SECONDARY
                                },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }

                    // Davetiye linki
                    item {
                        SectionHeader("Davetiye")
                    }
                    item {
                        Surface(
                            shape = RoundedCornerShape(Radius.md),
                            color = c.surface,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                if (inviteUrl == null) {
                                    Text(
                                        "Davetliye özel bir davetiye linki üret. Link tahmin edilemez " +
                                            "ve istediğin zaman iptal edilebilir.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.muted,
                                    )
                                    DugunceButton(
                                        "Davetiye linki oluştur",
                                        onClick = {
                                            if (generating) return@DugunceButton
                                            generating = true
                                            scope.launch {
                                                repository.createInvitation(weddingId, guestId).fold(
                                                    onSuccess = { res ->
                                                        generating = false
                                                        // Backend göreli yol döner ("/d#token") —
                                                        // mutlak URL'ye çevrilmeden paylaşılamaz.
                                                        inviteUrl = com.dugunce.app.util.Links.guestInvite(
                                                            res.url ?: res.invitation?.url,
                                                            res.invitation?.token,
                                                        )
                                                    },
                                                    onFailure = {
                                                        generating = false
                                                        error = it.message
                                                    },
                                                )
                                            }
                                        },
                                        loading = generating,
                                        variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                                        icon = AppIcons.Link,
                                    )
                                } else {
                                    Text(
                                        "Link hazır",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = c.success,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        inviteUrl!!,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.inkSoft,
                                    )
                                    Spacer(Modifier.height(Spacing.xs))
                                    // WhatsApp — kullanıcı kendi hesabından gönderir
                                    val waText = buildWhatsAppMessage(g.name, inviteUrl!!)
                                    val waUrl = "https://wa.me/${normalizePhone(g.phone)}?text=${encodeUrl(waText)}"
                                    DugunceButton(
                                        "WhatsApp'tan gönder",
                                        onClick = { },
                                        icon = AppIcons.Whatsapp,
                                    )
                                    Text(
                                        "wa.me bağlantısı: $waUrl",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = c.muted,
                                    )
                                    Text(
                                        "\"Gönderildi\" işareti teslim bilgisi değildir — " +
                                            "mesajı sen gönderiyorsun.",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = c.muted,
                                    )
                                }
                            }
                        }
                    }

                    item {
                        Spacer(Modifier.height(Spacing.lg))
                        if (!confirmDelete) {
                            DugunceButton(
                                "Davetliyi sil",
                                onClick = { confirmDelete = true },
                                variant = com.dugunce.app.ui.components.ButtonVariant.DANGER,
                            )
                        } else {
                            Surface(
                                shape = RoundedCornerShape(Radius.md),
                                color = c.dangerSoft,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(Modifier.padding(Spacing.md)) {
                                    Text(
                                        "Bu davetli silinsin mi? Davetiyesi de iptal edilir.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = c.danger,
                                    )
                                    Spacer(Modifier.height(Spacing.sm))
                                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                        DugunceButton(
                                            "Evet, sil",
                                            onClick = {
                                                scope.launch {
                                                    repository.deleteGuest(weddingId, guestId).fold(
                                                        onSuccess = { onDeleted() },
                                                        onFailure = { err ->
                                                            error = err.message
                                                            confirmDelete = false
                                                        },
                                                    )
                                                }
                                            },
                                            variant = com.dugunce.app.ui.components.ButtonVariant.DANGER,
                                            modifier = Modifier.weight(1f),
                                        )
                                        DugunceButton(
                                            "Vazgeç",
                                            onClick = { confirmDelete = false },
                                            variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
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

/**
 * WhatsApp davet mesajı — spec §6b.2 şablonu.
 *
 * Türkçe, kullanıcı göndermeden önce düzenleyebilir.
 */
internal fun buildWhatsAppMessage(name: String, url: String): String =
    "Merhaba $name, düğünümüze seni de aramızda görmek isteriz. 🌸\n" +
        "Davetiyemiz ve katılım yanıtın için:\n$url"

/** Telefonu wa.me biçimine çevir — boşsa boş (wa.me seçici açar). */
internal fun normalizePhone(phone: String?): String {
    if (phone.isNullOrBlank()) return ""
    val digits = phone.filter { it.isDigit() }
    return when {
        digits.startsWith("90") -> digits
        digits.startsWith("0") -> "90" + digits.drop(1)
        digits.length == 10 -> "90$digits"
        else -> digits
    }
}

/** URL encode — yalnızca gerekli karakterler. */
internal fun encodeUrl(input: String): String {
    val sb = StringBuilder()
    for (ch in input) {
        when {
            // YALNIZCA ASCII harf/rakam korunur. `isLetterOrDigit()` Türkçe
            // 'ş', 'ğ', 'ı' için de true döner ve onları kodlamadan bırakır —
            // WhatsApp linkinde bozuk karaktere yol açar.
            (ch in 'a'..'z') || (ch in 'A'..'Z') || (ch in '0'..'9') || ch in "-_.~" -> sb.append(ch)
            ch == ' ' -> sb.append("%20")
            else -> {
                val bytes = ch.toString().encodeToByteArray()
                for (b in bytes) {
                    sb.append('%')
                    sb.append(HEX[(b.toInt() shr 4) and 0xF])
                    sb.append(HEX[b.toInt() and 0xF])
                }
            }
        }
    }
    return sb.toString()
}

private const val HEX = "0123456789ABCDEF"
