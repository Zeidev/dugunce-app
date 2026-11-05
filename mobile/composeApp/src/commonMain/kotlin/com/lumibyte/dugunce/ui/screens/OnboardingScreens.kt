package com.lumibyte.dugunce.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.lumibyte.dugunce.api.ApiException
import com.lumibyte.dugunce.data.Money
import com.lumibyte.dugunce.data.Repository
import com.lumibyte.dugunce.data.WeddingCreateRequest
import com.lumibyte.dugunce.data.WeddingDto
import com.lumibyte.dugunce.ui.components.ButtonVariant
import com.lumibyte.dugunce.ui.components.DugunceButton
import com.lumibyte.dugunce.ui.components.DugunceTextField
import com.lumibyte.dugunce.ui.PlatformBackHandler
import com.lumibyte.dugunce.ui.components.SegmentedPicker
import com.lumibyte.dugunce.ui.components.StepHeader
import com.lumibyte.dugunce.ui.components.TextAction
import com.lumibyte.dugunce.ui.theme.DugunceTheme
import com.lumibyte.dugunce.ui.theme.Radius
import com.lumibyte.dugunce.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Düğün oluştur — onboarding adım 3 (spec §6b.8).
 *
 * İsimler ve tarih zorunlu; mekân alanları atlanabilir.
 * Hedef: 2 dakikada tamamlanır.
 */
// ===========================================================================
// Giriş sonrası başlangıç: DÜĞÜN OLUŞTUR veya DAVET KODUYLA KATIL
//
// KULLANICI İSTEĞİ: "kullanıcı giriş yapsın ekranda düğün oluştur ve davet
// kodu gir bölümü olsun; kullanıcı yeniyse düğün oluşturur, eğer daveti
// varsa davet kodunu girer ve ortak olarak diğer kişiyle aynı ekrana
// aktarılır."
//
// ÖNCEKİ HATA: davet kodu girişi YALNIZCA giriş ekranındaydı. Giriş yapmış
// (hesabı olan) bir kullanıcı eşinden kod aldığında girecek yer bulamıyordu.
// ===========================================================================

/** Giriş sonrası iki yol. */
enum class StartMode {
    /** Yeni düğün oluştur — ilk kuran kullanıcı. */
    CREATE,

    /** Eşin düğününe katıl — davet kodu olan kullanıcı. */
    JOIN,
}

/**
 * Ekran hangi modda açılsın?
 *
 * Bekleyen davet kodu varsa (kullanıcı kodu girip girişe düşmüşse)
 * doğrudan KATIL modunda açılır — kodu tekrar aramasın.
 */
fun defaultStartMode(pendingInviteCode: String? = null): StartMode =
    if (hasPendingInviteCode(pendingInviteCode)) StartMode.JOIN else StartMode.CREATE

/** Düğün oluşturma formu gönderilebilir mi? */
fun canCreateWedding(mode: StartMode, coupleNames: String, dateIso: String?): Boolean =
    mode == StartMode.CREATE && coupleNames.trim().length >= 2 && dateIso != null

/** Davet kodu gönderilebilir mi? */
fun canJoinWedding(mode: StartMode, code: String?): Boolean =
    mode == StartMode.JOIN && hasPendingInviteCode(code)

/**
 * Düğün oluşturma ekranında çıkış yolu var mı?
 *
 * HER ZAMAN true. İlk kurulumda yığın tek elemanlıdır ve
 * `PlatformBackHandler` devre dışı kalır — o yüzden ekranın KENDİ çıkış
 * yolunu sunması zorunlu. Aksi hâlde kullanıcı ya düğün oluşturmak ya
 * uygulamayı kapatmak zorunda kalır (bildirilen hata).
 */
fun canEscapeCreateWedding(stackSize: Int): Boolean = true

/**
 * Sistem geri tuşu yakalanmalı mı?
 *
 * Yalnız düğün oluşturma ekranında: orada geri tuşu uygulamayı
 * kapatmak yerine çıkış seçeneği göstermeli.
 */
fun shouldInterceptBack(screenName: String, stackSize: Int): Boolean =
    screenName == "CREATE_WEDDING"

