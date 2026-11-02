import SwiftUI
import ComposeApp

/**
 * Düğünce iOS giriş noktası.
 *
 * Compose Multiplatform `MainViewController()` tek bir UIViewController
 * döner; SwiftUI onu `UIViewControllerRepresentable` ile sarar.
 *
 * Deep link: `https://dugunce.com.tr/auth?token=…` ve `/invite?code=…`
 * universal link olarak buraya düşer (AASA dosyası yayınlandığında).
 * `onOpenURL` ile yakalanır ve Compose tarafına iletilir.
 */
@main
struct iOSApp: App {
    @StateObject private var linkHandler = DeepLinkHandler()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(linkHandler)
                .onOpenURL { url in
                    linkHandler.handle(url)
                }
        }
    }
}

/**
 * Universal link çözümleyicisi.
 *
 * Android `MainActivity.handleIntent` ile aynı kurallar:
 *   /auth?token=X   → magic link
 *   /invite?code=X  → davet kodu
 */
final class DeepLinkHandler: ObservableObject {
    @Published var authToken: String?
    @Published var inviteCode: String?

    func handle(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let path = components.path.hasSuffix("/")
            ? String(components.path.dropLast())
            : components.path

        let items = components.queryItems ?? []
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }

        switch path {
        case "/auth":
            authToken = value("token")
        case "/invite":
            inviteCode = value("code")
        default:
            break
        }
    }

    func consume() {
        authToken = nil
        inviteCode = nil
    }
}
