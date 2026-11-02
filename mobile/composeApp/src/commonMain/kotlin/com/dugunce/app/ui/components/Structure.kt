package com.dugunce.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing

/**
 * Onboarding adım başlığı — "3/7" + başlık + ilerleme çubuğu.
 *
 * Spec §6b.8: kullanıcı nerede olduğunu bilmeli.
 */
@Composable
fun StepHeader(
    step: Int,
    total: Int,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    val c = DugunceTheme.colors
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "$step / $total",
                style = MaterialTheme.typography.labelMedium,
                color = c.muted,
            )
            Text(
                "%${((step.toFloat() / total) * 100).toInt()}",
                style = MaterialTheme.typography.labelMedium,
                color = c.sage,
                fontWeight = FontWeight.Medium,
            )
        }
        // İlerleme çubuğu
        Surface(
            shape = RoundedCornerShape(Radius.pill),
            color = c.line,
            modifier = Modifier.fillMaxWidth().height(6.dp),
        ) {
            Row(Modifier.fillMaxWidth()) {
                Surface(
                    shape = RoundedCornerShape(Radius.pill),
                    color = c.sage,
                    modifier = Modifier
                        .fillMaxWidth(step.toFloat() / total)
                        .height(6.dp),
                ) {}
            }
        }
        Text(
            title,
            style = MaterialTheme.typography.headlineMedium,
            color = c.ink,
        )
        if (subtitle != null) {
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = c.muted,
                modifier = Modifier.padding(top = Spacing.xs),
            )
        }
    }
}

/**
 * Üst çubuk — geri + başlık + aksiyon.
 *
 * Ekranlarda tekrar eden başlık desenini standartlaştırır.
 */
@Composable
fun TopBar(
    title: String,
    onBack: (() -> Unit)? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.sm, vertical = Spacing.sm),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        if (onBack != null) {
            androidx.compose.material3.IconButton(onClick = onBack) {
                androidx.compose.material3.Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Geri",
                    tint = c.ink,
                )
            }
        } else {
            androidx.compose.foundation.layout.Spacer(Modifier.padding(horizontal = Spacing.lg))
        }

        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            color = c.ink,
            modifier = Modifier.padding(horizontal = Spacing.sm),
        )

        if (actionLabel != null && onAction != null) {
            TextAction(actionLabel, onAction)
        } else {
            androidx.compose.foundation.layout.Spacer(Modifier.padding(horizontal = Spacing.lg))
        }
    }
}

/**
 * Bilgi bandı — ekranın üstünde uyarı/hata.
 *
 * Örn. çevrimdışı, limit doldu, oturum süresi.
 */
@Composable
fun InfoBanner(
    text: String,
    isError: Boolean = false,
    onDismiss: (() -> Unit)? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = if (isError) c.dangerSoft else c.infoSoft,
        shape = RoundedCornerShape(Radius.md),
    ) {
        Row(
            Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Text(
                text,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) c.danger else c.info,
                modifier = Modifier.weight(1f),
            )
            if (actionLabel != null && onAction != null) {
                TextAction(actionLabel, onAction)
            }
            if (onDismiss != null) {
                TextAction("Kapat", onDismiss)
            }
        }
    }
}

/**
 * Limit göstergesi — davetli kotası gibi "12 / 30" çubuğu.
 *
 * Spec §6b.6: "%80'de uyarı, %100'de buton kapanır".
 */
@Composable
fun QuotaBar(
    used: Int,
    limit: Int?,
    label: String,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    val ratio = if (limit == null || limit == 0) 0f else (used.toFloat() / limit).coerceIn(0f, 1f)
    val nearLimit = limit != null && ratio >= 0.8f
    val full = limit != null && used >= limit
    val barColor = when {
        full -> c.danger
        nearLimit -> c.warning
        else -> c.sage
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = c.muted)
            Text(
                if (limit == null) "$used / sınırsız" else "$used / $limit",
                style = MaterialTheme.typography.labelMedium,
                color = if (full || nearLimit) barColor else c.inkSoft,
                fontWeight = FontWeight.Medium,
            )
        }
        Surface(
            shape = RoundedCornerShape(Radius.pill),
            color = c.line,
            modifier = Modifier.fillMaxWidth().height(6.dp),
        ) {
            Row(Modifier.fillMaxWidth()) {
                Surface(
                    shape = RoundedCornerShape(Radius.pill),
                    color = barColor,
                    modifier = Modifier.fillMaxWidth(ratio).height(6.dp),
                ) {}
            }
        }
        if (nearLimit) {
            Text(
                if (full) "Sınıra ulaştın. Premium ile sınırsız davetli." else "Sınıra yaklaşıyorsun.",
                style = MaterialTheme.typography.bodySmall,
                color = barColor,
            )
        }
    }
}
