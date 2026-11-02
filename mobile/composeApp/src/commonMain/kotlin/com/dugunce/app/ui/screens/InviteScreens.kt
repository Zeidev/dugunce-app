package com.dugunce.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import com.dugunce.app.api.ApiException
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.components.ButtonVariant
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.DugunceTextField
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.util.Dates
import kotlinx.coroutines.launch

/**
 * İkinci eş daveti — spec §11 #11, design §7 `invite` tablosu.
 *
 * Mekanizma yardımcıyla AYNI (7 karakter kod), farkı rol: `CO_OWNER`.
 * İkinci eş önce magic link ile hesap açar, sonra bu kodu girer →
 * aynı düğünün ikinci sahibi olur.
 */
@Composable
fun CoOwnerInviteScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
) {
    val c = DugunceTheme.colors
    var displayName by remember { mutableStateOf("") }
    var code by remember { mutableStateOf<String?>(null) }
    var expiresAt by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("İkinci eşi davet et", onBack = onBack)

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.md),
                    color = c.infoSoft,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "İkinci eş de düğünün tam sahibi olur: bütçeyi, davetlileri ve " +
                            "görevleri düzenleyebilir. Önce uygulamaya giriş yapması, " +
                            "sonra bu kodu girmesi gerekir.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.info,
                        modifier = Modifier.padding(Spacing.md),
                    )
                }
            }

            item {
                DugunceTextField(
                    value = displayName,
                    onValueChange = { displayName = it; error = null },
                    label = "Eşinin adı (isteğe bağlı)",
                    placeholder = "Mert",
                    helper = "Yalnızca senin listen için",
                    enabled = !creating,
                )
            }

            if (code != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(Radius.lg),
                        color = c.successSoft,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(Spacing.lg)) {
                            Text(
                                "Davet kodun",
                                style = MaterialTheme.typography.labelLarge,
                                color = c.success,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            Text(
                                code!!,
                                style = MaterialTheme.typography.headlineLarge,
                                color = c.ink,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            if (expiresAt != null) {
                                Text(
                                    "Son geçerlilik: ${Dates.formatDate(expiresAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = c.muted,
                                )
                            }
                            Spacer(Modifier.height(Spacing.sm))
                            Text(
                                "Bu kodu eşine gönder. Uygulamaya giriş yaptıktan sonra " +
                                    "\"Davet kodum var\" ekranından girebilir.",
                                style = MaterialTheme.typography.bodySmall,
                                color = c.inkSoft,
                            )
                        }
                    }
                }
            }

            if (error != null) {
                item {
                    Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger)
                }
            }

            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            if (code == null) {
                DugunceButton(
                    "Davet kodu oluştur",
                    onClick = {
                        if (creating) return@DugunceButton
                        creating = true
                        error = null
                        scope.launch {
                            repository.createInvite(weddingId, "CO_OWNER").fold(
                                onSuccess = { res ->
                                    creating = false
                                    code = res.code ?: res.invite?.code
                                    expiresAt = res.invite?.expiresAt
                                    if (code == null) error = "Kod alınamadı"
                                },
                                onFailure = { e ->
                                    creating = false
                                    error = if (e is ApiException) e.message else "Oluşturulamadı"
                                },
                            )
                        }
                    },
                    loading = creating,
                )
            } else {
                DugunceButton("Tamam", onClick = onBack)
            }
        }
    }
}

/**
 * Davet kodu gir — ikinci eşin tarafı.
 *
 * Giriş yaptıktan sonra bu ekrandan kodu girer; düğün üyeliği eklenir.
 */
@Composable
fun AcceptInviteScreen(
    repository: Repository,
    onBack: () -> Unit,
    onJoined: () -> Unit,
) {
    val c = DugunceTheme.colors
    var code by remember { mutableStateOf("") }
    var joining by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val normalized = code.trim().uppercase()
    val valid = normalized.length == 7

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Davet kodum var", onBack = onBack)

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                Text(
                    "Eşinden gelen 7 karakterlik kodu gir. Bu kod seni aynı düğünün " +
                        "ikinci sahibi yapar.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.muted,
                )
            }
            item {
                DugunceTextField(
                    value = code,
                    onValueChange = {
                        code = it.uppercase().filter { ch -> ch.isLetterOrDigit() }.take(7)
                        error = null
                    },
                    label = "Davet kodu",
                    placeholder = "ABC2345",
                    helper = "7 karakter — karışan harfler (0/O, 1/I) kullanılmaz",
                    error = error,
                    imeAction = ImeAction.Done,
                    enabled = !joining,
                    maxLength = 7,
                )
            }
            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            DugunceButton(
                "Düğüne katıl",
                onClick = {
                    if (!valid || joining) return@DugunceButton
                    joining = true
                    error = null
                    scope.launch {
                        repository.acceptInvite(normalized).fold(
                            onSuccess = { joining = false; onJoined() },
                            onFailure = { e ->
                                joining = false
                                error = if (e is ApiException) e.message else "Kod kullanılamadı"
                            },
                        )
                    }
                },
                enabled = valid,
                loading = joining,
            )
            Spacer(Modifier.height(Spacing.sm))
            DugunceButton(
                "Sonra girerim",
                onClick = onBack,
                variant = ButtonVariant.GHOST,
            )
        }
    }
}
