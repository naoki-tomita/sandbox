import AppKit
import Carbon
import Combine
import Translation
import TranslatorCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private var translateHotKey: HotKey?
    private var escapeHotKey: HotKey?
    private var clickMonitor: Any?
    private var overlay: OverlayWindow?
    private var isWorking = false
    private let shortcutSettings = ShortcutSettings()
    private lazy var settingsWindow = SettingsWindowController(shortcutSettings: shortcutSettings)
    private var translateMenuItem: NSMenuItem!
    private var recordingObserver: AnyCancellable?
    private var watchMenuItem: NSMenuItem!
    /// 自動翻訳で画面を読み直し続けるタスク
    private var watchTask: Task<Void, Never>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setUpStatusItem()

        shortcutSettings.register = { [weak self] shortcut in
            self?.registerTranslateHotKey(shortcut) ?? false
        }
        // 設定画面でキーを入力している間は、今のホットキーが反応しないよう外しておく
        recordingObserver = shortcutSettings.$isRecording.dropFirst().sink { [weak self] isRecording in
            guard let self else { return }
            if isRecording {
                translateHotKey = nil
            } else {
                _ = registerTranslateHotKey(shortcutSettings.shortcut)
            }
        }
        if !registerTranslateHotKey(shortcutSettings.shortcut) {
            alert("\(shortcutSettings.shortcut.displayString) を登録できませんでした。他のアプリが使っている可能性があります。メニューの「設定…」から別のキーにしてください。")
        }

        _ = ScreenCapture.ensurePermission()

        Task {
            let status = await LanguageAvailability().status(from: Languages.source, to: Languages.target)
            if status != .installed { settingsWindow.show() }
        }
    }

    private func registerTranslateHotKey(_ shortcut: Shortcut) -> Bool {
        // 同じ組み合わせを二重に登録すると失敗するので、先に外す
        translateHotKey = nil
        translateHotKey = HotKey(keyCode: shortcut.keyCode, modifiers: shortcut.modifiers.rawValue) { [weak self] in
            self?.toggle()
        }
        guard translateHotKey != nil else { return false }
        translateMenuItem.title = "画面を翻訳 (\(shortcut.displayString))"
        return true
    }

    private func setUpStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "character.bubble", accessibilityDescription: "Screen Translator")

        let menu = NSMenu()
        translateMenuItem = NSMenuItem(title: "画面を翻訳", action: #selector(translateFromMenu), keyEquivalent: "")
        translateMenuItem.target = self
        menu.addItem(translateMenuItem)
        watchMenuItem = NSMenuItem(title: "自動翻訳 (定期的に更新)", action: #selector(toggleWatch), keyEquivalent: "")
        watchMenuItem.target = self
        menu.addItem(watchMenuItem)
        let settingsItem = NSMenuItem(title: "設定…", action: #selector(showSettings), keyEquivalent: ",")
        settingsItem.target = self
        menu.addItem(settingsItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        menu.delegate = self
        statusItem.menu = menu
    }

    func menuWillOpen(_ menu: NSMenu) {
        watchMenuItem.state = WatchSettings.isEnabled ? .on : .off
    }

    @objc private func toggleWatch() {
        WatchSettings.isEnabled.toggle()
    }

    @objc private func translateFromMenu() {
        // メニューが閉じてから撮る
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.toggle() }
    }

    @objc private func showSettings() {
        settingsWindow.show()
    }

    // MARK: - 翻訳

    private func toggle() {
        if overlay != nil {
            hideOverlay()
            return
        }
        guard !isWorking else { return }
        isWorking = true

        Task {
            defer { isWorking = false }
            await translateScreen()
        }
    }

    private func translateScreen() async {
        guard ScreenCapture.ensurePermission() else {
            alert("「システム設定 > プライバシーとセキュリティ > 画面収録」で Screen Translator を許可してください。許可したあとはアプリの再起動が必要です。")
            return
        }

        let status = await LanguageAvailability().status(from: Languages.source, to: Languages.target)
        guard status == .installed else {
            settingsWindow.show()
            return
        }

        // マウスカーソルがある画面を対象にする
        let mouse = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main else { return }

        do {
            let blocks = try await scan(screen)
            if WatchSettings.isEnabled {
                let model = OverlayModel(blocks: blocks, isWatching: true)
                showOverlay(on: screen, model: model, closesOnUserAction: false)
                startWatching(screen, model: model)
            } else {
                guard !blocks.isEmpty else {
                    NSSound.beep()
                    return
                }
                showOverlay(on: screen, model: OverlayModel(blocks: blocks), closesOnUserAction: true)
            }
        } catch {
            alert("画面の読み取りに失敗しました: \(error.localizedDescription)")
        }
    }

    private func scan(_ screen: NSScreen) async throws -> [TextBlock] {
        // キャプチャからはこのアプリのウィンドウが除かれるので、訳を表示したままでも読み直せる
        let image = try await ScreenCapture.capture(screen)
        let lines = try await TextRecognizer.recognize(in: image, size: screen.frame.size)
        return TextBlockGrouper.group(lines)
    }

    /// 一定間隔で画面を読み直し、文章が変わったら訳し直す
    private func startWatching(_ screen: NSScreen, model: OverlayModel) {
        watchTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(WatchSettings.interval))
                guard !Task.isCancelled, let self else { return }
                // 読み取りに一度失敗しても、次の回でやり直す
                if let blocks = try? await scan(screen), !Task.isCancelled {
                    model.update(blocks)
                }
            }
        }
    }

    // MARK: - オーバーレイ

    /// - Parameter closesOnUserAction: Esc やクリックで閉じるか。
    ///   自動翻訳中はゲームを操作し続けるので、Esc も奪わず、発動キーでだけ閉じる
    private func showOverlay(on screen: NSScreen, model: OverlayModel, closesOnUserAction: Bool) {
        let window = OverlayWindow(screen: screen, model: model)
        window.orderFrontRegardless()
        overlay = window

        if closesOnUserAction {
            // 表示中だけ Esc を奪う
            escapeHotKey = HotKey(keyCode: kVK_Escape, modifiers: 0) { [weak self] in
                self?.hideOverlay()
            }
            // どこかをクリックしたら閉じる (クリック自体はゲームに届く)
            clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
                self?.hideOverlay()
            }
        }
    }

    private func hideOverlay() {
        watchTask?.cancel()
        watchTask = nil
        overlay?.orderOut(nil)
        overlay = nil
        escapeHotKey = nil
        if let clickMonitor { NSEvent.removeMonitor(clickMonitor) }
        clickMonitor = nil
    }

    private func alert(_ message: String) {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Screen Translator"
        alert.informativeText = message
        alert.runModal()
    }
}
