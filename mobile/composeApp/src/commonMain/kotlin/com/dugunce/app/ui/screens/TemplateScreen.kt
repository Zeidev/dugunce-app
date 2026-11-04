package com.dugunce.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.Repository
import com.dugunce.app.data.WeddingPatchRequest
import com.dugunce.app.data.WeddingDto
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.SectionHeader
import com.dugunce.app.ui.components.StatusChip
import com.dugunce.app.ui.components.StatusTone
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import kotlinx.coroutines.launch

// ===========================================================================
// Anahtarlar ve etiketler
//
// Bu listeler backend `backend/src/weddings/templates.ts` ile BİREBİR aynı
// olmalı. Davetiye sayfası (`frontend/public/d/index.html`) de aynı
// anahtarları kullanır. Üçü ayrışırsa şablon seçimi sessizce çalışmaz —
// `TemplateLabelsTest` bunu yakalar.
// ===========================================================================

/** Davetiye şablonu anahtarları — gösterim sırası. */
val TEMPLATE_KEYS: List<String> = listOf(
    "ZARIF", "BOTANIK", "ROMANTIK", "MINIMAL", "GECE", "ZEYTIN",
    "EDITORYAL", "MONOGRAM", "LUKS", "FOTOGRAFLI", "TIPOGRAFI",
)

/**
 * ÜCRETSİZ şablonlar — backend `FREE_TEMPLATES` ile BİREBİR aynı.
 *
 * Kullanıcı kararı: ilk 2 şablon ücretsiz, diğerleri premium.
 * Ayrışırsa kullanıcı seçer, sunucu reddeder ve "premium gerekli"
 * hatası alır — `TemplateTiersTest` bunu yakalar.
 */
val FREE_TEMPLATE_KEYS: List<String> = listOf("ZARIF", "BOTANIK")

/** Şablon ücretsiz mi? */
fun isTemplateFree(key: String): Boolean = FREE_TEMPLATE_KEYS.contains(key)

/** Font anahtarları — hepsi Türkçe karakterleri kapsar. */
val FONT_KEYS: List<String> = listOf(
    "PARISIENNE", "GREAT_VIBES", "DANCING_SCRIPT", "ALLURA", "SACRAMENTO",
    "PLAYFAIR", "CORMORANT", "DM_SERIF", "BODONI", "JOSEFIN",
)

/** Şablon anahtarı → Türkçe etiket. */
private val TEMPLATE_LABELS: Map<String, String> = mapOf(
    "ZARIF" to "Zarif",
    "BOTANIK" to "Botanik",
    "ROMANTIK" to "Romantik",
    "MINIMAL" to "Minimal",
    "GECE" to "Gece",
    "ZEYTIN" to "Zeytin",
    "EDITORYAL" to "Editoryal",
    "MONOGRAM" to "Monogram",
    "LUKS" to "Lüks",
    "FOTOGRAFLI" to "Fotoğraflı",
    "TIPOGRAFI" to "Saf tipografi",
)

/** Font anahtarı → Türkçe etiket. */
private val FONT_LABELS: Map<String, String> = mapOf(
    "PARISIENNE" to "Parisienne",
    "GREAT_VIBES" to "Great Vibes",
    "DANCING_SCRIPT" to "Dancing Script",
    "ALLURA" to "Allura",
    "SACRAMENTO" to "Sacramento",
    "PLAYFAIR" to "Playfair Display",
    "CORMORANT" to "Cormorant Garamond",
    "DM_SERIF" to "DM Serif Display",
    "BODONI" to "Bodoni Moda",
    "JOSEFIN" to "Josefin Sans",
)

