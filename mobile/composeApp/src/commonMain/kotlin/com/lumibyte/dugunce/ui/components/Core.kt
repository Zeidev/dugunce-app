package com.lumibyte.dugunce.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Elevation
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import com.lumibyte.dugunce.ui.theme.TypeScale

/**
 * Ortak bileşenler.
 *
 * Brief §3.2: buton, kart, metin alanı, durum etiketi bileşenleri.
 * Brief §3.1: durumlar renk + metin + ikon; dokunma alanı ≥48dp;
 * `contentDescription` zorunlu.
 */

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

@Composable
fun DugunceCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(Spacing.lg),
    content: @Composable () -> Unit,
) {
    val colors = DugunceTheme.colors
    val shape = RoundedCornerShape(Radius.lg)

    if (onClick != null) {
        Surface(
            onClick = onClick,
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            color = colors.surface,
            tonalElevation = Elevation.card,
            shadowElevation = Elevation.card,
        ) {
            Box(Modifier.padding(padding)) { content() }
        }
    } else {
        Surface(
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            color = colors.surface,
            tonalElevation = Elevation.card,
            shadowElevation = Elevation.card,
        ) {
            Box(Modifier.padding(padding)) { content() }
        }
    }
}

// ---------------------------------------------------------------------------
// Durum etiketi — renk + metin + ikon (brief §3.1)
// ---------------------------------------------------------------------------

/** Durum tonu. */
enum class StatusTone { NEUTRAL, SUCCESS, WARNING, DANGER, INFO, ACCENT }

@Composable
fun StatusChip(
    text: String,
    tone: StatusTone = StatusTone.NEUTRAL,
    icon: ImageVector? = null,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    val (bg, fg) = when (tone) {
        StatusTone.NEUTRAL -> c.surfaceAlt to c.inkSoft
        StatusTone.SUCCESS -> c.successSoft to c.success
        StatusTone.WARNING -> c.warningSoft to c.warning
        StatusTone.DANGER -> c.dangerSoft to c.danger
        StatusTone.INFO -> c.infoSoft to c.info
        StatusTone.ACCENT -> c.sageSoft to c.sage
    }

    Surface(
        modifier = modifier.semantics { contentDescription = text },
        shape = RoundedCornerShape(Radius.pill),
        color = bg,
    ) {
        Row(
            Modifier.padding(horizontal = Spacing.md, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
            }
            Text(
                text,
                color = fg,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Para metni — tabular, okunaklı (brief §3.1 "rakamlar kolay taranmalı")
// ---------------------------------------------------------------------------

@Composable
fun MoneyText(
    text: String,
    modifier: Modifier = Modifier,
    big: Boolean = false,
    color: Color? = null,
) {
    Text(
        text = text,
        modifier = modifier,
        color = color ?: DugunceTheme.colors.ink,
        fontSize = if (big) TypeScale.moneyLg else TypeScale.moneySm,
        fontWeight = if (big) FontWeight.SemiBold else FontWeight.Medium,
        style = MaterialTheme.typography.bodyLarge,
    )
}

// ---------------------------------------------------------------------------
// Boş durum — brief §5.2: "açıklayıcı empty state ve ilgili ilk eylem butonu"
// ---------------------------------------------------------------------------

@Composable
fun EmptyState(
    title: String,
    description: String,
    icon: ImageVector? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        if (icon != null) {
            Surface(
                shape = RoundedCornerShape(Radius.pill),
                color = c.sageSoft,
                modifier = Modifier.size(72.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = c.sage, modifier = Modifier.size(32.dp))
                }
            }
        }
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = c.ink,
            textAlign = TextAlign.Center,
        )
        Text(
            description,
            style = MaterialTheme.typography.bodyMedium,
            color = c.muted,
            textAlign = TextAlign.Center,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(Spacing.xs))
            DugunceButton(actionLabel, onClick = onAction)
        }
    }
}

// ---------------------------------------------------------------------------
// Hata durumu
// ---------------------------------------------------------------------------

@Composable
fun ErrorState(
    message: String,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = c.danger,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            DugunceButton("Tekrar dene", onClick = onRetry, variant = ButtonVariant.SECONDARY)
        }
    }
}

// ---------------------------------------------------------------------------
// Yükleniyor
// ---------------------------------------------------------------------------

@Composable
fun LoadingState(modifier: Modifier = Modifier, label: String? = null) {
    val c = DugunceTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        CircularProgressIndicator(color = c.sage, strokeWidth = 2.5.dp)
        if (label != null) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = c.muted)
        }
    }
}

// ---------------------------------------------------------------------------
// Bölüm başlığı
// ---------------------------------------------------------------------------

@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val c = DugunceTheme.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Web'deki `.sec-t` ile ayni: serif baslik.
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            color = c.ink,
            fontWeight = FontWeight.SemiBold,
        )
        if (actionLabel != null && onAction != null) {
            TextAction(actionLabel, onAction)
        }
    }
}

// ---------------------------------------------------------------------------
// İnce ayırıcı
// ---------------------------------------------------------------------------

@Composable
fun Divider(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(DugunceTheme.colors.line),
    )
}

/** Küçük boşluk kısayolları. */
@Composable
fun VSpace(dp: androidx.compose.ui.unit.Dp) = Spacer(Modifier.height(dp))

@Composable
fun HSpace(dp: androidx.compose.ui.unit.Dp) = Spacer(Modifier.width(dp))

/** Metin aksiyonu (buton görünümsüz). */
@Composable
fun TextAction(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        modifier = modifier.heightIn(min = Spacing.minTouchTarget),
        color = Color.Transparent,
    ) {
        Box(Modifier.padding(horizontal = Spacing.sm), contentAlignment = Alignment.Center) {
            Text(
                label.uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(
                    letterSpacing = 1.2.sp,
                ),
                color = c.gold,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