@Composable
fun CreateWeddingScreen(
    repository: Repository,
    onCreated: (WeddingDto) -> Unit,
    /** Çıkış — giriş ekranına döner ve oturumu kapatır. */
    onExit: () -> Unit = {},
    /** Davet koduyla katılma — başarılıysa düğün açılır. */
    onJoined: () -> Unit = {},
    /** Kullanıcı kodu giriş yapmadan girmişse buradan gelir. */
    pendingInviteCode: String? = null,
    /** Ayarlar'dan "Davet kodum var" ile gelindi — KATIL modunda aç. */
    startInJoinMode: Boolean = false,
    /**
     * Kullanıcının zaten bir düğünü var mı?
     *
     * Varsa bu ekran "ilk kurulum" değil, Ayarlar'dan gelen bir alt
     * ekrandır: "Çıkış" yerine "Geri" gösterilmeli. Aksi hâlde mevcut
     * kullanıcı sadece kodu girmek isterken oturumunu kapatırdı.
     */
    hasExistingWedding: Boolean = false,
) {
    val c = DugunceTheme.colors
    // Giriş sonrası İKİ YOL: düğün oluştur veya davet koduyla katıl.
    // Bekleyen kod varsa doğrudan KATIL modunda açılır.
    var mode by remember(pendingInviteCode, startInJoinMode) {
        mutableStateOf(
            if (startInJoinMode) StartMode.JOIN else defaultStartMode(pendingInviteCode),
        )
    }
    var inviteCode by remember(pendingInviteCode) {
        mutableStateOf(normalizeInviteCode(pendingInviteCode))
    }
    var coupleNames by remember { mutableStateOf("") }
    var dateText by remember { mutableStateOf("") }
    var venueName by remember { mutableStateOf("") }
    var venueAddress by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmExit by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Sistem geri tuşu uygulamayı KAPATMASIN — çıkış seçeneği göstersin.
    // İlk kurulumda yığın tek elemanlı olduğu için App.kt'deki genel
    // handler devre dışı; bu ekran kendi yolunu sunmak zorunda.
    PlatformBackHandler(enabled = shouldInterceptBack("CREATE_WEDDING", 1)) {
        // Mevcut düğünü olan kullanıcı için bu bir alt ekran — onay
        // sormadan geri dön.
        if (hasExistingWedding) onExit() else confirmExit = true
    }

    val dateValid = parseTurkishDate(dateText) != null
    val canContinue = canCreateWedding(
        mode = mode,
        coupleNames = coupleNames,
        dateIso = if (dateValid) "ok" else null,
    )

    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.screenH),
    ) {
        Spacer(Modifier.height(Spacing.sm))
        // ÇIKIŞ YOLU — her zaman görünür (bildirilen hata: bu ekrandan
        // ne geri gidilebiliyor ne de hesaptan çıkılabiliyordu).
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            TextAction(
                if (hasExistingWedding) "Geri" else "Çıkış",
                onClick = {
                    if (hasExistingWedding) onExit() else confirmExit = true
                },
            )
        }
        Spacer(Modifier.height(Spacing.xs))
        // Adım göstergesi YALNIZ oluşturma modunda. Katılan kullanıcı
        // onboarding'in 3. adımında değil — "3/7" yanıltıcı olurdu.
        if (mode == StartMode.CREATE) {
            StepHeader(step = 3, total = 7, title = "Düğününüzü oluşturalım")
        } else {
            Text(
                "Düğüne katıl",
                style = MaterialTheme.typography.headlineLarge,
                color = c.ink,
            )
        }
        Spacer(Modifier.height(Spacing.lg))

        // İKİ YOL — kullanıcı hangisi olduğunu burada seçer.
        SegmentedPicker(
            options = listOf(
                StartMode.CREATE to "Düğün oluştur",
                StartMode.JOIN to "Davet kodum var",
            ),
            selected = mode,
            onSelect = {
                if (!loading) {
                    mode = it
                    error = null
                }
            },
        )
        Spacer(Modifier.height(Spacing.lg))

        Text(
            if (mode == StartMode.CREATE) {
                "Bu bilgiler davetiyede ve panelde görünecek. Sonra değiştirebilirsin."
            } else {
                "Eşinden gelen 7 karakterlik kodu gir. Bu kod seni aynı düğünün " +
                    "ikinci sahibi yapar — aynı paneli birlikte yönetirsiniz."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = c.muted,
        )
        Spacer(Modifier.height(Spacing.xl))

        if (mode == StartMode.JOIN) {
            DugunceTextField(
                value = inviteCode,
                onValueChange = {
                    // Kırpma YOK — 8 karakterlik yanlış kod sessizce
                    // 7'ye kesilmesin (bildirilen hata).
                    inviteCode = it.uppercase().filter { ch -> ch.isLetterOrDigit() }
                    error = null
                },
                label = "Davet kodu",
                placeholder = "ABC2345",
                helper = "7 karakter — karışan harfler (0/O, 1/I) kullanılmaz",
                error = error,
                imeAction = ImeAction.Done,
                enabled = !loading,
            )
            Spacer(Modifier.height(Spacing.lg))
            DugunceButton(
                "Düğüne katıl",
                onClick = {
                    if (!canJoinWedding(mode, inviteCode) || loading) return@DugunceButton
                    loading = true
                    error = null
                    scope.launch {
                        repository.acceptInvite(normalizeInviteCode(inviteCode)).fold(
                            onSuccess = { loading = false; onJoined() },
                            onFailure = { e ->
                                loading = false
                                error = if (e is ApiException) e.message else "Kod kullanılamadı"
                            },
                        )
                    }
                },
                enabled = canJoinWedding(mode, inviteCode),
                loading = loading,
            )
            Spacer(Modifier.height(Spacing.xl))
        }

        if (mode == StartMode.CREATE) {

        DugunceTextField(
            value = coupleNames,
            onValueChange = { coupleNames = it; error = null },
            label = "Çift isimleri",
            placeholder = "Elif & Mert",
            error = if (error != null) null else null,
            helper = "Davetiyede bu şekilde görünecek",
            enabled = !loading,
        )
        Spacer(Modifier.height(Spacing.lg))

        DugunceTextField(
            value = dateText,
            onValueChange = { dateText = it; error = null },
            label = "Düğün tarihi",
            placeholder = "12.09.2026",
            keyboard = KeyboardType.Number,
            imeAction = ImeAction.Next,
            error = if (dateText.isNotBlank() && !dateValid) "Tarihi gg.aa.yyyy biçiminde gir" else error,
            enabled = !loading,
        )
        Spacer(Modifier.height(Spacing.lg))

        DugunceTextField(
            value = venueName,
            onValueChange = { venueName = it },
            label = "Mekân (isteğe bağlı)",
            placeholder = "Kır düğün salonu",
            enabled = !loading,
        )
        Spacer(Modifier.height(Spacing.lg))

        DugunceTextField(
            value = venueAddress,
            onValueChange = { venueAddress = it },
            label = "Adres (isteğe bağlı)",
            placeholder = "İlçe, şehir",
            singleLine = false,
            minLines = 2,
            enabled = !loading,
        )

        Spacer(Modifier.height(Spacing.xxl))

        DugunceButton(
            "Devam",
            onClick = {
                if (!canContinue || loading) return@DugunceButton
                loading = true
                error = null
                val iso = parseTurkishDate(dateText)!!
                scope.launch {
                    repository.createWedding(
                        WeddingCreateRequest(
                            coupleNames = coupleNames.trim(),
                            weddingDate = iso,
                            venueName = venueName.trim().ifBlank { null },
                            venueAddress = venueAddress.trim().ifBlank { null },
                        ),
                    ).fold(
                        onSuccess = { loading = false; onCreated(it) },
                        onFailure = { e ->
                            loading = false
                            error = if (e is ApiException) e.message else "Düğün oluşturulamadı."
                        },
                    )
                }
            },
            enabled = canContinue,
            loading = loading,
        )
        Spacer(Modifier.height(Spacing.xl))
        }  // if (mode == StartMode.CREATE)
    }

    // Çıkış onayı — yanlışlıkla çıkmayı önler, ama yol HER ZAMAN açık.
    if (confirmExit) {
        AlertDialog(
            onDismissRequest = { confirmExit = false },
            title = { Text("Çıkış yapılsın mı?") },
            text = {
                Text(
                    "Düğün bilgilerin kaydedilmedi. Çıkarsan hesabına tekrar " +
                        "giriş yapman gerekir.",
                )
            },
            confirmButton = {
                TextAction(
                    "Çıkış yap",
                    onClick = {
                        confirmExit = false
                        onExit()
                    },
                )
            },
            dismissButton = {
                TextAction("Vazgeç", onClick = { confirmExit = false })
            },
        )
    }
}

