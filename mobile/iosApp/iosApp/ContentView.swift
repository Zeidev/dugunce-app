import SwiftUI
import ComposeApp

/**
 * Compose Multiplatform köprüsü.
 *
 * Kotlin tarafındaki `MainViewController()` çağrılır; tüm ekranlar
 * Compose'da çizilir — iOS'a özgü ayrı UI yok (KMP'nin amacı bu).
 */
struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

struct ContentView: View {
    var body: some View {
        ComposeView()
            // Klavye açılınca Compose alanı küçülmesin — Android'de
            // windowSoftInputMode="adjustResize" ile aynı davranış.
            .ignoresSafeArea(.keyboard)
    }
}
