package com.dugunce.app.ui.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.dugunce.app.ui.components.InfoBanner
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.util.copyToClipboard
import com.dugunce.app.util.openUrl
import kotlinx.coroutines.launch

/**
 * Toplu davetiye gönderimi.
 *
 * NEDEN AYRI EKRAN:
 * Her davetlinin KENDİ token'ı olmalı — ortak link gönderilirse kim
 * geldiğini ayırt edemeyiz. Bu ekran her kişi için ayrı davetiye üretir
 * ve tek tek WhatsApp sohbetini açar.
 *
 * NEDEN TEK TEK (WhatsApp kuralı):
 * WhatsApp bir uygulamanın aynı anda birden fazla kişiye KİŞİYE ÖZEL
 * mesaj göndermesine izin vermez (spam koruması). Toplu gönderim
 * denemesi hesabı riske atar. Bu yüzden her kişi için ayrı `wa.me`
 * bağlantısı açılır; kullanıcı gönderip geri döner.
 *
 * İLERLEME: Hangi kişiye gönderildiği işaretlenir, kaldığın yerden
 * devam edilir.
 */
@Composable
fun BulkSendScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
) {
    val c = DugunceTheme.colors
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var guests by remember { mutableStateOf<List<GuestDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }

    /** Gönderilmiş kabul edilenler (kullanıcı "Gönderdim" dedi). */
    var sent by remember { mutableStateOf(setOf<String>()) }
    var working by remember { mutableStateOf<String?>(null) }
    var banner by remember { mutableStateOf<String?>(null) }
    var bannerError by remember { mutableStateOf(false) }

    // Yalnız numarası olanlar gönderilebilir.
    val sendable = guests.filter { !it.phone.isNullOrBlank() }
    val withoutPhone = guests.filter { it.phone.isNullOrBlank() }
    val remaining = sendable.count { it.id !in sent }

    androidx.compose.runtime.LaunchedEffect(weddingId, reloadKey) {
        loading = true
        error = null
        repository.listGuests(weddingId).fold(
            onSuccess = {
                guests = it
                // Sunucudaki "gönderildi" işaretini devral — ekran
                // yenilenince ilerleme kaybolmasın.
                sent = it.filter { g -> g.inviteStatus == "SENT" }.map { g -> g.id }.toSet()
                loading = false
            },
            onFailure = { error = it.message ?: "Davetliler yüklenemedi"; loading = false },
        )
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Toplu davetiye gönder", onBack = onBack)

        when {
            loading -> LoadingState(Modifier.fillMaxSize(), "Davetliler yükleniyor…")

            error != null -> Box(Modifier.fillMaxSize().padding(Spacing.xl)) {
                InfoBanner(
                    text = error!!,
                    isError = true,
                    actionLabel = "Tekrar dene",
                    onAction = { reloadKey++ },
                )
            }

            else -> LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(
                    horizontal = Spacing.screenH,
                    vertical = Spacing.sm,
                ),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                item {
                    Surface(
                        shape = RoundedCornerShape(Radius.md),
                        color = c.infoSoft,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(Spacing.md)) {
                            Text(
                                "Her kişiye KENDİ davetiyesi",
                                style = MaterialTheme.typography.labelLarge,
                                color = c.info,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(Spacing.xs))
                            Text(
                                "WhatsApp aynı anda birden fazla kişiye özel mesaj " +
                                    "göndermeye izin vermez. Bu yüzden her kişi için " +
                                    "ayrı sohbet açılır: gönder, geri dön, sıradakine geç. " +
                                    "Kaldığın yer hatırlanır.",
                                style = MaterialTheme.typography.bodySmall,
                                color = c.info,
                            )
                        }
                    }
                }

                banner?.let { msg ->
                    item {
                        InfoBanner(
                            text = msg,
                            isError = bannerError,
                            onDismiss = { banner = null },
                        )
                    }
                }

                item {
                    Text(
                        if (remaining > 0) "$remaining kişiye gönderilecek" else "Hepsi gönderildi",
                        style = MaterialTheme.typography.labelLarge,
                        color = c.muted,
                    )
                }

                // Numarası olmayanlar — gönderilemez, ama saklanmaz.
                if (withoutPhone.isNotEmpty()) {
                    item {
                        Text(
                            "${withoutPhone.size} kişinin telefonu yok — gönderilemez",
                            style = MaterialTheme.typography.labelSmall,
                            color = c.muted,
                        )
                    }
                }

                // GÖNDERİLMEYENLER ÖNDE: kullanıcı listeyi kaydırmadan
                // sıradaki kişiye ulaşsın. Gönderilenler sona iner.
                items(
                    sendable.sortedBy { it.id in sent },
                    key = { it.id },
                ) { g ->
                    val done = g.id in sent
                    val busy = working == g.id
                    Surface(
                        shape = RoundedCornerShape(Radius.md),
                        color = if (done) c.successSoft else c.surface,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            Modifier.padding(Spacing.md),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    g.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = c.ink,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    g.phone ?: "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = c.muted,
                                )
                            }
                            if (done) {
                                Text(
                                    "Gönderildi",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = c.success,
                                )
                            } else {
                                DugunceButton(
                                    label = if (busy) "Hazırlanıyor…" else "Gönder",
                                    loading = busy,
                                    enabled = working == null,
                                    fullWidth = false,
                                    onClick = {
                                        working = g.id
                                        banner = null
                                        scope.launch {
                                            repository.createInvitation(weddingId, g.id).fold(
                                                onSuccess = { inv ->
                                                    // Backend göreli yol döner ("/d#token");
                                                    // mutlak URL'ye çevrilmeden paylaşılamaz.
                                                    val url = com.dugunce.app.util.Links.guestInvite(
                                                        inv.url ?: inv.invitation?.url,
                                                        inv.invitation?.token,
                                                    )
                                                    if (url == null) {
                                                        banner = "${g.name} için davetiye bağlantısı üretilemedi"
                                                        bannerError = true
                                                        working = null
                                                        return@fold
                                                    }
                                                    val text = buildWhatsAppMessage(g.name, url)
                                                    // whatsapp:// dogrudan sohbeti acar;
                                                    // olmazsa wa.me'ye dus.
                                                    val wa = whatsappUrl(g.phone, text)
                                                    val opened = openUrl(wa) ||
                                                        openUrl(whatsappFallbackUrl(g.phone, text))
                                                    if (opened) {
                                                        sent = sent + g.id
                                                        banner =
                                                            "${g.name} için WhatsApp açıldı. Gönderdikten sonra geri dönün."
                                                        bannerError = false
                                                    } else {
                                                        // Açılamadı: bağlantıyı kopyala, elle gönderilebilsin.
                                                        copyToClipboard(url)
                                                        banner =
                                                            "WhatsApp açılamadı — ${g.name} için bağlantı kopyalandı."
                                                        bannerError = true
                                                    }
                                                },
                                                onFailure = { e ->
                                                    banner = e.message ?: "Davetiye üretilemedi"
                                                    bannerError = true
                                                },
                                            )
                                            working = null
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
