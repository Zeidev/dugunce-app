import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.ExperimentalKotlinGradlePluginApi
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
}

kotlin {
    androidTarget {
        @OptIn(ExperimentalKotlinGradlePluginApi::class)
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    // iOS hedefleri — derleme CI'da macOS runner'da yapılır.
    //
    // `iosX64` (Intel Mac simulatoru) KALDIRILDI: Compose Multiplatform
    // 1.11.0 Apple x86_64 hedeflerini desteklemiyor (Kotlin KT-81596).
    // Gerçek iPhone (`iosArm64`) ve Apple Silicon simulator
    // (`iosSimulatorArm64`) desteklenmeye devam ediyor — uygulama iOS'ta
    // çalışır, yalnız Intel Mac'te simulator açılmaz.
    listOf(
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }

    // Xcode entegrasyonu: `embedAndSignAppleFrameworkForXcode` görevi,
    // Xcode "Run Script" aşamasından çağrıldığında framework'ü uygulama
    // paketine kopyalar. Ayrıntı: docs/DEEPLINK-SETUP.md
    // Xcode projesi (iosApp.xcodeproj) henüz yok — macOS'ta üretilmeli.

    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.materialIconsExtended)
            implementation(compose.ui)

            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.json)
            implementation(libs.multiplatform.settings)
            implementation(libs.kotlinx.datetime)
        }

        androidMain.dependencies {
            implementation(compose.preview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.androidx.core.ktx)
            implementation(libs.ktor.client.okhttp)
        }

        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }

        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.multiplatform.settings.test)
        }
    }
}

android {
    namespace = "com.dugunce.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dugunce.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    /**
     * SABİT debug keystore — App Links doğrulaması için.
     *
     * Android Studio'nun varsayılan debug keystore'u her makinede ve her
     * CI koşusunda farklı üretilir; `assetlinks.json`'daki SHA-256
     * parmak izi bu yüzden hiç eşleşmez ve https linkleri tarayıcıda
     * kalır.
     *
     * `mobile/debug.keystore` repoda sabit duruyor (şifre `android`,
     * standart debug şifresi — gizli bilgi değil, yalnızca test içindir).
     * Üretimi: `scripts/gen-debug-keystore.sh`.
     *
     * ÜRETİMDE KULLANILMAZ: release build kendi keystore'unu kullanacak.
     */
    signingConfigs {
        getByName("debug") {
            storeFile = file("../debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
        getByName("release") {
            isMinifyEnabled = false
        }
    }
}
