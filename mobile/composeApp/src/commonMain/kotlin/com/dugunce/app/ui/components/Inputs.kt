package com.dugunce.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.ui.theme.TypeScale

/**
 * Buton, metin alanı ve form bileşenleri.
 *
 * Erişilebilirlik: min yükseklik 48dp, `role`, `contentDescription`.
 */

enum class ButtonVariant { PRIMARY, SECONDARY, GHOST, DANGER }

/**
 * Ana buton.
 *
 * @param loading true ise metin yerine spinner, tekrar tıklama engellenir
 */
@Composable
fun DugunceButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.PRIMARY,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    fullWidth: Boolean = true,
) {
    val c = DugunceTheme.colors
    val active = enabled && !loading
    val m = if (fullWidth) modifier.fillMaxWidth().heightIn(min = Spacing.minTouchTarget) else modifier.heightIn(min = Spacing.minTouchTarget)
    val shape = RoundedCornerShape(Radius.md)

    val content: @Composable () -> Unit = {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = if (variant == ButtonVariant.PRIMARY) Color.White else c.sage,
                )
            } else if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            Text(
                if (loading) "Lütfen bekleyin…" else label,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
            )
        }
    }

    when (variant) {
        ButtonVariant.PRIMARY -> Button(
            onClick = onClick,
            modifier = m.semantics { role = Role.Button },
            enabled = active,
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                containerColor = c.sage,
                contentColor = Color.White,
                disabledContainerColor = c.line,
                disabledContentColor = c.muted,
            ),
            content = { content() },
        )

        ButtonVariant.SECONDARY -> OutlinedButton(
            onClick = onClick,
            modifier = m.semantics { role = Role.Button },
            enabled = active,
            shape = shape,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = c.sage),
            border = androidx.compose.foundation.BorderStroke(1.5.dp, c.sageBorder),
            content = { content() },
        )

        ButtonVariant.GHOST -> TextButton(
            onClick = onClick,
            modifier = m.semantics { role = Role.Button },
            enabled = active,
            content = { content() },
        )

        ButtonVariant.DANGER -> Button(
            onClick = onClick,
            modifier = m.semantics { role = Role.Button },
            enabled = active,
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                containerColor = c.danger,
                contentColor = Color.White,
                disabledContainerColor = c.line,
                disabledContentColor = c.muted,
            ),
            content = { content() },
        )
    }
}

/**
 * Metin alanı.
 *
 * @param error gösterilecek hata (alan kırmızıya döner + mesaj altta)
 * @param keyboard türü — telefon/tutar için uygun klavye
 */
@Composable
fun DugunceTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
    helper: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboard: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    leadingIcon: ImageVector? = null,
    suffix: String? = null,
    maxLength: Int? = null,
) {
    val c = DugunceTheme.colors
    val isError = error != null

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        OutlinedTextField(
            value = value,
            onValueChange = { next ->
                if (maxLength == null || next.length <= maxLength) onValueChange(next)
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(label) },
            placeholder = placeholder?.let { { Text(it) } },
            enabled = enabled,
            isError = isError,
            singleLine = singleLine,
            minLines = minLines,
            shape = RoundedCornerShape(Radius.md),
            keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = imeAction),
            visualTransformation = visualTransformation,
            leadingIcon = leadingIcon?.let {
                { Icon(it, contentDescription = null, tint = c.muted) }
            },
            suffix = suffix?.let { { Text(it, color = c.muted) } },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = c.sage,
                unfocusedBorderColor = c.line,
                errorBorderColor = c.danger,
                focusedLabelColor = c.sage,
                cursorColor = c.sage,
                focusedContainerColor = c.surface,
                unfocusedContainerColor = c.surface,
            ),
        )
        val note = error ?: helper
        if (note != null) {
            Text(
                note,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) c.danger else c.muted,
                modifier = Modifier.padding(start = Spacing.xs),
            )
        }
    }
}

/** Parola alanı — gizli giriş. */
@Composable
fun DuguncePasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
) {
    DugunceTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        error = error,
        keyboard = KeyboardType.Password,
        imeAction = ImeAction.Done,
        visualTransformation = PasswordVisualTransformation(),
    )
}

/**
 * Segment seçici — 2-4 seçenek için.
 *
 * Örn. taraf (Gelin/Damat/Ortak), durum (Yapılacak/Devam/Tamamlandı).
 */
@Composable
fun <T> SegmentedPicker(
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = DugunceTheme.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
    ) {
        options.forEach { (value, label) ->
            val isSelected = value == selected
            Surface(
                onClick = { onSelect(value) },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = Spacing.minTouchTarget)
                    .semantics {
                        role = Role.RadioButton
                        contentDescription = label
                    },
                shape = RoundedCornerShape(Radius.md),
                color = if (isSelected) c.sageSoft else c.surface,
                border = androidx.compose.foundation.BorderStroke(
                    1.5.dp,
                    if (isSelected) c.sage else c.line,
                ),
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(Spacing.sm)) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelMedium,
                        color = if (isSelected) c.sage else c.inkSoft,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }
    }
}

