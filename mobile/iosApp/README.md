# Düğünce iOS uygulaması

**Durum:** Kaynak dosyalar hazır, **Xcode projesi henüz üretilmedi.**

## Neden proje dosyası yok

`iosApp.xcodeproj` macOS'ta Xcode ile üretilir. Bu depo Linux'ta
geliştirildiği için proje dosyası burada oluşturulamaz — elle yazmak
Xcode'un beklediği yapıyı bozar.

## Ne var

| Dosya | İçerik |
|---|---|
| `iosApp/iOSApp.swift` | `@main` giriş noktası + `DeepLinkHandler` |
| `iosApp/ContentView.swift` | `MainViewController()` köprüsü |
| `iosApp/Info.plist` | Paket bilgisi, `dugunce://` özel şeması |
| `iosApp/iosApp.entitlements` | `applinks:dugunce.com.tr` |

## Ne yapılmalı (macOS'ta, tek seferlik)

1. Xcode → File → New → Project → iOS App
   - Product name: `iosApp`
   - Bundle identifier: `com.dugunce.app`
   - Interface: SwiftUI, Language: Swift
2. `iosApp/` klasöründeki 4 dosyayı projeye ekle (varsayılanları değiştir)
3. Build Settings → **User Script Sandboxing: No**
4. Build Phases → New Run Script Phase (Compile Sources'tan ÖNCE):
   ```sh
   cd "$SRCROOT/.."
   ./gradlew :composeApp:embedAndSignAppleFrameworkForXcode
   ```
5. Framework Search Paths:
   ```
   $(SRCROOT)/../composeApp/build/xcode-frameworks/$(CONFIGURATION)/$(SDK_NAME)
   ```
6. Signing & Capabilities → Associated Domains ekle:
   `applinks:dugunce.com.tr`

## Deep link

Universal link (`https://dugunce.com.tr/auth?token=…`) **AASA dosyası ve
Apple Developer Team ID** gerektirir — `docs/DEEPLINK-SETUP.md`.
O gelene kadar `dugunce://auth?token=…` özel şeması çalışır.
