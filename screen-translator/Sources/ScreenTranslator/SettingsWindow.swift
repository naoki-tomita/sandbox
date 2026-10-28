import AppKit
import Carbon
import SwiftUI
import Translation
import TranslatorCore

struct SettingsView: View {
    @ObservedObject var shortcutSettings: ShortcutSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("発動キー")
                    .font(.headline)
                ShortcutRecorder(settings: shortcutSettings)
            }
            Divider()
            WatchSection()
            Divider()
            TranslationModelSection()
        }
        .padding(20)
        .frame(width: 400, alignment: .leading)
    }
}

/// クリックしてから押したキーを発動キーにする
private struct ShortcutRecorder: View {
    @ObservedObject var settings: ShortcutSettings
    @State private var monitor: Any?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Button {
                    settings.isRecording ? stopRecording() : startRecording()
                } label: {
                    Text(settings.isRecording ? "キーを押してください…" : settings.shortcut.displayString)
                        .font(.system(size: 13, weight: .medium))
                        .frame(minWidth: 160)
                }
                if settings.isRecording {
                    Button("キャンセル") { stopRecording() }
                } else if settings.shortcut != .default {
                    Button("初期設定 (\(Shortcut.default.displayString)) に戻す") { apply(.default) }
                }
            }

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            } else {
                Text("⌘ / ⌥ / ⌃ のどれかと組み合わせるか、F1〜F20 を使えます。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .onDisappear { stopRecording() }
    }

    private func startRecording() {
        error = nil
        settings.isRecording = true
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            handle(event)
            return nil
        }
    }

    private func stopRecording() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        settings.isRecording = false
    }

    private func handle(_ event: NSEvent) {
        let keyCode = Int(event.keyCode)
        let modifiers = Shortcut.Modifiers(event.modifierFlags)

        // 修飾キーなしの Esc はキャンセル
        if keyCode == kVK_Escape, modifiers.isEmpty {
            stopRecording()
            return
        }

        switch Shortcut.validate(keyCode: keyCode, modifiers: modifiers) {
        case .reserved?:
            error = "Esc は訳を閉じるのに使うので選べません"
            return
        case .needsModifier?:
            error = "⌘ / ⌥ / ⌃ のどれかと一緒に押してください"
            return
        case nil:
            break
        }

        guard let label = Shortcut.specialKeyLabel(for: keyCode)
            ?? event.characters(byApplyingModifiers: [])?.uppercased(),
            !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            error = "このキーは使えません"
            return
        }

        stopRecording()
        apply(Shortcut(keyCode: keyCode, modifiers: modifiers, keyLabel: label))
    }

    private func apply(_ shortcut: Shortcut) {
        error = settings.update(shortcut)
            ? nil
            : "\(shortcut.displayString) は他のアプリが使っているため登録できません"
    }
}

/// 一定間隔で画面を読み直して訳を更新するモード
private struct WatchSection: View {
    @AppStorage(WatchSettings.enabledKey) private var isEnabled = false
    @AppStorage(WatchSettings.intervalKey) private var interval = WatchSettings.defaultInterval

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("自動翻訳")
                .font(.headline)
            Toggle("定期的に画面を読み直して訳を更新する", isOn: $isEnabled)
            Picker("間隔", selection: $interval) {
                ForEach(WatchSettings.intervals, id: \.self) { seconds in
                    Text("\(Int(seconds)) 秒").tag(seconds)
                }
            }
            .frame(width: 160)
            .disabled(!isEnabled)
            Text("オンにすると、発動キーで翻訳を始めたあと、もう一度発動キーを押すまで訳を更新し続けます。セリフが次々に変わるゲーム向けです。")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// 英語→日本語の翻訳モデルをダウンロードする。
/// ダウンロードの確認ダイアログはウィンドウに対して出るので、
/// マウスを受け付けないオーバーレイではなく、このウィンドウで行う。
private struct TranslationModelSection: View {
    @State private var configuration: TranslationSession.Configuration?
    @State private var status: LanguageAvailability.Status?
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("翻訳モデル")
                .font(.headline)
            Text("英語→日本語の翻訳には、macOS 内蔵の翻訳モデル (無料・オンデバイス) を使います。初回だけダウンロードが必要です。")
                .fixedSize(horizontal: false, vertical: true)

            switch status {
            case .installed:
                Label("準備できています", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .supported:
                Button("ダウンロードする") {
                    if configuration == nil {
                        configuration = .init(source: Languages.source, target: Languages.target)
                    } else {
                        configuration?.invalidate()
                    }
                }
            case .unsupported:
                Text("この Mac では英語→日本語の翻訳が使えません")
                    .foregroundStyle(.red)
            default:
                ProgressView().controlSize(.small)
            }

            if let message {
                Text(message).foregroundStyle(.secondary)
            }
        }
        .task { await refresh() }
        .translationTask(configuration) { session in
            do {
                try await session.prepareTranslation()
                message = nil
            } catch {
                message = error.localizedDescription
            }
            await refresh()
        }
    }

    private func refresh() async {
        status = await LanguageAvailability().status(from: Languages.source, to: Languages.target)
    }
}

final class SettingsWindowController {
    private let shortcutSettings: ShortcutSettings
    private var window: NSWindow?

    init(shortcutSettings: ShortcutSettings) {
        self.shortcutSettings = shortcutSettings
    }

    func show() {
        if window == nil {
            let window = NSWindow(
                contentRect: .zero,
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Screen Translator の設定"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SettingsView(shortcutSettings: shortcutSettings))
            window.center()
            self.window = window
        }
        NSApp.activate()
        window?.makeKeyAndOrderFront(nil)
    }
}