/** Her şablonun önerilen fontu — backend `RECOMMENDED_FONT` ile aynı. */
private val RECOMMENDED_FONT: Map<String, String> = mapOf(
    "ZARIF" to "PARISIENNE",
    "BOTANIK" to "GREAT_VIBES",
    "ROMANTIK" to "DANCING_SCRIPT",
    "MINIMAL" to "SACRAMENTO",
    "GECE" to "GREAT_VIBES",
    "ZEYTIN" to "ALLURA",
    "EDITORYAL" to "PLAYFAIR",
    "MONOGRAM" to "CORMORANT",
    "LUKS" to "BODONI",
    "FOTOGRAFLI" to "DM_SERIF",
    "TIPOGRAFI" to "CORMORANT",
)

/** Şablon anahtarı → okunabilir etiket. Bilinmeyen anahtar "Zarif" döner. */
fun templateLabel(key: String): String = TEMPLATE_LABELS[key] ?: "Zarif"

/** Font anahtarı → okunabilir etiket. Bilinmeyen anahtar ilk fontu döner. */
fun fontLabel(key: String): String = FONT_LABELS[key] ?: fontLabel(FONT_KEYS.first())

/** Şablonun önerilen font anahtarı. Bilinmeyen şablon "Zarif"in önerileni. */
fun recommendedFont(templateKey: String): String =
    RECOMMENDED_FONT[templateKey] ?: RECOMMENDED_FONT.getValue("ZARIF")

/**
 * Font anahtarını normalize eder — backend `normalizeFont` ile aynı kural.
 *
 * Boş veya geçersiz font, şablonun önerilen fontuna düşer.
 */
fun normalizeFontKey(templateKey: String, fontKey: String): String =
    if (FONT_KEYS.contains(fontKey)) fontKey else recommendedFont(templateKey)

// ===========================================================================
// Ekran
// ===========================================================================

/**
 * Davetiye görünümü — şablon ve font seçimi.
 *
 * Çift şablonu ve isterse fontunu seçer. Seçim `PATCH /weddings/:id` ile
 * kaydedilir; misafirin gördüğü davetiye bu değerlerle render edilir.
 *
 * Fotoğraf alanı bu ekranda YER TUTUCU — Aşama 6'da (R2 + presigned URL)
 * devreye girecek. Şimdilik tıklanabilir değil ve bunu açıkça yazar.
 */
