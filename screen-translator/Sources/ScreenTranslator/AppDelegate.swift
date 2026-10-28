import AppKit
import Carbon
import Translation
import TranslatorCore

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var translateHotKey: HotKey?
    private var escapeHotKey: HotKey?
    private var clickMonitor: Any?
    private var overlay: OverlayWindow?
    private var isWorking = false
    private let setup = SetupWindowController()

    /// 発動キー: ⌃⌥T (Control + Option + T)
    private static let hotKeyCode = kVK_ANSI_T
    private static let hotKeyModifiers = controlKey | optionKey
    private static let hotKeyLabel = "⌃⌥T"

    func applicationDidFinishLaunching(_ notification: Notification) {
        setUpStatusItem()

        translateHotKey = HotKey(keyCode: Self.hotKeyCode, modifiers: Self.hotKeyModifiers) { [weak self] in
            self?.toggle()
        }
        if translateHotKey == nil {
            alert("\(Self.hotKeyLabel) を登録できませんでした。他のアプリが使っている可能性があります。")
        }

        _ = ScreenCapture.ensurePermission()

        Task {
            let status = await LanguageAvailability().status(from: Languages.source, to: Languages.target)
            if status != .installed { setup.show() }
        }
    }

    private func setUpStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "character.bubble", accessibilityDescription: "Screen Translator")

        let menu = NSMenu()
        let translate = NSMenuItem(title: "画面を翻訳 (\(Self.hotKeyLabel))", action: #selector(translateFromMenu), keyEquivalent: "")
        translate.target = self
        menu.addItem(translate)
        let setupItem = NSMenuItem(title: "翻訳モデルの準備…", action: #selector(showSetup), keyEquivalent: "")
        setupItem.target = self
        menu.addItem(setupItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    @objc private func translateFromMenu() {
        // メニューが閉じてから撮る
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.toggle() }
    }

    @objc private func showSetup() {
        setup.show()
    }

    // MARK: - 翻訳

    private func toggle() {
        if overlay != nil {
            hideOverlay()
            return
        }
        guard !isWorking else { return }
        isWorking = true

        Task { @MainActor in
            defer { isWorking = false }
            await translateScreen()
        }
    }

    @MainActor
    private func translateScreen() async {
        guard ScreenCapture.ensurePermission() else {
            alert("「システム設定 > プライバシーとセキュリティ > 画面収録」で Screen Translator を許可してください。許可したあとはアプリの再起動が必要です。")
            return
        }

        let status = await LanguageAvailability().status(from: Languages.source, to: Languages.target)
        guard status == .installed else {
            setup.show()
            return
        }

        // マウスカーソルがある画面を対象にする
        let mouse = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main else { return }

        do {
            let image = try await ScreenCapture.capture(screen)
            let lines = try await TextRecognizer.recognize(in: image, size: screen.frame.size)
            let blocks = TextBlockGrouper.group(lines)
            guard !blocks.isEmpty else {
                NSSound.beep()
                return
            }
            showOverlay(on: screen, model: OverlayModel(blocks: blocks))
        } catch {
            alert("画面の読み取りに失敗しました: \(error.localizedDescription)")
        }
    }

    // MARK: - オーバーレイ

    private func showOverlay(on screen: NSScreen, model: OverlayModel) {
        let window = OverlayWindow(screen: screen, model: model)
        window.orderFrontRegardless()
        overlay = window

        // 表示中だけ Esc を奪う
        escapeHotKey = HotKey(keyCode: kVK_Escape, modifiers: 0) { [weak self] in
            self?.hideOverlay()
        }
        // どこかをクリックしたら閉じる (クリック自体はゲームに届く)
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.hideOverlay()
        }
    }

    private func hideOverlay() {
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
