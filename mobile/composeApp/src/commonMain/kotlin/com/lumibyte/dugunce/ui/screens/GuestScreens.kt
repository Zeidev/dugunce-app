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
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.lumibyte.dugunce.data.GuestDto
import com.lumibyte.dugunce.data.GuestUsageDto
import com.lumibyte.dugunce.data.Repository
import com.lumibyte.dugunce.ui.components.DugunceButton
import com.lumibyte.dugunce.ui.components.DugunceCard
import com.lumibyte.dugunce.ui.components.DugunceTextField
import com.lumibyte.dugunce.ui.components.EmptyState
import com.lumibyte.dugunce.ui.components.ErrorState
import com.lumibyte.dugunce.ui.components.LoadingState
import com.lumibyte.dugunce.ui.components.QuotaBar
import com.lumibyte.dugunce.ui.components.StatusChip
import com.lumibyte.dugunce.ui.components.StatusTone
import com.lumibyte.dugunce.ui.components.TopBar
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Yüzen düğmelerin görünürlüğü — saf karar, test edilebilir.
 *
 * "Ekle" düğmesi davetli sayısından BAĞIMSIZ görünür: boş listede
 * rehberden eklemenin de bir yolu olmalı (bildirilen hata: davetli
 * yokken yüzen satırın tamamı gizleniyordu ve yalnız `EmptyState`'in
 * elle ekleme düğmesi kalıyordu).
 *
 * "Gönder" davetli gerektirir — boşken anlamsız.
 */
internal data class GuestFabVisibility(
    val showAdd: Boolean,
    val showBulkSend: Boolean,
)

internal fun guestFabVisibility(
    loading: Boolean,
    hasError: Boolean,
    guestCount: Int,
    contactPickerAvailable: Boolean,
): GuestFabVisibility {
    // `contactPickerAvailable` şu an karara girmez: rehber bağlı
    // olmasa da elle ekleme her platformda çalışır. Parametre, ileride
    // "yalnız rehber" bir akış eklenirse diye duruyor ve testi
    // niyeti belgeliyor.
    val ready = !loading && !hasError
    return GuestFabVisibility(
        showAdd = ready,
        showBulkSend = ready && guestCount > 0,
    )
}

/**
 * Davetli listesi — brief §5.4, spec §6b.7.
 *
 * Arama + filtre (taraf, RSVP) + kota göstergesi (spec §6b.6).
 * Limit gizlenmez — açıkça gösterilir.
 */