@Composable
fun TemplateScreen(
    wedding: WeddingDto,
    repository: Repository,
    onBack: () -> Unit,
    onSaved: (WeddingDto) -> Unit = {},
) {
    val theme = DugunceTheme.colors
    // Premium şablonlar galeride GÖRÜNÜR ama kilitli — kullanıcı neyi
    // kaçırdığını görür. Seçmeye çalışınca bilgi çıkar; kapı sunucuda.
    val isPremium = wedding.plan == "PREMIUM"
    val scope = rememberCoroutineScope()

    var selectedTemplate by remember(wedding.id) {
        mutableStateOf(if (TEMPLATE_KEYS.contains(wedding.template)) wedding.template else "ZARIF")
    }
    var selectedFont by remember(wedding.id) {
        mutableStateOf(normalizeFontKey(wedding.template, wedding.fontKey))
    }
    var saving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }


    Column(Modifier.fillMaxSize().background(theme.cream)) {
        TopBar("Davetiye görünümü", onBack = onBack)

        LazyColumn(
            contentPadding = PaddingValues(
                start = Spacing.md, end = Spacing.md,
                top = Spacing.sm, bottom = Spacing.xl,
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                SectionHeader("Şablon")
                Text(
                    "Misafirinizin göreceği davetiyenin görünümü.",
                    style = MaterialTheme.typography.bodySmall,
                    color = theme.muted,
                )
            }

            // Şablon ızgarası — 2 sütun
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    TEMPLATE_KEYS.chunked(2).forEach { rowKeys ->
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            rowKeys.forEach { key ->
                                val locked = !isPremium && !isTemplateFree(key)
                                TemplateCard(
                                    key = key,
                                    selected = key == selectedTemplate,
                                    locked = locked,
                                    modifier = Modifier.weight(1f),
                                    onClick = {
                                        if (locked) {
                                            message = null
                                            error = "Bu şablon Premium üyelik gerektiriyor."
                                        } else {
                                            selectedTemplate = key
                                            selectedFont = recommendedFont(key)
                                            message = null
                                            error = null
                                        }
                                    },
                                )
                            }
                            if (rowKeys.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }

            item {
                SectionHeader("Font")
                Text(
                    "Her şablonun önerilen bir fontu var. İstersen değiştir.",
                    style = MaterialTheme.typography.bodySmall,
                    color = theme.muted,
                )
            }

            items(FONT_KEYS) { key ->
                FontRow(
                    key = key,
                    selected = key == selectedFont,
                    recommended = key == recommendedFont(selectedTemplate),
                    onClick = {
                        selectedFont = key
                        message = null
                        error = null
                    },
                )
            }

            // Fotoğraf — yer tutucu (Aşama 6)
            item {
                SectionHeader("Fotoğraf")
                Row(
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, theme.line, RoundedCornerShape(Radius.md))
                        .background(theme.surfaceAlt, RoundedCornerShape(Radius.md))
                        .padding(Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Davetiye fotoğrafı",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = theme.ink,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "Aşama 6'da geliyor. Şimdilik şablonun kendi süslemesi kullanılıyor.",
                            style = MaterialTheme.typography.bodySmall,
                            color = theme.muted,
                        )
                    }
                    StatusChip("Yakında", StatusTone.INFO)
                }
            }

            item {
                Column {
                    if (message != null) {
                        Text(message!!, color = theme.success, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(Spacing.sm))
                    }
                    if (error != null) {
                        Text(error!!, color = theme.danger, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(Spacing.sm))
                    }
                    DugunceButton(
                        label = "Kaydet",
                        loading = saving,
                        enabled = !saving,
                        onClick = {
                            saving = true
                            message = null
                            error = null
                            scope.launch {
                                val result = repository.patchWedding(
                                    wedding.id,
                                    WeddingPatchRequest(
                                        template = selectedTemplate,
                                        fontKey = selectedFont,
                                    ),
                                )
                                saving = false
                                result.fold(
                                    onSuccess = { saved ->
                                        message = "Davetiyeniz güncellendi"
                                        onSaved(saved)
                                    },
                                    onFailure = { error = it.message ?: "Kaydedilemedi" },
                                )
                            }
                        },
                    )
                }
            }
        }
    }
}

