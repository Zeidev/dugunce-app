package com.lumibyte.dugunce.ui.screens

import com.lumibyte.dugunce.ui.icons.AppIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.lumibyte.dugunce.ui.components.DugunceButton
import com.lumibyte.dugunce.ui.components.TextAction
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Karşılama — onboarding adım 1 (spec §6b.8).
 *
 * 3 sayfa: ne yapar / kime yarar / ücretsiz sınırlar.
 * Limitler GİZLENMEZ — açıkça yazılır (spec §6b.8 kuralı).
 */
private data class WelcomePage(
    val icon: ImageVector,
    val title: String,
    val body: String,
)

private val pages = listOf(
    WelcomePage(
        AppIcons.Savings,
        "Düğün bütçen tek yerde",
        "Harcamalarını, taksitlerini ve bu ay ne kadar ödeyeceğini " +
            "tek ekranda gör. Taksitli alışverişte toplam tutar ile " +
            "aylık ödeme birbirine karışmaz.",
    ),
    WelcomePage(
        AppIcons.Groups,
        "Davetlileri ve yanıtları yönet",
        "Davetli listeni tut, WhatsApp'tan davetiye linki gönder, " +
            "kim geliyor kim gelmiyor anında gör. Misafirin uygulama " +
            "kurmasına gerek yok.",
    ),
    WelcomePage(
        AppIcons.Favorite,
        "Yardımcılara görev ver",
        "Hazırlık işlerini paylaş. Yardımcın da uygulama kurmadan, " +
            "sana özel linkle görevini görür ve durumunu günceller.",
    ),
)

@Composable
fun WelcomeScreen(
    onDone: () -> Unit,
    onSkip: () -> Unit,
) {
    val c = DugunceTheme.colors
    val pager = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val isLast = pager.currentPage == pages.lastIndex

    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream),
    ) {
        // Üst: atla
        Row(
            Modifier.fillMaxWidth().padding(Spacing.lg),
            horizontalArrangement = Arrangement.End,
        ) {
            TextAction("Atla", onSkip)
        }

        HorizontalPager(
            state = pager,
            modifier = Modifier.weight(1f),
        ) { index ->
            val page = pages[index]
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Surface(
                    shape = RoundedCornerShape(Radius.xl),
                    color = c.sageSoft,
                    modifier = Modifier.size(112.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(page.icon, contentDescription = null, tint = c.sage, modifier = Modifier.size(48.dp))
                    }
                }
                Spacer(Modifier.height(Spacing.xl))
                Text(
                    page.title,
                    style = MaterialTheme.typography.headlineMedium,
                    color = c.ink,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(Spacing.md))
                Text(
                    page.body,
                    style = MaterialTheme.typography.bodyLarge,
                    color = c.muted,
                    textAlign = TextAlign.Center,
                )
            }
        }

        // Nokta göstergesi
        Row(
            Modifier.fillMaxWidth().padding(vertical = Spacing.lg),
            horizontalArrangement = Arrangement.Center,
        ) {
            repeat(pages.size) { i ->
                val active = i == pager.currentPage
                Box(
                    Modifier
                        .padding(horizontal = 4.dp)
                        .size(if (active) 10.dp else 8.dp)
                        .background(
                            if (active) c.sage else c.line,
                            CircleShape,
                        ),
                )
            }
        }

        Column(Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.lg)) {
            if (isLast) {
                // Ücretsiz sınırlar AÇIKÇA (spec §6b.8)
                Surface(
                    shape = RoundedCornerShape(Radius.md),
                    color = c.surfaceAlt,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(Spacing.md)) {
                        Text(
                            "Ücretsiz planda",
                            style = MaterialTheme.typography.labelLarge,
                            color = c.ink,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(Spacing.xs))
                        Text(
                            "30 davetli · 1 yardımcı · 1 görev · 50 MB fotoğraf",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.muted,
                        )
                    }
                }
                Spacer(Modifier.height(Spacing.md))
                DugunceButton("Başlayalım", onClick = onDone)
            } else {
                DugunceButton(
                    "Devam",
                    onClick = { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                )
            }
        }
    }
}
