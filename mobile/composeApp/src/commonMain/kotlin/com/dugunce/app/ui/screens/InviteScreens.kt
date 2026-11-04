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
import com.dugunce.app.api.ApiException
import com.dugunce.app.data.Repository
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

// ===========================================================================
// Davet kodu akışı — GİRİŞ GEREKTİRİR
//
// BİLDİRİLEN HATA: kullanıcı giriş ekranında "Davet kodum var"a basıp
// kodu giriyor; `POST /invites/accept` `requireAuth` arkasında olduğu
// için 401 dönüyor. İstemci 401'i "oturum düştü" sayıp token'ları
// siliyor ve "Oturumunuz sona erdi" uyarısı çıkıyor. Kullanıcı kodu bir
// daha giremiyor.
//
// ÇÖZÜM: kod SAKLANIR, kullanıcı önce giriş yapar, kod girişten SONRA
// otomatik uygulanır. İstek hiçbir zaman tokensız atılmaz.
// ===========================================================================

/** Davet kodu 7 karakter — backend `CODE_LENGTH` ile aynı. */
private const val INVITE_CODE_LENGTH = 7

/**
 * Kodu normalize eder: büyük harf, yalnız harf/rakam.
 *
 * Kullanıcı boşluk veya tire yazabilir ("abc-2345"); backend yalnız
 * büyük harf + rakam bekler.
 *
 * DİKKAT: `take(7)` KULLANILMAZ. Fazla karakter sessizce kırpılırsa
 * 8 karakterlik YANLIŞ bir kod 7'ye kesilip geçerli sayılır ve
 * kullanıcı anlamsız bir "kod bulunamadı" hatası alır. Uzunluk
 * kontrolü `hasPendingInviteCode` / `shouldSubmitInviteNow` içinde.
 */
fun normalizeInviteCode(raw: String?): String =
    (raw ?: "")
        .uppercase()
        .filter { it.isLetterOrDigit() }

/** Bekleyen (henüz uygulanmamış) davet kodu var mı? */
fun hasPendingInviteCode(code: String?): Boolean =
    normalizeInviteCode(code).length == INVITE_CODE_LENGTH

/**
 * Davet kodu ŞİMDİ gönderilsin mi?
 *
 * `isLoggedIn = false` iken GÖNDERİLMEZ — 401 alıp oturumu düşürmemek
 * için. Kod saklanır, girişten sonra gönderilir.
 */
fun shouldSubmitInviteNow(isLoggedIn: Boolean, code: String?): Boolean =
    isLoggedIn && normalizeInviteCode(code).length == INVITE_CODE_LENGTH

// ---------------------------------------------------------------------------
// `AcceptInviteScreen` KALDIRILDI (2026-11-05)
//
// Davet kodu girişi artık:
//   1. Giriş sonrası başlangıç ekranında — `CreateWeddingScreen`,
//      "Düğün oluştur" / "Davet kodum var" sekmeleri
//   2. Ayarlar → "Davet kodum var"
//
// Ayrı ekran erişilemez kalmıştı (hiçbir rotadan açılmıyordu). Kodu
// gönderen mantık `CreateWeddingScreen` içinde; yardımcı fonksiyonlar
// (`normalizeInviteCode`, `hasPendingInviteCode`, `shouldSubmitInviteNow`)
// yukarıda duruyor.
// ---------------------------------------------------------------------------