@Composable
fun GuestListScreen(
    repository: Repository,
    weddingId: String,
    onAddGuest: () -> Unit,
    onOpenGuest: (String) -> Unit,
    /** Davetli ayarları — davetiye görünümü + kişi sayısı. */
    onOpenSettings: () -> Unit = {},
    /** Toplu davetiye gönderimi — her kişiye kendi linki. */
    onBulkSend: () -> Unit = {},
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var guests by remember { mutableStateOf<List<GuestDto>>(emptyList()) }
    var usage by remember { mutableStateOf<GuestUsageDto?>(null) }
    var reloadKey by remember { mutableStateOf(0) }
    var query by remember { mutableStateOf("") }
    var filterSide by remember { mutableStateOf<String?>(null) }
    var filterRsvp by remember { mutableStateOf<String?>(null) }
    var offline by remember { mutableStateOf(false) }
    // Sayfalama (spec §6b.7): ilk sayfa 50, "daha fazla" ile devam
    var hasMore by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // --- Rehberden ekleme ---
    // Tek tek isim/telefon yazmak yerine sistem rehberinden çoklu seçim.
    var importing by remember { mutableStateOf(false) }
    var importMessage by remember { mutableStateOf<String?>(null) }
    var importError by remember { mutableStateOf(false) }

    // "Davetli ekle" seçeneği: rehberden mi elle mi? Boş listede de
    // ulaşılabilir olmalı — bildirilen hata buydu.
    var addSheet by remember { mutableStateOf(false) }

    val contactPicker = com.lumibyte.dugunce.ui.components.rememberContactPicker { picked ->
        if (picked.isEmpty()) return@rememberContactPicker
        importing = true
        importMessage = null
        importError = false
        scope.launch {
            // Seçilen kişileri toplu uca gönder (tek istek).
            val payload = picked.map {
                com.lumibyte.dugunce.data.GuestCreateRequest(
                    name = it.name,
                    phone = it.phone.ifBlank { null },
                    side = filterSide ?: "BRIDE",
                )
            }
            repository.createGuestsBulk(weddingId, payload).fold(
                onSuccess = { added ->
                    importMessage = "${added.size} kişi eklendi."
                    importing = false
                    reloadKey++
                },
                onFailure = { e ->
                    importMessage = e.message ?: "Kişiler eklenemedi"
                    importError = true
                    importing = false
                },
            )
        }
    }

    // spec §6b.7: taraf ve RSVP filtresi SUNUCUDA uygulanır — istemci tüm
    // listeyi çekip elemez. (Arama metni için backend'de parametre yok;
    // yüklü sayfa içinde istemcide süzülür.)
    // Arama da sunucuda: 500 davetlide istemci süzme yetersiz (spec §6b.7)
    LaunchedEffect(weddingId, filterSide, filterRsvp, query, reloadKey) {
        loading = true
        error = null
        val g = repository.listGuests(
            weddingId,
            side = filterSide,
            rsvp = filterRsvp,
            search = query.ifBlank { null },
            limit = PAGE_SIZE,
        )
        val u = repository.guestUsage(weddingId)
        if (g.isFailure) {
            // spec §11: internet yokken son veri görünür
            val cached = repository.cachedGuests(weddingId)
            if (cached != null) {
                guests = cached
                offline = true
                error = null
            } else {
                error = g.exceptionOrNull()?.message ?: "Davetliler yüklenemedi"
            }
            loading = false
            return@LaunchedEffect
        }
        val page = g.getOrNull() ?: emptyList()
        guests = page
        hasMore = page.size == PAGE_SIZE
        usage = u.getOrNull()
        offline = false
        loading = false
    }

    // Sunucu zaten süzdü — istemcide tekrar filtreleme yok
    val filtered = guests

    Column(Modifier.fillMaxSize().background(c.cream)) {
        // Ayarlar düğmesi HER ZAMAN görünür (liste boşken de): davetiye
        // görünümü henüz davetli yokken de anlamlı bir ayardır.
        TopBar(
            "Davetliler",
            actionLabel = "Ayarlar",
            onAction = onOpenSettings,
        )

        Box(Modifier.weight(1f)) {
        when {
            loading -> LoadingState(Modifier.fillMaxSize(), "Davetliler yükleniyor…")
            error != null -> ErrorState(error!!, onRetry = { reloadKey++ }, modifier = Modifier.fillMaxSize())

            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    horizontal = Spacing.screenH,
                    vertical = Spacing.md,
                ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                // Çevrimdışı bandı (spec §11)
                if (offline) {
                    item {
                        com.lumibyte.dugunce.ui.components.InfoBanner(
                            text = "Çevrimdışısın — son yüklenen liste gösteriliyor. " +
                                "Değişiklik yapmak için internet gerekli.",
                        )
                    }
                }

                // Rehberden ekleme sonucu — sessiz kalmasın
                importMessage?.let { msg ->
                    item {
                        com.lumibyte.dugunce.ui.components.InfoBanner(
                            text = msg,
                            isError = importError,
                            onDismiss = { importMessage = null },
                        )
                    }
                }

                // Kota (spec §6b.6)
                item {
                    QuotaBar(
                        used = usage?.used ?: guests.size,
                        limit = usage?.limit,
                        label = "Davetli kotası",
                    )
                }

                // Arama
                item {
                    DugunceTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = "Ara",
                        placeholder = "İsim veya telefon",
                        leadingIcon = AppIcons.Search,
                        imeAction = ImeAction.Search,
                    )
                }

                // Filtreler
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        item { GuestFilter("Tümü", filterRsvp == null && filterSide == null) { filterRsvp = null; filterSide = null } }
                        item { GuestFilter("Bekleyen", filterRsvp == "PENDING") { filterRsvp = "PENDING"; filterSide = null } }
                        item { GuestFilter("Katılacak", filterRsvp == "ATTENDING") { filterRsvp = "ATTENDING"; filterSide = null } }
                        item { GuestFilter("Katılmayacak", filterRsvp == "DECLINED") { filterRsvp = "DECLINED"; filterSide = null } }
                        item { GuestFilter("Gelin", filterSide == "BRIDE") { filterSide = "BRIDE"; filterRsvp = null } }
                        item { GuestFilter("Damat", filterSide == "GROOM") { filterSide = "GROOM"; filterRsvp = null } }
                    }
                }

                // "Davetiye görünümü" kartı KALDIRILDI — aynı giriş artık
                // Davetli ayarları sayfasında (`Screen.GUEST_SETTINGS`).
                // İki yerde olması "hangisi doğru" sorusu doğururdu.

                if (guests.isEmpty()) {
                    item {
                        EmptyState(
                            title = "Henüz davetli yok",
                            description = "İlk davetlini ekle. Sonra WhatsApp'tan davetiye " +
                                "linki gönderebilirsin.",
                            icon = AppIcons.People,
                            actionLabel = "Davetli ekle",
                            // Boş listede TEK giriş noktası bu — o da
                            // seçeneği açmalı, yoksa rehberden eklemenin
                            // yolu kalmazdı.
                            onAction = { addSheet = true },
                        )
                    }
                } else if (filtered.isEmpty()) {
                    item {
                        EmptyState(
                            title = "Sonuç yok",
                            description = "Aramana uyan davetli bulunamadı. Filtreleri temizleyip tekrar dene.",
                            icon = AppIcons.Search,
                        )
                    }
                } else {
                    items(filtered, key = { it.id }) { guest ->
                        GuestRow(guest) { onOpenGuest(guest.id) }
                    }

                    if (hasMore) {
                        item {
                            DugunceButton(
                                if (loadingMore) "Yükleniyor…" else "Daha fazla",
                                onClick = {
                                    if (loadingMore || guests.isEmpty()) return@DugunceButton
                                    loadingMore = true
                                    scope.launch {
                                        repository.listGuests(
                                            weddingId,
                                            side = filterSide,
                                            rsvp = filterRsvp,
                                            search = query.ifBlank { null },
                                            limit = PAGE_SIZE,
                                            cursor = guests.last().id,
                                        ).fold(
                                            onSuccess = { next ->
                                                guests = guests + next
                                                hasMore = next.size == PAGE_SIZE
                                            },
                                            onFailure = { error = it.message },
                                        )
                                        loadingMore = false
                                    }
                                },
                                variant = com.lumibyte.dugunce.ui.components.ButtonVariant.SECONDARY,
                                loading = loadingMore,
                            )
                        }
                    }
                }

                item { Spacer(Modifier.height(Spacing.xxl)) }
            }
        }

        val fab = guestFabVisibility(
            loading = loading,
            hasError = error != null,
            guestCount = guests.size,
            contactPickerAvailable = contactPicker.available,
        )

        if (fab.showAdd) {
            Row(
                Modifier.align(Alignment.BottomEnd).padding(Spacing.lg),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                // Toplu davetiye gönderimi — her kişiye KENDİ linki.
                // Yalnız davetli varsa anlamlı.
                if (fab.showBulkSend) {
                    Surface(
                        onClick = onBulkSend,
                        shape = RoundedCornerShape(Radius.pill),
                        color = c.surface,
                        shadowElevation = 4.dp,
                    ) {
                        Box(Modifier.padding(Spacing.md), contentAlignment = Alignment.Center) {
                            Text(
                                "Gönder",
                                style = MaterialTheme.typography.labelLarge,
                                color = c.sage,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
                // "Toplu" butonu KALDIRILDI (kullanıcı isteği): rehberden
                // çoklu ekleme zaten var, satır satır yazmak gereksizdi.
                // `BulkGuestScreen` ve `Screen.BULK_GUEST` duruyor —
                // ileride gerekirse tek satırla geri açılır.
                //
                // Ekle düğmesi artık SEÇENEK açar (rehber / elle).
                // Eski ayrı "Rehber" düğmesi kaldırıldı: aynı işi iki
                // yerden sunmak "hangisi?" sorusu doğuruyordu ve boş
                // listede hiç görünmüyordu (bildirilen hata).
                Surface(
                    onClick = { if (!importing) addSheet = true },
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
                            if (importing) "Ekleniyor…" else "Davetli",
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
        }
    }

    if (addSheet) {
        AddGuestSheet(
            contactPickerAvailable = contactPicker.available,
            importing = importing,
            onDismiss = { addSheet = false },
            onManual = {
                addSheet = false
                onAddGuest()
            },
            onContactPicker = {
                addSheet = false
                contactPicker.launch()
            },
        )
    }
}

/**
 * "Davetli ekle" seçeneği — rehberden mi elle mi.
 *
 * Alt sayfa (bottom sheet): tek elle ulaşılır ve ileride "Excel'den içe
 * aktar" gibi seçenekler eklemek kolay.
 *
 * Rehber bağlı değilse (iOS) satır GÖSTERİLMEZ — çalışmayan düğme
 * göstermeyiz; elle ekleme her platformda var.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun AddGuestSheet(
    contactPickerAvailable: Boolean,
    importing: Boolean,
    onDismiss: () -> Unit,
    onManual: () -> Unit,
    onContactPicker: () -> Unit,
) {
    val c = DugunceTheme.colors
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = c.surface,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.md)
                .padding(bottom = Spacing.xl),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Text(
                "Davetli ekle",
                style = MaterialTheme.typography.titleMedium,
                color = c.ink,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(vertical = Spacing.sm),
            )

            if (contactPickerAvailable) {
                AddOption(
                    title = if (importing) "Rehberden ekle (ekleniyor…)" else "Rehberden ekle",
                    description = "Telefon rehberinden birden çok kişiyi seç",
                    enabled = !importing,
                    onClick = onContactPicker,
                )
            }

            AddOption(
                title = "Elle ekle",
                description = "İsim ve telefonu kendin yaz",
                enabled = true,
                onClick = onManual,
            )
        }
    }
}

/** Alt sayfadaki tek seçenek satırı. */
@Composable
private fun AddOption(
    title: String,
    description: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(Radius.lg),
        color = c.cream,
        modifier = Modifier.fillMaxWidth().heightIn(min = Spacing.minTouchTarget),
    ) {
        Row(
            Modifier.padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (enabled) c.ink else c.muted,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = c.muted,
                )
            }
            Text("›", style = MaterialTheme.typography.titleLarge, color = c.sage)
        }
    }
}

@Composable
private fun GuestFilter(label: String, selected: Boolean, onClick: () -> Unit) {
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

@Composable
private fun GuestRow(guest: GuestDto, onClick: () -> Unit) {
    val c = DugunceTheme.colors
    DugunceCard(onClick = onClick) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    guest.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = c.ink,
                    fontWeight = FontWeight.Medium,
                )
                if (!guest.phone.isNullOrBlank()) {
                    Spacer(Modifier.height(Spacing.xxs))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            AppIcons.Phone,
                            contentDescription = null,
                            tint = c.muted,
                            modifier = Modifier.size(12.dp),
                        )
                        Spacer(Modifier.width(Spacing.xxs))
                        Text(guest.phone, style = MaterialTheme.typography.bodySmall, color = c.muted)
                    }
                }
                Spacer(Modifier.height(Spacing.sm))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    StatusChip(sideLabel(guest.side), StatusTone.NEUTRAL)
                    StatusChip(
                        rsvpLabel(guest.rsvp),
                        rsvpTone(guest.rsvp),
                        rsvpIcon(guest.rsvp),
                    )
                    // Davetiye gönderildi mi? Kullanıcı "kime gönderdim,
                    // kime göndermedim" ayrımını tek bakışta görsün.
                    if (guest.inviteStatus == "SENT") {
                        StatusChip("Gönderildi", StatusTone.SUCCESS)
                    } else {
                        StatusChip("Gönderilmedi", StatusTone.NEUTRAL)
                    }
                }
            }
        }
    }
}

