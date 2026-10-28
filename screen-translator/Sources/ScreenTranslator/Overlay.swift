import AppKit
import SwiftUI
import TranslatorCore
import Translation

enum Languages {
    static let source = Locale.Language(identifier: "en")
    static let target = Locale.Language(identifier: "ja")
}

struct TranslatedBlock: Identifiable {
    let id: Int
    let source: TextBlock
    var translation: String?
}

@MainActor
final class OverlayModel: ObservableObject {
    enum Phase: Equatable {
        case translating
        case done
        case failed(String)
    }

    @Published var phase: Phase = .done
    @Published var blocks: [TranslatedBlock] = []
    /// これが設定 (または invalidate) されると OverlayView の translationTask が走る
    @Published var configuration: TranslationSession.Configuration?
    /// 定期的に画面を読み直しているか
    let isWatching: Bool

    /// 同じ文を何度も翻訳しないよう、訳を覚えておく
    private var cache: [String: String] = [:]
    private var nextID = 0

    init(blocks: [TextBlock], isWatching: Bool = false) {
        self.isWatching = isWatching
        update(blocks)
    }

    /// 読み取り直したテキストに差し替える。まだ訳していない文があれば翻訳を始める
    func update(_ newBlocks: [TextBlock]) {
        blocks = newBlocks.map { block in
            defer { nextID += 1 }
            return TranslatedBlock(id: nextID, source: block, translation: cache[block.text])
        }
        guard blocks.contains(where: { $0.translation == nil }) else {
            phase = .done
            return
        }

        phase = .translating
        if configuration == nil {
            configuration = .init(source: Languages.source, target: Languages.target)
        } else {
            configuration?.invalidate()
        }
    }

    func translate(using session: TranslationSession) async {
        let pending = blocks.filter { $0.translation == nil }
        let sources = Dictionary(uniqueKeysWithValues: pending.map { ($0.id, $0.source.text) })
        let requests = pending.map {
            TranslationSession.Request(sourceText: $0.source.text, clientIdentifier: String($0.id))
        }
        do {
            for try await response in session.translate(batch: requests) {
                guard let id = response.clientIdentifier.flatMap(Int.init) else { continue }
                if let source = sources[id] { cache[source] = response.targetText }
                // 翻訳中に画面が読み直されていたら、同じ文のブロックに入れる
                for index in blocks.indices where blocks[index].translation == nil {
                    blocks[index].translation = cache[blocks[index].source.text]
                }
            }
            if !blocks.contains(where: { $0.translation == nil }) { phase = .done }
        } catch is CancellationError {
            // 読み直しで次の翻訳が始まった
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

struct OverlayView: View {
    @ObservedObject var model: OverlayModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear

            ForEach(model.blocks) { block in
                if let translation = block.translation {
                    TranslationLabel(text: translation, block: block.source)
                }
            }

            StatusBadge(phase: model.phase, isWatching: model.isWatching)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 40)
                .padding(.trailing, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .translationTask(model.configuration) { session in
            await model.translate(using: session)
        }
    }
}

/// 元のテキストの位置に被せる訳文
private struct TranslationLabel: View {
    let text: String
    let block: TextBlock

    var body: some View {
        let padding: CGFloat = 4
        let rect = block.rect.insetBy(dx: -padding, dy: -padding)

        Text(text)
            .font(.system(size: max(block.lineHeight * 0.8, 10), weight: .medium))
            .foregroundStyle(.white)
            .minimumScaleFactor(0.3)
            .lineSpacing(0)
            .padding(padding)
            .frame(width: rect.width, height: rect.height, alignment: .topLeading)
            .background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: 4))
            .offset(x: rect.minX, y: rect.minY)
    }
}

private struct StatusBadge: View {
    let phase: OverlayModel.Phase
    let isWatching: Bool

    var body: some View {
        Group {
            switch phase {
            case .translating:
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("翻訳中…")
                }
            case .done where isWatching:
                HStack(spacing: 6) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text("自動翻訳中 · 発動キーで終了")
                }
            case .done:
                Text("Esc / クリックで閉じる")
            case let .failed(message):
                Text("翻訳に失敗しました: \(message)")
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.black.opacity(0.7), in: Capsule())
    }
}

/// 画面全体を覆う透明なウィンドウ。マウス操作はその下のゲームにそのまま届く
final class OverlayWindow: NSPanel {
    init(screen: NSScreen, model: OverlayModel) {
        super.init(
            contentRect: screen.frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = true
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        isReleasedWhenClosed = false
        contentView = NSHostingView(rootView: OverlayView(model: model))
        setFrame(screen.frame, display: false)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
