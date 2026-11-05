package com.lumibyte.dugunce.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material3.AlertDialog
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
import com.lumibyte.dugunce.data.Repository
import com.lumibyte.dugunce.data.WeddingDto
import com.lumibyte.dugunce.data.WeddingPatchRequest
import com.lumibyte.dugunce.ui.PlatformBackHandler
import com.lumibyte.dugunce.ui.components.CheckRow
import com.lumibyte.dugunce.ui.components.DugunceButton
import com.lumibyte.dugunce.ui.components.DugunceTextField
import com.lumibyte.dugunce.ui.components.InfoBanner
import com.lumibyte.dugunce.ui.components.ButtonVariant
import com.lumibyte.dugunce.ui.components.SectionHeader
import com.lumibyte.dugunce.ui.components.StatusChip
import com.lumibyte.dugunce.ui.components.StatusTone
import com.lumibyte.dugunce.ui.components.TextAction
import com.lumibyte.dugunce.ui.components.TopBar
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import kotlinx.coroutines.launch

/** Kişi sayısı aralığı — backend `invitation.ts` ile aynı. */
private const val MIN_PARTY = 1
private const val MAX_PARTY = 10

/**
 * Davetli ayarları — davetiye davranışının tek yönetim yeri.
 *
 * Üç bölüm:
 *  1. **Davetiye görünümü** — şablon + font (mevcut `TemplateScreen`).
 *  2. **Kişi sayısı anahtarı** — kapalıyken davetiye yalnız
 *     "Geliyorum"/"Gelemeyeceğim" gösterir.
 *  3. **Varsayılan ve azami kişi sayısı**.
 *
 * KAYDET MODELİ: değişiklikler YEREL tutulur, sunucuya yalnız Kaydet'te
 * gider. Tek istek, yalnız değişen alanlar. Bu, `default ≤ max` çapraz
 * kuralının her zaman tutarlı gönderilmesini garanti eder.
 */