internal fun rsvpLabel(rsvp: String?): String = when (rsvp) {
    "ATTENDING" -> "Katılacak"
    "DECLINED" -> "Katılmayacak"
    "PENDING" -> "Yanıt yok"
    else -> "—"
}

internal fun rsvpTone(rsvp: String?): StatusTone = when (rsvp) {
    "ATTENDING" -> StatusTone.SUCCESS
    "DECLINED" -> StatusTone.DANGER
    else -> StatusTone.WARNING
}

internal fun rsvpIcon(rsvp: String?): androidx.compose.ui.graphics.vector.ImageVector = when (rsvp) {
    "ATTENDING" -> AppIcons.CheckCircle
    "DECLINED" -> AppIcons.EventBusy
    else -> AppIcons.HourglassEmpty
}

/**
 * Davetli formu — brief §5.4.
 *
 * Alanlar: ad, telefon, taraf, not.
 */
@Composable
fun GuestFormScreen(
    repository: Repository,
    weddingId: String,
    guestId: String?,
    onBack: () -> Unit,
    onSaved: () -> Unit,
) {
    val c = DugunceTheme.colors
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var side by remember { mutableStateOf("BRIDE") }
    var note by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var prefillLoading by remember { mutableStateOf(guestId != null) }
    val scope = rememberCoroutineScope()

    // Düzenleme: mevcut kaydı yükle (aksi halde form boş açılır ve
    // kaydetmek alanları siler)
    LaunchedEffect(guestId) {
        if (guestId == null) return@LaunchedEffect
        repository.listGuests(weddingId).fold(
            onSuccess = { list ->
                list.find { it.id == guestId }?.let { g ->
                    name = g.name
                    phone = g.phone ?: ""
                    side = g.side
                    note = g.note ?: ""
                }
                prefillLoading = false
            },
            onFailure = { error = it.message; prefillLoading = false },
        )
    }

    if (prefillLoading) {
        LoadingState(Modifier.fillMaxSize(), "Davetli yükleniyor…")
        return
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        com.lumibyte.dugunce.ui.components.TopBar(
            if (guestId == null) "Davetli ekle" else "Davetliyi düzenle",
            onBack = onBack,
        )

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DugunceTextField(
                    value = name,
                    onValueChange = { name = it; error = null },
                    label = "Ad soyad",
                    placeholder = "Ayşe Yılmaz",
                    enabled = !saving,
                )
            }
            item {
                DugunceTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = "Telefon (isteğe bağlı)",
                    placeholder = "05xx xxx xx xx",
                    keyboard = KeyboardType.Phone,
                    helper = "WhatsApp davetiyesi için",
                    enabled = !saving,
                )
            }
            item {
                FieldLabel("Taraf")
                com.lumibyte.dugunce.ui.components.SegmentedPicker(
                    options = listOf("BRIDE" to "Gelin", "GROOM" to "Damat"),
                    selected = side,
                    onSelect = { side = it },
                )
            }
            item {
                DugunceTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = "Not (isteğe bağlı)",
                    placeholder = "Aile dostu, 2 kişi gelecek",
                    singleLine = false,
                    minLines = 2,
                    enabled = !saving,
                )
            }
            if (error != null) {
                item { Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger) }
            }
            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            com.lumibyte.dugunce.ui.components.DugunceButton(
                if (guestId == null) "Davetliyi ekle" else "Kaydet",
                onClick = {
                    if (name.trim().isEmpty() || saving) return@DugunceButton
                    saving = true
                    error = null
                    scope.launch {
                        val result = if (guestId == null) {
                            repository.createGuest(
                                weddingId,
                                com.lumibyte.dugunce.data.GuestCreateRequest(
                                    name = name.trim(),
                                    phone = phone.trim().ifBlank { null },
                                    side = side,
                                    note = note.trim().ifBlank { null },
                                ),
                            )
                        } else {
                            repository.updateGuest(
                                weddingId,
                                guestId,
                                com.lumibyte.dugunce.data.GuestPatchRequest(
                                    name = name.trim(),
                                    phone = phone.trim().ifBlank { null },
                                    side = side,
                                    note = note.trim().ifBlank { null },
                                ),
                            )
                        }
                        result.fold(
                            onSuccess = { saving = false; onSaved() },
                            onFailure = { e ->
                                saving = false
                                error = if (e is com.lumibyte.dugunce.api.ApiException) e.message else "Kaydedilemedi"
                            },
                        )
                    }
                },
                enabled = name.trim().isNotEmpty(),
                loading = saving,
            )
        }
    }
}

