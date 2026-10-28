import AppKit

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    // Dock には出さず、メニューバーにだけ常駐する
    app.setActivationPolicy(.accessory)
    app.run()
}
