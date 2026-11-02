package com.dugunce.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dugunce.app.api.ApiException
import com.dugunce.app.data.Repository
import com.dugunce.app.ui.theme.DugunceColors
import kotlinx.coroutines.launch

/**
 * Giriş ekranı — magic link.
 *
 * Akış: e-posta gir → POST /auth/magic-link → e-postadaki linke tıkla.
 * Link açıldığında uygulama `verify` çağırır (deep link).
 */
@Composable
fun LoginScreen(
    repository: Repository,
    onLinkSent: (String) -> Unit,
    onLoggedIn: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val emailValid = email.contains("@") && email.contains(".") && email.length >= 5

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Düğünce",
            style = MaterialTheme.typography.headlineLarge,
            color = DugunceColors.Ink,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Düğün hazırlığın tek yerde",
            style = MaterialTheme.typography.bodyLarge,
            color = DugunceColors.Muted,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(40.dp))

        OutlinedTextField(
            value = email,
            onValueChange = {
                email = it
                error = null
            },
            label = { Text("E-posta adresin") },
            singleLine = true,
            enabled = !loading,
            isError = error != null,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Done,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = error!!,
                color = DugunceColors.Danger,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(20.dp))

        Button(
            onClick = {
                scope.launch {
                    loading = true
                    error = null
                    repository.requestMagicLink(email.trim())
                        .onSuccess { onLinkSent(email.trim()) }
                        .onFailure { e ->
                            error = when (e) {
                                is ApiException -> e.message
                                else -> "Bağlantı kurulamadı. İnternetini kontrol et."
                            }
                        }
                    loading = false
                }
            },
            enabled = emailValid && !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.height(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Giriş bağlantısı gönder")
            }
        }

        Spacer(Modifier.height(16.dp))

        Text(
            text = "Sana bir giriş bağlantısı göndereceğiz. Şifre yok.",
            style = MaterialTheme.typography.bodySmall,
            color = DugunceColors.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