/**
 * Toplu davetli ekleme — spec §6b.1.
 *
 * Manuel çoklu: formda satır ekleyerek 10-20 kişiyi tek ekranda gir.
 * Transaction: biri hata verirse hiçbiri eklenmez (backend garantisi).
 */
@Composable
fun BulkGuestScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
    onSaved: () -> Unit,
) {
    val c = DugunceTheme.colors
    var rows by remember { mutableStateOf(listOf("", "", "")) }
    var side by remember { mutableStateOf("BRIDE") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val filled = rows.map { it.trim() }.filter { it.isNotEmpty() }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        com.lumibyte.dugunce.ui.components.TopBar("Toplu davetli ekle", onBack = onBack)

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.md),
                    color = c.infoSoft,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "Her satıra bir kişi yaz. Hepsi tek seferde eklenir; " +
                            "biri hata verirse hiçbiri eklenmez.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.info,
                        modifier = Modifier.padding(Spacing.md),
                    )
                }
            }
            item {
                FieldLabel("Taraf")
                com.lumibyte.dugunce.ui.components.SegmentedPicker(
                    options = listOf("BRIDE" to "Gelin", "GROOM" to "Damat"),
                    selected = side,
                    onSelect = { side = it },
                )
            }
            items(rows.size) { idx ->
                DugunceTextField(
                    value = rows[idx],
                    onValueChange = { v ->
                        rows = rows.toMutableList().also { it[idx] = v }
                    },
                    label = "${idx + 1}. kişi",
                    placeholder = "Ad soyad",
                    enabled = !saving,
                )
            }
            item {
                com.lumibyte.dugunce.ui.components.DugunceButton(
                    "Satır ekle",
                    onClick = { rows = rows + "" },
                    variant = com.lumibyte.dugunce.ui.components.ButtonVariant.GHOST,
                )
            }
            if (error != null) {
                item { Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger) }
            }
            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            com.lumibyte.dugunce.ui.components.DugunceButton(
                "${filled.size} kişiyi ekle",
                onClick = {
                    if (filled.isEmpty() || saving) return@DugunceButton
                    saving = true
                    error = null
                    scope.launch {
                        repository.createGuestsBulk(
                            weddingId,
                            filled.map {
                                com.lumibyte.dugunce.data.GuestCreateRequest(name = it, side = side)
                            },
                        ).fold(
                            onSuccess = { saving = false; onSaved() },
                            onFailure = { e ->
                                saving = false
                                error = if (e is com.lumibyte.dugunce.api.ApiException) e.message else "Eklenemedi"
                            },
                        )
                    }
                },
                enabled = filled.isNotEmpty(),
                loading = saving,
            )
        }
    }
}

/** Davetli sayfa boyutu — backend varsayılanıyla aynı (50). */
private const val PAGE_SIZE = 50