/**
 * `gg.aa.yyyy` veya `gg/aa/yyyy` → ISO `yyyy-MM-dd`.
 *
 * Geçersizse null. Türkçe tarih biçimi beklenir.
 */
internal fun parseTurkishDate(input: String): String? {
    val t = input.trim()
    if (t.isEmpty()) return null
    val sep = when {
        t.contains('.') -> '.'
        t.contains('/') -> '/'
        t.contains('-') -> '-'
        else -> return null
    }
    val parts = t.split(sep)
    if (parts.size != 3) return null
    val (d, m, y) = if (parts[0].length == 4) {
        // yyyy-MM-dd
        Triple(parts[2], parts[1], parts[0])
    } else {
        Triple(parts[0], parts[1], parts[2])
    }
    val day = d.toIntOrNull() ?: return null
    val month = m.toIntOrNull() ?: return null
    val year = y.toIntOrNull() ?: return null
    if (day !in 1..31 || month !in 1..12 || year !in 2000..2100) return null
    return "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"
}

/** ISO tarih → `gg.aa.yyyy`. */
internal fun formatTurkishDate(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val datePart = iso.substringBefore('T')
    val parts = datePart.split('-')
    if (parts.size != 3) return iso
    return "${parts[2]}.${parts[1]}.${parts[0]}"
}

