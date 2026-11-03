package com.dugunce.app.util

import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication
import platform.UIKit.UIPasteboard
import platform.UIKit.UIViewController
import platform.UIKit.UIWindow

/**
 * iOS pano/paylaşım uygulaması.
 *
 * `UIPasteboard.generalPasteboard` panoya yazar; paylaşım için kök view
 * controller üzerinden `UIActivityViewController` sunulur.
 */
actual fun copyToClipboard(text: String): Boolean {
    UIPasteboard.generalPasteboard.string = text
    return true
}

actual fun shareText(text: String, subject: String): Boolean {
    val root = rootViewController() ?: return false
    val controller = UIActivityViewController(
        activityItems = listOf(text),
        applicationActivities = null,
    )
    root.presentViewController(controller, animated = true, completion = null)
    return true
}

private fun rootViewController(): UIViewController? {
    val window = UIApplication.sharedApplication.keyWindow ?: return null
    var controller = window.rootViewController
    while (controller?.presentedViewController != null) {
        controller = controller.presentedViewController
    }
    return controller
}
