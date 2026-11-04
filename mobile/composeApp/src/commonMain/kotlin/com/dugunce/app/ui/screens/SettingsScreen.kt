package com.dugunce.app.ui.screens

import com.dugunce.app.ui.icons.AppIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TokenStore
import com.dugunce.app.data.WeddingDto
import com.dugunce.app.data.WeddingCreateRequest
import com.dugunce.app.ui.components.CheckRow
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.DugunceTextField
import com.dugunce.app.ui.components.SectionHeader
import com.dugunce.app.ui.components.SegmentedPicker
import com.dugunce.app.ui.components.StatusChip
import com.dugunce.app.ui.components.StatusTone
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.ui.theme.ThemeMode
import com.dugunce.app.util.Dates
import kotlinx.coroutines.launch

/**
 * Ayarlar — spec §6.5.
 *
 * Düğün bilgileri, plan, kota, bildirim, tema, çıkış.
 */
@Composable
fun SettingsScreen(
    repository: Repository,
    tokens: TokenStore,
    wedding: WeddingDto,
    themeMode: ThemeMode,
    onThemeChange: (ThemeMode) -> Unit,
    onLoggedOut: () -> Unit,
    onInviteCoOwner: () -> Unit = {},
    onOpenCards: () -> Unit = {},
    onOpenTemplates: () -> Unit = {},
    /** Eşinden kod aldı — katılma ekranını aç. */
    onJoinWithCode: () -> Unit = {},
) {
    val c = DugunceTheme.colors
    var editing by remember { mutableStateOf(false) }
    var coupleNames by remember { mutableStateOf(wedding.coupleNames) }
    var dateText by remember { mutableStateOf(Dates.formatShort(wedding.weddingDate)) }
    var venueName by remember { mutableStateOf(wedding.venueName ?: "") }
    var venueAddress by remember { mutableStateOf(wedding.venueAddress ?: "") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LazyColumn(
        Modifier.fillMaxSize().background(c.cream),
        contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        item {
            Text(
                "Ayarlar",
                style = MaterialTheme.typography.headlineLarge,
                color = c.ink,
            )
        }

        // --- Düğün bilgileri ---
        item { SectionHeader("Düğün bilgileri", actionLabel = if (editing) "Vazgeç" else "Düzenle") { editing = !editing } }

        if (!editing) {
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.lg),
                    color = c.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        SettingRow("Çift", wedding.coupleNames)
                        SettingRow("Tarih", Dates.formatDate(wedding.weddingDate))
                        if (!wedding.venueName.isNullOrBlank()) {
                            SettingRow("Mekân", wedding.venueName)
                        }
                        if (!wedding.venueAddress.isNullOrBlank()) {
                            SettingRow("Adres", wedding.venueAddress)
                        }
                        SettingRow("Saat dilimi", wedding.timezone)
                    }
                }
            }
        } else {
            item {
                DugunceTextField(
                    value = coupleNames,
                    onValueChange = { coupleNames = it; error = null },
                    label = "Çift isimleri",
                    enabled = !saving,
                )
            }
            item {
                DugunceTextField(
                    value = dateText,
                    onValueChange = { dateText = it; error = null },
                    label = "Düğün tarihi",
                    placeholder = "12.09.2026",
                    keyboard = KeyboardType.Number,
                    error = if (dateText.isNotBlank() && parseTurkishDate(dateText) == null) "gg.aa.yyyy" else null,
                    enabled = !saving,
                )
            }
            item {
                DugunceTextField(
                    value = venueName,
                    onValueChange = { venueName = it },
                    label = "Mekân",
                    enabled = !saving,
                )
            }
            item {
                DugunceTextField(
                    value = venueAddress,
                    onValueChange = { venueAddress = it },
                    label = "Adres",
                    singleLine = false,
                    minLines = 2,
                    enabled = !saving,
                )
            }
            if (error != null) {
                item { Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger) }
            }
            item {
                DugunceButton(
                    "Kaydet",
                    onClick = {
                        val iso = parseTurkishDate(dateText) ?: return@DugunceButton
                        saving = true
                        scope.launch {
                            repository.updateWedding(
                                wedding.id,
                                WeddingCreateRequest(
                                    coupleNames = coupleNames.trim(),
                                    weddingDate = iso,
                                    venueName = venueName.trim().ifBlank { null },
                                    venueAddress = venueAddress.trim().ifBlank { null },
                                ),
                            ).fold(
                                onSuccess = { saving = false; editing = false },
                                onFailure = { e ->
                                    saving = false
                                    error = e.message
                                },
                            )
                        }
                    },
                    loading = saving,
                    enabled = coupleNames.trim().isNotEmpty(),
                )
            }
        }

        // --- İkinci eş ---
        // --- Davetiye görünümü ---
        item { SectionHeader("Davetiye") }
        item {
            Surface(
                shape = RoundedCornerShape(Radius.lg),
                color = c.surface,
                modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenTemplates),
            ) {
                Row(
                    Modifier.padding(Spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Davetiye görünümü",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = c.ink,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "Şablon ve font seç",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                    }
                    Text("›", style = MaterialTheme.typography.titleLarge, color = c.muted)
                }
            }
        }

        item { SectionHeader("Düğün ortağı") }
        item {
            Surface(
                shape = RoundedCornerShape(Radius.lg),
                color = c.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(
                        "Eşini davet et, o da tam yetkili olsun",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.ink,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        "7 karakterlik bir kod üret. Eşin uygulamaya giriş yaptıktan " +
                            "sonra kodu girer ve aynı düğünün ikinci sahibi olur.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.muted,
                    )
                    DugunceButton(
                        "Davet kodu oluştur",
                        onClick = onInviteCoOwner,
                        variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                    )

                    // TERS YÖN: kullanıcı kendisi davet edilen taraf olabilir.
                    // Önceki hatada kod girişi yalnız giriş ekranındaydı;
                    // hesabı olan kullanıcı eşinden kod aldığında girecek
                    // yer bulamıyordu.
                    Text(
                        "Eşinden kod aldıysan buradan katıl",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.ink,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(top = Spacing.md),
                    )
                    Text(
                        "7 karakterlik kodu gir, aynı düğünün ikinci sahibi ol.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.muted,
                    )
                    DugunceButton(
                        "Davet kodum var",
                        onClick = onJoinWithCode,
                        variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                    )
                }
            }
        }

        // --- Plan ---
        item { SectionHeader("Plan") }
        item {
            Surface(
                shape = RoundedCornerShape(Radius.lg),
                color = c.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.material3.Icon(
                                AppIcons.WorkspacePremium,
                                contentDescription = null,
                                tint = c.warning,
                                modifier = Modifier.padding(end = Spacing.sm),
                            )
                            Text(
                                if (wedding.plan == "PREMIUM") "Premium" else "Ücretsiz plan",
                                style = MaterialTheme.typography.titleMedium,
                                color = c.ink,
                            )
                        }
                        StatusChip(
                            if (wedding.plan == "PREMIUM") "Aktif" else "Sınırlı",
                            if (wedding.plan == "PREMIUM") StatusTone.SUCCESS else StatusTone.NEUTRAL,
                        )
                    }

                    if (wedding.plan != "PREMIUM") {
                        Text(
                            "Ücretsiz: 30 davetli · 1 yardımcı · 1 görev · 50 MB fotoğraf",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                        Text(
                            "Premium: sınırsız davetli ve görev · 5 yardımcı · 500 MB fotoğraf",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                        DugunceButton(
                            "Premium'a geç",
                            // Satın alma henüz yok. Tıklanabilir bırakmak
                            // "bastım, bir şey olmadı" hissi veriyordu;
                            // devre dışı bırakmak dürüst.
                            onClick = { },
                            enabled = false,
                            variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                        )
                        Text(
                            "Satın alma yakında — mağaza entegrasyonu hazırlanıyor.",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                    }
                }
            }
        }

        // --- Tema ---
        item { SectionHeader("Görünüm") }
        item {
            Surface(
                shape = RoundedCornerShape(Radius.lg),
                color = c.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(Spacing.lg)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Icon(
                            AppIcons.DarkMode,
                            contentDescription = null,
                            tint = c.sage,
                            modifier = Modifier.padding(end = Spacing.sm),
                        )
                        Text("Tema", style = MaterialTheme.typography.bodyLarge, color = c.ink)
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    SegmentedPicker(
                        options = listOf(
                            ThemeMode.SYSTEM to "Sistem",
                            ThemeMode.LIGHT to "Açık",
                            ThemeMode.DARK to "Koyu",
                        ),
                        selected = themeMode,
                        onSelect = onThemeChange,
                    )
                }
            }
        }

        // --- Bildirim ---
        item { SectionHeader("Bildirimler") }
        item {
            Surface(
                shape = RoundedCornerShape(Radius.lg),
                color = c.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(Spacing.md)) {
                    // TokenStore düz getter/setter'dır; Compose değişimi
                    // görmez. Yerel state ile sarıyoruz, kalıcılık aynı.
                    var notifOn by remember { mutableStateOf(tokens.notificationsEnabled) }
                    CheckRow(
                        label = "Bildirimlere izin ver",
                        description = "RSVP yanıtı ve görev değişikliklerinde haber verir. " +
                            "İzin vermezsen uygulama çalışmaya devam eder.",
                        checked = notifOn,
                        onCheckedChange = {
                            notifOn = it
                            tokens.notificationsEnabled = it
                        },
                    )
                    Text(
                        "Sessiz saat: 22:00–09:00 arası bildirim gönderilmez.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.muted,
                        modifier = Modifier.padding(start = Spacing.sm, bottom = Spacing.sm),
                    )
                }
            }
        }

        // --- Hesap ---
        item { SectionHeader("Hesap") }
        item {
            Surface(
                shape = RoundedCornerShape(Radius.lg),
                color = c.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Icon(
                            AppIcons.Person,
                            contentDescription = null,
                            tint = c.muted,
                            modifier = Modifier.padding(end = Spacing.sm),
                        )
                        Text(
                            tokens.userEmail ?: "Giriş yapılmış",
                            style = MaterialTheme.typography.bodyMedium,
                            color = c.inkSoft,
                        )
                    }
                    Spacer(Modifier.height(Spacing.sm))
                    if (!showLogoutConfirm) {
                        DugunceButton(
                            "Çıkış yap",
                            onClick = { showLogoutConfirm = true },
                            variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                        )
                    } else {
                        Surface(
                            shape = RoundedCornerShape(Radius.md),
                            color = c.dangerSoft,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(Spacing.md)) {
                                Text(
                                    "Çıkış yapılsın mı? Tekrar giriş için e-posta gerekir.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = c.danger,
                                )
                                Spacer(Modifier.height(Spacing.sm))
                                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                    DugunceButton(
                                        "Çıkış yap",
                                        onClick = {
                                            scope.launch {
                                                repository.logout()
                                                onLoggedOut()
                                            }
                                        },
                                        variant = com.dugunce.app.ui.components.ButtonVariant.DANGER,
                                        modifier = Modifier.weight(1f),
                                    )
                                    DugunceButton(
                                        "Vazgeç",
                                        onClick = { showLogoutConfirm = false },
                                        variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // --- Uygulama bilgisi ---
        item {
            Column(
                Modifier.fillMaxWidth().padding(vertical = Spacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "Düğünce ${com.dugunce.app.api.ApiConfig.APP_VERSION}",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.muted,
                )
            }
        }

        item { Spacer(Modifier.height(Spacing.xxl)) }
    }
}

@Composable
private fun SettingRow(label: String, value: String) {
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