/**
 * İlk harcama — onboarding adım 4 (spec §6b.8: **ATLANAMAZ**).
 *
 * "Değer burada kanıtlanır." Kullanıcı ilk harcamasını girmeden
 * ilerleyemez.
 */
@Composable
fun FirstExpenseScreen(
    repository: Repository,
    weddingId: String,
    onAdded: () -> Unit,
) {
    val c = DugunceTheme.colors
    var title by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val parsed = com.lumibyte.dugunce.data.Money.parseToKurus(amount)
    val canContinue = title.trim().isNotEmpty() && parsed != null && parsed != "0"

    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.screenH),
    ) {
        Spacer(Modifier.height(Spacing.lg))
        StepHeader(step = 4, total = 7, title = "İlk harcamanı ekle")
        Spacer(Modifier.height(Spacing.lg))

        Surface(
            shape = RoundedCornerShape(Radius.md),
            color = c.sageSoft,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                "Düğün hazırlığında şimdiye kadar ne harcadın? " +
                    "Salon, gelinlik, fotoğrafçı… İlkini ekleyelim, " +
                    "bütçe tablosunu hemen göreceksin.",
                style = MaterialTheme.typography.bodyMedium,
                color = c.ink,
                modifier = Modifier.padding(Spacing.md),
            )
        }
        Spacer(Modifier.height(Spacing.xl))

        DugunceTextField(
            value = title,
            onValueChange = { title = it; error = null },
            label = "Ne için harcadın?",
            placeholder = "Düğün salonu kapora",
            enabled = !loading,
        )
        Spacer(Modifier.height(Spacing.lg))

        com.lumibyte.dugunce.ui.components.MoneyField(
            value = amount,
            onValueChange = { amount = it; error = null },
            error = if (amount.isNotBlank() && parsed == null) "Geçerli bir tutar gir" else null,
        )
        Spacer(Modifier.height(Spacing.sm))
        Text(
            "Tutarı TL olarak gir; kuruş hassasiyetiyle saklanır.",
            style = MaterialTheme.typography.bodySmall,
            color = c.muted,
        )

        if (error != null) {
            Spacer(Modifier.height(Spacing.md))
            Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger)
        }

        Spacer(Modifier.height(Spacing.xxl))

        DugunceButton(
            "Harcamayı ekle",
            onClick = {
                if (!canContinue || loading) return@DugunceButton
                loading = true
                error = null
                scope.launch {
                    val today = com.lumibyte.dugunce.util.todayIso()
                    repository.createExpense(
                        weddingId,
                        com.lumibyte.dugunce.data.ExpenseCreateRequest(
                            title = title.trim(),
                            amount = Money.kurusToTlString(parsed),
                            purchaseDate = today,
                            installmentCount = 1,
                        ),
                    ).fold(
                        onSuccess = { loading = false; onAdded() },
                        onFailure = { e ->
                            loading = false
                            error = if (e is ApiException) e.message else "Harcama eklenemedi."
                        },
                    )
                }
            },
            enabled = canContinue,
            loading = loading,
        )

        Spacer(Modifier.height(Spacing.md))
        Text(
            "Bu adım atlanamaz — bütçe tablosu ilk harcamayla anlam kazanır.",
            style = MaterialTheme.typography.bodySmall,
            color = c.muted,
        )
        Spacer(Modifier.height(Spacing.xl))
    }
}

/**
 * Bütçe tanıtımı — onboarding adım 5 (spec §6b.8).
 *
 * "Taksit tablosu gösterilir, 'işte bu'."
 */