/** Şablon önizleme kartı — renk kutusu + etiket. */
@Composable
private fun TemplateCard(
    key: String,
    selected: Boolean,
    locked: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val theme = DugunceTheme.colors
    val preview = TEMPLATE_PREVIEW[key] ?: TEMPLATE_PREVIEW.getValue("ZARIF")

    Column(
        modifier
            // Erişilebilirlik: kilitli kart ekran okuyucuda "PREMIUM,
            // kilitli" olarak duyurulmalı — yalnız görsel rozet yetmez
            // (durum asla tek başına renkle/rozetle anlatılmaz).
            .semantics {
                role = Role.Button
                contentDescription = if (locked) {
                    "${templateLabel(key)}, PREMIUM, kilitli"
                } else {
                    templateLabel(key)
                }
                if (selected) stateDescription = "seçili"
            }
            .clickable(onClick = onClick)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) theme.sage else theme.line,
                shape = RoundedCornerShape(Radius.md),
            )
            .background(theme.surface, RoundedCornerShape(Radius.md))
            .padding(Spacing.sm),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(72.dp)
                .background(preview.bg, RoundedCornerShape(Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            if (locked) {
                // Kilit rozeti — renk tek başına anlatmaz, metin eşlik eder.
                Surface(
                    shape = RoundedCornerShape(Radius.sm),
                    color = theme.ink.copy(alpha = 0.72f),
                    modifier = Modifier.align(Alignment.TopEnd).padding(4.dp),
                ) {
                    Text(
                        "PREMIUM",
                        style = MaterialTheme.typography.labelSmall,
                        color = theme.surface,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .width(26.dp).height(2.dp)
                        .background(preview.accent, CircleShape),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    "Aa",
                    color = preview.ink,
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 24.sp),
                    fontWeight = FontWeight.Normal,
                )
                Spacer(Modifier.height(4.dp))
                Box(
                    Modifier
                        .width(18.dp).height(1.dp)
                        .background(preview.line),
                )
            }
        }
        Spacer(Modifier.height(Spacing.xs))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                templateLabel(key),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = theme.ink,
                modifier = Modifier.weight(1f),
            )
            if (selected) {
                Box(
                    Modifier.size(14.dp).background(theme.sage, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("✓", color = theme.surface, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

/** Font seçim satırı. */
@Composable
private fun FontRow(
    key: String,
    selected: Boolean,
    recommended: Boolean,
    onClick: () -> Unit,
) {
    val theme = DugunceTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .border(
                width = if (selected) 1.5.dp else 1.dp,
                color = if (selected) theme.sage else theme.line,
                shape = RoundedCornerShape(Radius.sm),
            )
            .background(theme.surface, RoundedCornerShape(Radius.sm))
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Font adı KENDİ stiliyle yazılır — kullanıcı farkı okumadan görsün.
        Text(
            fontLabel(key),
            style = MaterialTheme.typography.titleMedium.copy(fontSize = 20.sp),
            fontWeight = FontWeight.Normal,
            color = theme.ink,
            modifier = Modifier.weight(1f),
        )
        if (recommended) {
            StatusChip("Önerilen", StatusTone.NEUTRAL)
            Spacer(Modifier.width(Spacing.xs))
        }
        if (selected) {
            Box(
                Modifier.size(16.dp).background(theme.sage, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("✓", color = theme.surface, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

/** Şablon önizleme renkleri — davetiye sayfasındaki tokenlarla aynı. */
private data class TemplatePreview(
    val bg: androidx.compose.ui.graphics.Color,
    val ink: androidx.compose.ui.graphics.Color,
    val accent: androidx.compose.ui.graphics.Color,
    val line: androidx.compose.ui.graphics.Color,
)

private val TEMPLATE_PREVIEW: Map<String, TemplatePreview> = mapOf(
    "ZARIF" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFEFECE5),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFFDDD8CF),
    ),
    "BOTANIK" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFE9ECE7),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFF7D9070),
        androidx.compose.ui.graphics.Color(0xFFDDE4D6),
    ),
    "ROMANTIK" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFF0E8E4),
        androidx.compose.ui.graphics.Color(0xFF4A2333),
        androidx.compose.ui.graphics.Color(0xFF8C3F52),
        androidx.compose.ui.graphics.Color(0xFFE8D5D8),
    ),
    "MINIMAL" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFECEAE6),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFFA8A29A),
        androidx.compose.ui.graphics.Color(0xFFE6E1D8),
    ),
    "GECE" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFF1C1F1A),
        androidx.compose.ui.graphics.Color(0xFFE8E6E1),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFF3A4536),
    ),
    "ZEYTIN" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFF7F9F3),
        androidx.compose.ui.graphics.Color(0xFF3B4C37),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFFDDE4D6),
    ),
    "EDITORYAL" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFFFFDF8),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFFE8E3D8),
    ),
    "MONOGRAM" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFFBFDF9),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFFDDE4D6),
    ),
    "LUKS" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFF141613),
        androidx.compose.ui.graphics.Color(0xFFF2EFE8),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFF3A3A36),
    ),
    "FOTOGRAFLI" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFFFFDF8),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFFF0ECE4),
    ),
    "TIPOGRAFI" to TemplatePreview(
        androidx.compose.ui.graphics.Color(0xFFFAF8F3),
        androidx.compose.ui.graphics.Color(0xFF2D3A2E),
        androidx.compose.ui.graphics.Color(0xFFA8925F),
        androidx.compose.ui.graphics.Color(0xFFDDD8CF),
    ),
)