/** Onay kutusu satırı. */
@Composable
fun CheckRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
) {
    val c = DugunceTheme.colors
    Surface(
        onClick = { onCheckedChange(!checked) },
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = Spacing.minTouchTarget)
            .semantics { role = Role.Checkbox },
        color = Color.Transparent,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
            modifier = Modifier.padding(vertical = Spacing.sm),
        ) {
            androidx.compose.material3.Checkbox(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = androidx.compose.material3.CheckboxDefaults.colors(checkedColor = c.sage),
            )
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.bodyMedium, color = c.ink)
                if (description != null) {
                    Text(description, style = MaterialTheme.typography.bodySmall, color = c.muted)
                }
            }
        }
    }
}

/** Tutar girişi — Türkçe ondalık, sağa hizalı, büyük. */
@Composable
fun MoneyField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String = "Tutar",
    modifier: Modifier = Modifier,
    error: String? = null,
) {
    DugunceTextField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        error = error,
        placeholder = "0,00",
        keyboard = KeyboardType.Decimal,
        suffix = "₺",
    )
}

/** Tarih seçici tetikleyicisi (metin alanı görünümlü). */
@Composable
fun DateField(
    value: String,
    onClick: () -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    placeholder: String = "gg.aa.yyyy",
) {
    val c = DugunceTheme.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Surface(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .semantics { role = Role.Button },
            shape = RoundedCornerShape(Radius.md),
            color = c.surface,
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                if (error != null) c.danger else c.line,
            ),
        ) {
            Column(Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = c.muted)
                Text(
                    value.ifBlank { placeholder },
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (value.isBlank()) c.muted else c.ink,
                )
            }
        }
        if (error != null) {
            Text(
                error,
                style = MaterialTheme.typography.bodySmall,
                color = c.danger,
                modifier = Modifier.padding(start = Spacing.xs),
            )
        }
    }
}

/**
 * Tarih seçici — Material3 `DatePicker` ile.
 *
 * Bildirilen hata: `DateField(onClick = { })` boş lambda alıyordu, yani
 * tıklanınca hiçbir şey açılmıyordu. Tarih alanı "seçilemiyor" görünüyordu.
 *
 * Bu bileşen hem alanı hem diyaloğu yönetir; çağıran yalnızca ISO tarihi
 * tutar.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(
    isoValue: String?,
    onIsoChange: (String?) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    optional: Boolean = false,
    onClear: (() -> Unit)? = null,
) {
    val c = DugunceTheme.colors
    var open by remember { mutableStateOf(false) }

    // ISO → "gg.aa.yyyy" gösterim
    val display = remember(isoValue) {
        if (isoValue.isNullOrBlank()) ""
        else {
            val p = isoValue.substringBefore('T').split('-')
            if (p.size == 3) "${p[2]}.${p[1]}.${p[0]}" else isoValue
        }
    }

    DateField(
        value = display,
        onClick = { open = true },
        label = label,
        modifier = modifier,
        error = error,
        placeholder = if (optional) "Seçilmedi" else "gg.aa.yyyy",
    )

    if (open) {
        val state = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = isoToUtcMillis(isoValue),
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    onClick = {
                        val ms = state.selectedDateMillis
                        onIsoChange(if (ms == null) null else utcMillisToIso(ms))
                        open = false
                    },
                ) { Text("Tamam", color = c.sage) }
            },
            dismissButton = {
                androidx.compose.foundation.layout.Row {
                    if (optional && onClear != null) {
                        androidx.compose.material3.TextButton(
                            onClick = { onClear(); open = false },
                        ) { Text("Temizle", color = c.muted) }
                    }
                    androidx.compose.material3.TextButton(
                        onClick = { open = false },
                    ) { Text("Vazgeç", color = c.muted) }
                }
            },
        ) {
            androidx.compose.material3.DatePicker(
                state = state,
                title = null,
                headline = null,
                showModeToggle = false,
            )
        }
    }
}

/**
 * ISO `yyyy-MM-dd` → UTC epoch ms (DatePicker'ın beklediği).
 *
 * Saat dilimi kayması olmasın diye UTC gece yarısı kullanılır.
 */
internal fun isoToUtcMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    val p = iso.substringBefore('T').split('-')
    if (p.size != 3) return null
    val y = p[0].toIntOrNull() ?: return null
    val m = p[1].toIntOrNull() ?: return null
    val d = p[2].toIntOrNull() ?: return null
    if (m !in 1..12 || d !in 1..31) return null
    // Gün sayısı → ms (Howard Hinnant civil_from_days tersi)
    val yy = if (m <= 2) y - 1 else y
    val era = (if (yy >= 0) yy else yy - 399) / 400
    val yoe = yy - era * 400
    val doy = (153 * (if (m > 2) m - 3 else m + 9) + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    val days = era * 146097L + doe - 719468L
    return days * 86_400_000L
}

/** UTC epoch ms → ISO `yyyy-MM-dd`. */
internal fun utcMillisToIso(ms: Long): String {
    var z = ms / 86_400_000L + 719468
    val era = (if (z >= 0) z else z - 146096) / 146097
    val doe = z - era * 146097
    val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    val y = yoe + era * 400
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = doy - (153 * mp + 2) / 5 + 1
    val m = if (mp < 10) mp + 3 else mp - 9
    val year = if (m <= 2) y + 1 else y
    return "${year.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
}
