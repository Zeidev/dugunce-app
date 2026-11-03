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
        func queryValue(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }

        // Backend linki `https://dugunce.com.tr/auth#<token>` — token
        // FRAGMENT'te (sunucuya gitmez, design §7). Android'deki
        // MainActivity.handleIntent ile aynı mantık.
        let fragment = components.fragment?.replacingOccurrences(of: "#", with: "")
        let fragmentParams: [String: String] = {
            guard let f = fragment, !f.isEmpty else { return [:] }
            var out: [String: String] = [:]
            for part in f.split(separator: "&") {
                let kv = part.split(separator: "=", maxSplits: 1)
                if kv.count == 2 { out[String(kv[0])] = String(kv[1]) }
            }
            return out
        }()

        func value(_ name: String) -> String? {
            queryValue(name) ?? fragmentParams[name]
        }

        switch path {
        case "/auth":
            // Fragment'ta `=` yoksa tamamı token'dır
            if let raw = fragment, !raw.isEmpty, !raw.contains("=") {
                authToken = raw
            } else {
                authToken = value("token")
            }
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
