package com.dugunce.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dugunce.app.api.ApiException
import com.dugunce.app.api.NetworkException
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.DugunceTextField
import com.dugunce.app.ui.components.TextAction
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Giriş ekranı — magic link (brief §5.1, spec §6b.8 adım 2).
 *
 * Akış: e-posta → POST /auth/magic-link → e-postadaki 6 haneli kod veya
 * link. Deep link yoksa kullanıcı kodu elle girer (yedek yol, design §7
 * `magic_link_token.short_code`).
 */
@Composable
fun LoginScreen(
    repository: Repository,
    onLinkSent: () -> Unit,
    onLoggedIn: () -> Unit,
    onHasInviteCode: () -> Unit = {},
    /**
     * Dışarıdan kod modunda aç.
     *
     * "Bağlantı gönderildi" ekranından gelindiğinde `true` olur —
     * kullanıcıyı e-posta alanına geri göndermek yerine doğrudan
     * kod girişini açar (bildirilen hata).
     */
    startWithCode: Boolean = false,
) {
    val c = DugunceTheme.colors
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var showCode by remember { mutableStateOf(startWithCode) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val emailValid = email.contains("@") && email.contains(".") && email.length >= 5

    fun sendLink() {
        if (!emailValid || loading) return
        loading = true
        error = null
        scope.launch {
            repository.requestMagicLink(email.trim()).fold(
                onSuccess = {
                    loading = false
                    info = "Bağlantı gönderildi. E-postanı kontrol et."
                    onLinkSent()
                },
                onFailure = { e ->
                    loading = false
                    error = when (e) {
                        is NetworkException -> "İnternet bağlantısı kurulamadı."
                        is ApiException -> e.message
                        else -> "Bir hata oluştu."
                    }
                },
            )
        }
    }

    fun verifyCode() {
        // Kod yolu e-posta GEREKTİRMEZ: backend `{ code }` ile
        // `shortCodeHash` üzerinden arar (magic-link.ts). E-posta
        // zorunlu tutmak, kullanıcıyı gereksiz yere forma geri atıyordu.
        if (code.length != 6 || loading) return
        loading = true
        error = null
        scope.launch {
            repository.verifyCodeOnly(code.trim()).fold(
                onSuccess = { loading = false; onLoggedIn() },
                onFailure = { e ->
                    loading = false
                    error = when (e) {
                        is ApiException -> e.message
                        else -> "Kod doğrulanamadı."
                    }
                },
            )
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(Spacing.xxxl))

        Surface(
            shape = RoundedCornerShape(Radius.xl),
            color = c.sageSoft,
            modifier = Modifier.size(88.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    if (showCode) Icons.Filled.MarkEmailRead else Icons.Filled.MailOutline,
                    contentDescription = null,
                    tint = c.sage,
                    modifier = Modifier.size(40.dp),
                )
            }
        }

        Spacer(Modifier.height(Spacing.xl))

        Text(
            if (showCode) "Kodu gir" else "Düğünce'ye hoş geldin",
            style = MaterialTheme.typography.headlineMedium,
            color = c.ink,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Spacing.sm))
        Text(
            if (showCode) {
                "$email adresine gelen 6 haneli kodu gir."
            } else {
                "E-posta adresini gir, sana giriş bağlantısı gönderelim. " +
                    "Parola yok, hatırlaman gereken bir şey yok."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = c.muted,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(Spacing.xl))

        if (!showCode) {
            DugunceTextField(
                value = email,
                onValueChange = { email = it; error = null },
                label = "E-posta",
                placeholder = "ornek@eposta.com",
                keyboard = KeyboardType.Email,
                imeAction = ImeAction.Done,
                error = error,
                enabled = !loading,
            )
            Spacer(Modifier.height(Spacing.lg))
            DugunceButton(
                "Giriş bağlantısı gönder",
                onClick = ::sendLink,
                enabled = emailValid,
                loading = loading,
            )
        } else {
            DugunceTextField(
                value = code,
                onValueChange = { if (it.length <= 6) { code = it.filter { ch -> ch.isDigit() }; error = null } },
                label = "6 haneli kod",
                placeholder = "000000",
                keyboard = KeyboardType.Number,
                imeAction = ImeAction.Done,
                error = error,
                enabled = !loading,
                maxLength = 6,
            )
            Spacer(Modifier.height(Spacing.lg))
            DugunceButton(
                "Giriş yap",
                onClick = ::verifyCode,
                enabled = code.length == 6,
                loading = loading,
            )
            Spacer(Modifier.height(Spacing.sm))
            DugunceButton(
                "Tekrar gönder",
                onClick = ::sendLink,
                variant = com.dugunce.app.ui.components.ButtonVariant.GHOST,
                enabled = !loading,
            )
        }

        if (info != null && error == null) {
            Spacer(Modifier.height(Spacing.md))
            Surface(
                shape = RoundedCornerShape(Radius.md),
                color = c.successSoft,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    info!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = c.success,
                    modifier = Modifier.padding(Spacing.md),
                )
            }
        }

        Spacer(Modifier.height(Spacing.xl))

        // Deep link çalışmazsa yedek yol
        TextAction(
            if (showCode) "E-posta adresini değiştir" else "Kodum var, kodu gireyim",
            onClick = { showCode = !showCode; error = null },
        )
        Spacer(Modifier.height(Spacing.sm))
        // İkinci eş: davet koduyla katılma
        TextAction("Davet kodum var", onClick = onHasInviteCode)

        Spacer(Modifier.height(Spacing.xxl))

        Text(
            "Giriş yaparak kullanım koşullarını kabul etmiş olursun.",
            style = MaterialTheme.typography.bodySmall,
            color = c.muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Spacing.lg))
    }
}

/**
 * Bağlantı gönderildi ekranı — e-postayı kontrol et.
 *
 * Kullanıcı e-postadaki linke tıklarsa deep link uygulamayı açar;
 * tıklamazsa koda dönebilir.
 */
@Composable
fun LinkSentScreen(
    email: String?,
    onBack: () -> Unit,
    onEnterCode: () -> Unit,
) {
    val c = DugunceTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .padding(horizontal = Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(Radius.xl),
            color = c.successSoft,
            modifier = Modifier.size(96.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Filled.MarkEmailRead,
                    contentDescription = null,
                    tint = c.success,
                    modifier = Modifier.size(44.dp),
                )
            }
        }
        Spacer(Modifier.height(Spacing.xl))
        Text(
            "E-postanı kontrol et",
            style = MaterialTheme.typography.headlineMedium,
            color = c.ink,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Spacing.sm))
        Text(
            if (email.isNullOrBlank()) {
                "Sana bir giriş bağlantısı gönderdik. Bağlantıya tıklayınca uygulama açılır."
            } else {
                "$email adresine bir giriş bağlantısı gönderdik. " +
                    "Bağlantıya tıklayınca uygulama açılır."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = c.muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(Spacing.xxl))
        DugunceButton("6 haneli kodu gireyim", onClick = onEnterCode)
        Spacer(Modifier.height(Spacing.sm))
        DugunceButton(
            "Geri dön",
            onClick = onBack,
            variant = com.dugunce.app.ui.components.ButtonVariant.GHOST,
        )
        Spacer(Modifier.height(Spacing.lg))
        Text(
            "Bağlantı gelmediyse spam klasörüne bak.",
            style = MaterialTheme.typography.bodySmall,
            color = c.muted,
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Normal,
        )
    }
}
