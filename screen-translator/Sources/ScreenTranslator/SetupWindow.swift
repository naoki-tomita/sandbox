import AppKit
import SwiftUI
import Translation

/// 英語→日本語の翻訳モデルをダウンロードする画面。
/// ダウンロードの確認ダイアログはウィンドウに対して出るので、
/// マウスを受け付けないオーバーレイではなく、普通のウィンドウで行う。
struct SetupView: View {
    @State private var configuration: TranslationSession.Configuration?
    @State private var status: LanguageAvailability.Status?
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("翻訳モデルの準備")
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
        .padding(20)
        .frame(width: 380, alignment: .leading)
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

final class SetupWindowController {
    private var window: NSWindow?

    func show() {
        if window == nil {
            let window = NSWindow(
                contentRect: .zero,
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Screen Translator"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SetupView())
            window.center()
            self.window = window
        }
        NSApp.activate()
        window?.makeKeyAndOrderFront(nil)
    }
}
