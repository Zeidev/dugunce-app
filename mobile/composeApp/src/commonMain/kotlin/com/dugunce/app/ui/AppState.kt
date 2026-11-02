package com.dugunce.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.dugunce.app.data.GuestDto
import com.dugunce.app.data.TaskDto
import com.dugunce.app.data.WeddingDto
import com.dugunce.app.ui.nav.Screen

/**
 * Uygulama durumu — tek kaynak.
 *
 * KMP'de ViewModel/navigation-compose bağımlılığı yok; bu basit tutucu
 * yeterli ve `commonTest` ile test edilebilir. Navigasyon bir yığın
 * olarak tutulur: geri tuşu `pop()`.
 *
 * Kural: ekranlar kendi verisini yükler, ama paylaşılan veri (düğün,
 * seçili görev) burada tutulur.
 */
class AppState {
    /** Navigasyon yığını — son eleman görünen ekran. */
    val stack = mutableStateListOf<Screen>(Screen.WELCOME)

    val current: Screen get() = stack.lastOrNull() ?: Screen.WELCOME

    /** Yüklenmiş düğün (yoksa onboarding). */
    var wedding by mutableStateOf<WeddingDto?>(null)

    /** Seçili görev — sohbet/detay için. */
    var selectedTask by mutableStateOf<TaskDto?>(null)

    /** Seçili davetli — detay için. */
    var selectedGuest by mutableStateOf<GuestDto?>(null)

    /** Düzenlenen harcama (null ise yeni). */
    var editingExpenseId by mutableStateOf<String?>(null)

    /** Düzenlenen görev (null ise yeni). */
    var editingTaskId by mutableStateOf<String?>(null)

    /** Düzenlenen davetli (null ise yeni). */
    var editingGuestId by mutableStateOf<String?>(null)

    /** Yeni oluşturulan yardımcının token'ı — davet ekranında gösterilir. */
    var createdHelperToken by mutableStateOf<String?>(null)

    /** Global hata bandı (ağ hatası, oturum süresi). */
    var banner by mutableStateOf<BannerMessage?>(null)

    // --- Navigasyon ---

    fun go(screen: Screen) {
        if (stack.lastOrNull() == screen) return
        stack.add(screen)
    }

    /** Sekmeye geç — yığını sıfırlar (alt çubuk davranışı). */
    fun switchTab(screen: Screen) {
        stack.clear()
        stack.add(screen)
    }

    fun back(): Boolean {
        if (stack.size <= 1) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    /** Yığını köke döndür. */
    fun resetTo(screen: Screen) {
        stack.clear()
        stack.add(screen)
    }

    // --- Banner ---

    fun showBanner(message: String, isError: Boolean = true) {
        banner = BannerMessage(message, isError)
    }

    fun clearBanner() {
        banner = null
    }
}

/** Kısa süreli bilgi bandı. */
data class BannerMessage(
    val text: String,
    val isError: Boolean,
)

/**
 * Ekran verisi yükleme durumu.
 *
 * Brief §16.3: "Her ekranın loading, empty, error ve success durumları olsun."
 */
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Empty(val message: String) : UiState<Nothing>
    data class Error(val message: String) : UiState<Nothing>
}

/** `Result` → `UiState` dönüşümü, boş listeyi Empty'ye çevirir. */
fun <T> Result<T>.toUiState(emptyCheck: (T) -> Boolean = { false }, emptyMessage: String = "Henüz kayıt yok"): UiState<T> =
    fold(
        onSuccess = { if (emptyCheck(it)) UiState.Empty(emptyMessage) else UiState.Success(it) },
        onFailure = { UiState.Error(it.message ?: "Bir hata oluştu") },
    )