@Composable
fun GuestSettingsScreen(
    wedding: WeddingDto,
    repository: Repository,
    onBack: () -> Unit,
    onOpenTemplates: () -> Unit,
    onSaved: (WeddingDto) -> Unit = {},
) {
    val c = DugunceTheme.colors
    val scope = rememberCoroutineScope()

    // Yerel taslak — Kaydet'e basılana kadar sunucuya gitmez.
    var enabled by remember(wedding.id) { mutableStateOf(wedding.partySizeEnabled) }
    // Bozuk/eski veriye karşı: önce azami, sonra varsayılan onun
    // İÇİNE kısılır. Aksi hâlde `default > max` başlangıç durumu
    // "+"/"−" mantığını kilitler (varsayılan stepper'ın max'ı azaminin
    // altında kalır ve hiçbir değer geçerli olmaz).
    var maxSize by remember(wedding.id) {
        mutableStateOf(wedding.maxPartySize.coerceIn(MIN_PARTY, MAX_PARTY))
    }
    var defaultSize by remember(wedding.id) {
        mutableStateOf(
            wedding.defaultPartySize.coerceIn(MIN_PARTY, wedding.maxPartySize.coerceIn(MIN_PARTY, MAX_PARTY)),
        )
    }
    // Karşılama metni — PREMIUM. Ücretsizde alan kilitli görünür.
    val isPremium = wedding.plan == "PREMIUM"
    var greeting by remember(wedding.id) {
        mutableStateOf(wedding.invitationMessage ?: "")
    }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDiscard by remember { mutableStateOf(false) }

    val dirty = enabled != wedding.partySizeEnabled ||
        defaultSize != wedding.defaultPartySize ||
        maxSize != wedding.maxPartySize ||
        // Karşılama metni yalnız PREMIUM'da düzenlenebilir. Ücretsiz
        // kullanıcıda alan kilitli — `dirty` hesabına katmak, kayıtlı
        // metni olan (premium'dan düşmüş) bir düğünde "kaydedilemez
        // değişiklik" gösterirdi.
        (isPremium && greeting.trim() != (wedding.invitationMessage ?: "").trim())

    fun save(thenBack: Boolean) {
        if (saving) return
        saving = true
        error = null
        scope.launch {
            // Azami düşürülürken varsayılan da AYNI istekte iner — sunucu
            // `default > max` görüp 400 dönmesin. Yerel değer BURADA
            // değiştirilmez: istek başarısız olursa kullanıcının girdisi
            // kaybolurdu. Yalnız gönderilen değer düzeltilir.
            val safeDefault = minOf(defaultSize, maxSize)

            repository.patchWedding(
                wedding.id,
                WeddingPatchRequest(
                    partySizeEnabled = enabled,
                    defaultPartySize = safeDefault,
                    maxPartySize = maxSize,
                    // Premium değilse gönderme — sunucu zaten yok sayar
                    // ama gereksiz alan taşımamak sözleşmeyi net tutar.
                    invitationMessage = if (isPremium) greeting.trim() else null,
                ),
            ).fold(
                onSuccess = {
                    saving = false
                    onSaved(it)
                    if (thenBack) onBack()
                },
                onFailure = {
                    saving = false
                    error = it.message ?: "Ayarlar kaydedilemedi"
                },
            )
        }
    }

    // Kaydedilmemiş değişiklikle çıkış — sessiz kayıp olmasın.
    // `saving` sırasında geri tuşu YUTULUR: navigasyon coroutine scope'u
    // iptal eder ve istek sessizce düşerdi.
    PlatformBackHandler(enabled = (dirty || saving)) {
        if (!saving) confirmDiscard = true
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar(
            "Davetli ayarları",
            onBack = {
                // Kaydetme sürerken çıkmak isteği iptal eder — engelle.
                if (!saving) {
                    if (dirty) confirmDiscard = true else onBack()
                }
            },
            actionLabel = "Kaydet",
            actionEnabled = dirty && !saving,
            onAction = { save(false) },
        )

        LazyColumn(
            contentPadding = PaddingValues(
                start = Spacing.md, end = Spacing.md,
                top = Spacing.sm, bottom = Spacing.xl,
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            error?.let { msg ->
                item {
                    InfoBanner(msg, isError = true, onDismiss = { error = null })
                }
            }

            // --- 1. Davetiye görünümü ---
            item { SectionHeader("Davetiye") }
            item {
                Surface(
                    onClick = onOpenTemplates,
                    shape = RoundedCornerShape(Radius.lg),
                    color = c.sageSoft,
                    border = BorderStroke(1.dp, c.sageBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(Spacing.md),
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
                                "${templateLabel(wedding.template)} · " +
                                    fontLabel(normalizeFontKey(wedding.template, wedding.fontKey)),
                                style = MaterialTheme.typography.bodySmall,
                                color = c.inkSoft,
                            )
                        }
                        Text("›", style = MaterialTheme.typography.titleLarge, color = c.sage)
                    }
                }
            }

            // Karşılama metni — PREMIUM.
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.lg),
                    color = c.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        Modifier.padding(Spacing.md),
                        verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                    ) {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                "Davetiye mesajı",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isPremium) c.ink else c.muted,
                            )
                            if (!isPremium) {
                                StatusChip("PREMIUM", StatusTone.WARNING)
                            }
                        }
                        Text(
                            if (isPremium) {
                                "Davetlilerin göreceği karşılama metni. Boş bırakırsan " +
                                    "varsayılan mesaj kullanılır."
                            } else {
                                "Premium'a geçince davetiyenin metnini kendin yazabilirsin."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                        DugunceTextField(
                            value = greeting,
                            onValueChange = { if (it.length <= 300) greeting = it },
                            label = "Karşılama metni",
                            placeholder = "Sizi düğünümüzde görmek isteriz.",
                            singleLine = false,
                            minLines = 2,
                            enabled = isPremium && !saving,
                        )
                        Text(
                            "${greeting.length}/300",
                            style = MaterialTheme.typography.labelSmall,
                            color = c.muted,
                        )
                    }
                }
            }

            // --- 2. Kişi sayısı anahtarı ---
            item { SectionHeader("Kişi sayısı") }
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.lg),
                    color = c.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs)) {
                        CheckRow(
                            label = "Davetliye \"kaç kişi\" sorusu sorulsun",
                            checked = enabled,
                            onCheckedChange = { enabled = it },
                            description = "Kapalıyken davetiye yalnız " +
                                "\"Geliyorum\" / \"Gelemeyeceğim\" gösterir.",
                        )
                    }
                }
            }

            // --- 3. Varsayılan / azami ---
            // Anahtar kapalıyken GÖRÜNÜR ama devre dışı: değerler korunur,
            // çift kapatınca neyi kaybettiğini görür ve sayfa zıplamaz.
            item {
                SizeStepper(
                    label = "Varsayılan",
                    hint = "Yeni davetliler bu sayıyla başlar",
                    value = defaultSize,
                    min = MIN_PARTY,
                    max = maxSize,
                    enabled = enabled,
                    onChange = { defaultSize = it },
                )
            }
            item {
                SizeStepper(
                    label = "Azami",
                    hint = "Davetli en fazla bu kadar kişi getirebilir",
                    value = maxSize,
                    min = MIN_PARTY,
                    max = MAX_PARTY,
                    enabled = enabled,
                    onChange = {
                        maxSize = it
                        // Varsayılan azamiyi geçemez — yerelde birlikte in.
                        if (defaultSize > it) defaultSize = it
                    },
                )
            }

            item {
                InfoBanner(
                    "Azamiyi düşürürsen daha önce geniş izin verdiğin " +
                        "davetliler de bu sınıra iner.",
                )
            }

            item { Spacer(Modifier.height(Spacing.xxl)) }
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Kaydedilmemiş değişiklikler var") },
            text = { Text("Değişiklikleri kaydetmek ister misin?") },
            confirmButton = {
                // DİKKAT: TextAction'ı trailing lambda ile ÇAĞIRMA.
                // İkinci parametre `Modifier`; lambda yanlış yuvaya
                // bağlanır ve `check-compose-conventions.mjs` yakalar.
                TextAction(
                    "Kaydet",
                    onClick = {
                        confirmDiscard = false
                        save(thenBack = true)
                    },
                )
            },
            dismissButton = {
                TextAction(
                    "Vazgeç",
                    onClick = {
                        confirmDiscard = false
                        onBack()
                    },
                )
            },
        )
    }
}

