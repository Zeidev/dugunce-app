package com.lumibyte.dugunce.ui.screens

import com.lumibyte.dugunce.ui.icons.AppIcons
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
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.lumibyte.dugunce.data.GuestDto
import com.lumibyte.dugunce.data.Repository
import com.lumibyte.dugunce.ui.components.DugunceButton
import com.lumibyte.dugunce.ui.components.EmptyState
import com.lumibyte.dugunce.ui.components.ErrorState
import com.lumibyte.dugunce.ui.components.LoadingState
import com.lumibyte.dugunce.ui.components.SectionHeader
import com.lumibyte.dugunce.ui.components.StatusChip
import com.lumibyte.dugunce.ui.components.DugunceTextField
import com.lumibyte.dugunce.ui.components.TextAction
import com.lumibyte.dugunce.ui.components.StatusTone
import com.lumibyte.dugunce.ui.components.TopBar
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import com.lumibyte.dugunce.util.copyToClipboard
import com.lumibyte.dugunce.util.openUrl
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
    /** Düğünün kişi sayısı ayarları — aralık buradan gelir. */
    partySizeEnabled: Boolean = true,
    defaultPartySize: Int = 2,
    maxPartySize: Int = 10,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var guest by remember { mutableStateOf<GuestDto?>(null) }
    var inviteUrl by remember { mutableStateOf<String?>(null) }
    var generating by remember { mutableStateOf(false) }
    // WhatsApp açılamazsa gösterilecek mesaj (sessiz kalmasın).
    var waError by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableStateOf(0) }
    // Telefonu olmayan davetliye numara ekleyebilmek için (rehberden
    // eklenen kişide numara gelmemiş olabilir; o zaman davetiye
    // gönderilemiyordu).
    // Aralık düğün ayarlarından: varsayılan değerle başla, düğünün
    // azamisini geçme. Sabit 2/10 yazmak ayarı yalan söyler hâle getirirdi.
    //
    // `coerceIn(1, maxPartySize)` TEK BAŞINA YETMEZ: `maxPartySize < 1`
    // ise (bozuk/eski kayıt) Kotlin `IllegalArgumentException` fırlatır ve
    // EKRAN ÇÖKER. Önce güvenli aralık kurulur.
    var partySize by remember(guestId, defaultPartySize, maxPartySize) {
        val safeMax = maxPartySize.coerceAtLeast(1)
        mutableStateOf(defaultPartySize.coerceIn(1, safeMax))
    }
    var editingPhone by remember { mutableStateOf(false) }
    var phoneText by remember { mutableStateOf("") }
    var savingPhone by remember { mutableStateOf(false) }
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
                                Spacer(Modifier.height(Spacing.sm))
                                if (editingPhone) {
                                    DugunceTextField(
                                        value = phoneText,
                                        onValueChange = { phoneText = it },
                                        label = "Telefon",
                                        placeholder = "0532 123 45 67",
                                        keyboard = KeyboardType.Phone,
                                        imeAction = ImeAction.Done,
                                        enabled = !savingPhone,
                                    )
                                    Spacer(Modifier.height(Spacing.xs))
                                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                        DugunceButton(
                                            label = "Kaydet",
                                            loading = savingPhone,
                                            fullWidth = false,
                                            onClick = {
                                                savingPhone = true
                                                scope.launch {
                                                    repository.updateGuest(
                                                        weddingId,
                                                        g.id,
                                                        com.lumibyte.dugunce.data.GuestPatchRequest(
                                                            phone = phoneText.trim(),
                                                        ),
                                                    ).fold(
                                                        onSuccess = {
                                                            savingPhone = false
                                                            editingPhone = false
                                                            reloadKey++
                                                        },
                                                        onFailure = { e ->
                                                            savingPhone = false
                                                            error = e.message
                                                        },
                                                    )
                                                }
                                            },
                                        )
                                        DugunceButton(
                                            label = "Vazgeç",
                                            variant = com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY,
                                            fullWidth = false,
                                            enabled = !savingPhone,
                                            onClick = { editingPhone = false },
                                        )
                                    }
                                } else if (!g.phone.isNullOrBlank()) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            g.phone,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = c.muted,
                                        )
                                        Spacer(Modifier.width(Spacing.xs))
                                        TextAction(
                                            "Düzenle",
                                            onClick = {
                                                phoneText = g.phone
                                                editingPhone = true
                                            },
                                        )
                                    }
                                } else {
                                    // Telefon YOK — davetiye gönderilemez.
                                    // Kullanıcı buradan ekleyebilmeli.
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            "Telefon yok — davetiye gönderilemez",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = c.danger,
                                        )
                                        Spacer(Modifier.width(Spacing.xs))
                                        TextAction(
                                            "Ekle",
                                            onClick = {
                                                phoneText = ""
                                                editingPhone = true
                                            },
                                        )
                                    }
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
                                    com.lumibyte.dugunce.ui.components.ButtonVariant.PRIMARY
                                } else {
                                    com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY
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
                                    com.lumibyte.dugunce.ui.components.ButtonVariant.PRIMARY
                                } else {
                                    com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY
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
                                    // Kaç kişi gelebilir? Davetli bu sınıra kadar
                                    // artırabilir. Aralık DÜĞÜN ayarlarından:
                                    // sabit 2/10 yazmak ayarı yalan söylerdi.
                                    //
                                    // Özellik kapalıyken blok GİZLENİR —
                                    // davetiye zaten kişi sayısı sormuyor.
                                    if (partySizeEnabled) {
                                        Text(
                                            "En fazla kaç kişi gelebilir?",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = c.muted,
                                        )
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                                        ) {
                                            DugunceButton(
                                                label = "−",
                                                variant = com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY,
                                                fullWidth = false,
                                                enabled = partySize > 1 && !generating,
                                                onClick = { if (partySize > 1) partySize-- },
                                            )
                                            Text(
                                                "$partySize kişi",
                                                style = MaterialTheme.typography.bodyLarge,
                                                color = c.ink,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            DugunceButton(
                                                label = "+",
                                                variant = com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY,
                                                fullWidth = false,
                                                enabled = partySize < maxPartySize && !generating,
                                                onClick = { if (partySize < maxPartySize) partySize++ },
                                            )
                                        }
                                        Spacer(Modifier.height(Spacing.xs))
                                    }

                                    DugunceButton(
                                        "Davetiye linki oluştur",
                                        onClick = {
                                            if (generating) return@DugunceButton
                                            generating = true
                                            scope.launch {
                                                repository.createInvitation(
                                                    weddingId,
                                                    guestId,
                                                    // Özellik kapalıyken 1 gönder: `null`
                                                    // göndermek backend varsayılanına (2)
                                                    // düşer ve özellik "kapalı" görünmez.
                                                    if (partySizeEnabled) partySize else 1,
                                                ).fold(
                                                    onSuccess = { res ->
                                                        generating = false
                                                        // Backend göreli yol döner ("/d#token") —
                                                        // mutlak URL'ye çevrilmeden paylaşılamaz.
                                                        inviteUrl = com.lumibyte.dugunce.util.Links.guestInvite(
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
                                        variant = com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY,
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
                                    // WhatsApp — kullanıcı kendi hesabından gönderir.
                                    //
                                    // ÖNCE: `onClick = { }` idi — buton hiçbir
                                    // şey yapmıyordu ("bastım, bir şey olmadı").
                                    // Artık wa.me bağlantısı açılır: WhatsApp
                                    // kuruluysa sohbet, değilse tarayıcı.
                                    val waText = buildWhatsAppMessage(g.name, inviteUrl!!)
                                    // `whatsapp://` doğrudan sohbeti açar; `wa.me`
                                    // bazen ana ekranda kalıyordu (bildirilen hata).
                                    val waUrl = whatsappUrl(g.phone, waText)
                                    val waFallback = whatsappFallbackUrl(g.phone, waText)
                                    DugunceButton(
                                        "WhatsApp'tan gönder",
                                        onClick = {
                                            val opened = openUrl(waUrl) || openUrl(waFallback)
                                            if (!opened) {
                                                // Açılamadıysa sessiz kalma:
                                                // bağlantıyı kopyala, elle gönderilebilsin.
                                                copied = copyToClipboard(waFallback)
                                                waError = if (copied) {
                                                    "WhatsApp açılamadı — bağlantı kopyalandı, elle gönderebilirsiniz."
                                                } else {
                                                    "WhatsApp açılamadı. Aşağıdaki bağlantıyı seçip kopyalayın."
                                                }
                                            } else {
                                                waError = null
                                            }
                                        },
                                        icon = AppIcons.Whatsapp,
                                    )
                                    waError?.let { msg ->
                                        Spacer(Modifier.height(Spacing.xs))
                                        Text(
                                            msg,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = c.danger,
                                        )
                                    }
                                    Text(
                                        "wa.me bağlantısı: $waFallback",
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
                                variant = com.lumibyte.dugunce.ui.components.ButtonVariant.DANGER,
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
                                            variant = com.lumibyte.dugunce.ui.components.ButtonVariant.DANGER,
                                            modifier = Modifier.weight(1f),
                                        )
                                        DugunceButton(
                                            "Vazgeç",
                                            onClick = { confirmDelete = false },
                                            variant = com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY,
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

/**
 * URL encode (RFC 3986) — emoji ve Türkçe karakterler dahil.
 *
 * KRİTİK: Dönüşüm TÜM STRING üzerinden yapılır, karakter karakter değil.
 *
 * ÖNCE: her `char` ayrı ayrı `encodeToByteArray()` ile kodlanıyordu.
 * Kotlin `String` UTF-16'dır; emoji (ör. 🌸 = U+1F338) İKİ `char`'dan
 * (surrogate pair) oluşur. Her yarı tek başına çevrilince geçersiz
 * UTF-8 çıkıyor ve WhatsApp'ta "??" görünüyordu (bildirilen hata).
 *
 * DOĞRU: `encodeToByteArray()` bir kere çağrılır; surrogate çifti
 * bütün olarak tek kod noktasına çevrilir.
 */
internal fun encodeUrl(input: String): String {
    val sb = StringBuilder()
    // Tek seferde UTF-8 byte dizisi — surrogate pair'ler bütün kalır.
    for (b in input.encodeToByteArray()) {
        val v = b.toInt() and 0xFF
        val ch = v.toChar()
        when {
            // YALNIZCA ASCII harf/rakam ve güvenli işaretler korunur.
            // `isLetterOrDigit()` Türkçe 'ş', 'ğ', 'ı' için de true döner
            // ve onları kodlamadan bırakır — WhatsApp'ta bozuk görünür.
            (ch in 'a'..'z') || (ch in 'A'..'Z') || (ch in '0'..'9') || ch in "-_.~" -> sb.append(ch)
            else -> {
                sb.append('%')
                sb.append(HEX[(v shr 4) and 0xF])
                sb.append(HEX[v and 0xF])
            }
        }
    }
    return sb.toString()
}

private const val HEX = "0123456789ABCDEF"

/**
 * WhatsApp sohbet bağlantısı — kişiye özel.
 *
 * `whatsapp://send?phone=...` ŞEMASI KULLANILIR, `wa.me` değil.
 *
 * NEDEN: `https://wa.me/<numara>` bazen WhatsApp'ı açıp ANA SOHBET
 * EKRANINDA kalıyor — kullanıcı kişiyi elle aramak zorunda kalıyordu
 * (bildirilen hata). `whatsapp://send?phone=` doğrudan o numaranın
 * sohbetini açar; WhatsApp kurulu değilse çağıran `wa.me`'ye düşer.
 *
 * @param phone ham telefon (normalize edilir)
 * @param text gönderilecek mesaj
 */
internal fun whatsappUrl(phone: String?, text: String): String {
    val num = normalizePhone(phone)
    val encoded = encodeUrl(text)
    return if (num.isBlank()) {
        // Numara yoksa sohbet seçtir (kaçınılmaz).
        "https://wa.me/?text=$encoded"
    } else {
        "whatsapp://send?phone=$num&text=$encoded"
    }
}

/**
 * WhatsApp açılamazsa kullanılacak yedek bağlantı.
 *
 * `whatsapp://` şeması cihazda yoksa (uygulama kurulu değil) tarayıcıya
 * düşmek gerekir; `wa.me` her durumda çalışır.
 */
internal fun whatsappFallbackUrl(phone: String?, text: String): String {
    val num = normalizePhone(phone)
    val encoded = encodeUrl(text)
    return "https://wa.me/$num?text=$encoded"
}