@Composable
fun BudgetIntroScreen(
    onContinue: () -> Unit,
) {
    val c = DugunceTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .padding(horizontal = Spacing.screenH),
    ) {
        Spacer(Modifier.height(Spacing.lg))
        StepHeader(step = 5, total = 7, title = "Bütçen böyle görünecek")
        Spacer(Modifier.height(Spacing.xl))

        Surface(
            shape = RoundedCornerShape(Radius.lg),
            color = c.surface,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Toplam taahhüt", style = MaterialTheme.typography.bodyMedium, color = c.muted)
                    Text(
                        "12.000,00 ₺",
                        style = MaterialTheme.typography.titleMedium,
                        color = c.ink,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Bu ay ödenecek", style = MaterialTheme.typography.bodyMedium, color = c.muted)
                    Text(
                        "3.000,00 ₺",
                        style = MaterialTheme.typography.titleMedium,
                        color = c.sage,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                com.lumibyte.dugunce.ui.components.Divider()
                Text(
                    "4 taksit × 3.000,00 ₺ · ilk taksit Ocak",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.muted,
                )
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        Surface(
            shape = RoundedCornerShape(Radius.md),
            color = c.warningSoft,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(Spacing.md)) {
                Text(
                    "İki rakam asla karışmaz",
                    style = MaterialTheme.typography.labelLarge,
                    color = c.warning,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(Spacing.xs))
                Text(
                    "Taksitli alışverişte 'toplam taahhüt' ile 'bu ay ödenecek' " +
                        "ayrı gösterilir. Aksi halde bütçe iki katı görünür.",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.inkSoft,
                )
            }
        }

        Spacer(Modifier.weight(1f))
        DugunceButton("Anladım", onClick = onContinue)
        Spacer(Modifier.height(Spacing.xl))
    }
}

/**
 * İlk davetli — onboarding adım 6 (spec §6b.8: atlanabilir).
 *
 * 30 kişi limiti BURADA açıkça söylenir (kural: limit gizlenmez).
 */
@Composable
fun FirstGuestScreen(
    repository: Repository,
    weddingId: String,
    onContinue: () -> Unit,
) {
    val c = DugunceTheme.colors
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.screenH),
    ) {
        Spacer(Modifier.height(Spacing.lg))
        StepHeader(step = 6, total = 7, title = "İlk davetlini ekle")
        Spacer(Modifier.height(Spacing.lg))

        Surface(
            shape = RoundedCornerShape(Radius.md),
            color = c.infoSoft,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                "Ücretsiz planda 30 davetli ekleyebilirsin. " +
                    "Sınıra ulaştığında uygulama seni uyarır.",
                style = MaterialTheme.typography.bodySmall,
                color = c.info,
                modifier = Modifier.padding(Spacing.md),
            )
        }
        Spacer(Modifier.height(Spacing.xl))

        DugunceTextField(
            value = name,
            onValueChange = { name = it; error = null },
            label = "Davetli adı",
            placeholder = "Ayşe Yılmaz",
            enabled = !loading,
        )
        Spacer(Modifier.height(Spacing.lg))
        DugunceTextField(
            value = phone,
            onValueChange = { phone = it },
            label = "Telefon (isteğe bağlı)",
            placeholder = "05xx xxx xx xx",
            keyboard = KeyboardType.Phone,
            helper = "WhatsApp'tan davetiye göndermek için kullanılır",
            enabled = !loading,
        )

        if (error != null) {
            Spacer(Modifier.height(Spacing.md))
            Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger)
        }

        Spacer(Modifier.height(Spacing.xxl))

        DugunceButton(
            "Davetliyi ekle",
            onClick = {
                if (name.trim().isEmpty() || loading) return@DugunceButton
                loading = true
                error = null
                scope.launch {
                    repository.createGuest(
                        weddingId,
                        com.lumibyte.dugunce.data.GuestCreateRequest(
                            name = name.trim(),
                            phone = phone.trim().ifBlank { null },
                        ),
                    ).fold(
                        onSuccess = { loading = false; onContinue() },
                        onFailure = { e ->
                            loading = false
                            error = if (e is ApiException) e.message else "Davetli eklenemedi."
                        },
                    )
                }
            },
            enabled = name.trim().isNotEmpty(),
            loading = loading,
        )
        Spacer(Modifier.height(Spacing.sm))
        DugunceButton("Şimdilik atla", onClick = onContinue, variant = ButtonVariant.GHOST)
        Spacer(Modifier.height(Spacing.xl))
    }
}

/** Onboarding tamam — adım 7. */
@Composable
fun OnboardingDoneScreen(onStart: () -> Unit) {
    val c = DugunceTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(c.cream)
            .padding(horizontal = Spacing.screenH),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Hazırsın",
            style = MaterialTheme.typography.headlineLarge,
            color = c.ink,
        )
        Spacer(Modifier.height(Spacing.md))
        Text(
            "Bütçen, davetlilerin ve görevlerin tek yerde. " +
                "İstediğin zaman yeni harcama ekleyebilir, davetli çağırabilirsin.",
            style = MaterialTheme.typography.bodyLarge,
            color = c.muted,
        )
        Spacer(Modifier.height(Spacing.xxl))
        DugunceButton("Panele git", onClick = onStart)
        Spacer(Modifier.height(Spacing.xl))
    }
}