/**
 * Etiket + −/+ sayaç + açıklama.
 *
 * `enabled = false` iken düğmeler tıklanamaz (kural: tıklanabilir ama
 * işlevsiz buton gösterme).
 */
@Composable
private fun SizeStepper(
    label: String,
    hint: String,
    value: Int,
    min: Int,
    max: Int,
    enabled: Boolean,
    onChange: (Int) -> Unit,
) {
    val c = DugunceTheme.colors
    Surface(
        shape = RoundedCornerShape(Radius.lg),
        color = c.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (enabled) c.ink else c.muted,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                ) {
                    DugunceButton(
                        label = "−",
                        variant = ButtonVariant.SECONDARY,
                        fullWidth = false,
                        enabled = enabled && value > min,
                        onClick = { if (value > min) onChange(value - 1) },
                    )
                    Text(
                        "$value kişi",
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (enabled) c.ink else c.muted,
                        fontWeight = FontWeight.SemiBold,
                    )
                    DugunceButton(
                        label = "+",
                        variant = ButtonVariant.SECONDARY,
                        fullWidth = false,
                        enabled = enabled && value < max,
                        onClick = { if (value < max) onChange(value + 1) },
                    )
                }
            }
            Text(
                hint,
                style = MaterialTheme.typography.bodySmall,
                color = c.muted,
            )
        }
    }
}
