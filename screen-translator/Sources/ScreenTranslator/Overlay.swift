import AppKit
import OSLog
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

/// 一度訳した文を覚えておく。オーバーレイを閉じても残るので、
/// 同じメニューや HUD を何度翻訳してもすぐ表示できる
@MainActor
final class TranslationCache {
    static let shared = TranslationCache()
    private static let limit = 5000

    private var translations: [String: String] = [:]

    subscript(source: String) -> String? {
        get { translations[source] }
        set {
            if translations.count >= Self.limit { translations.removeAll() }
            translations[source] = newValue
        }
    }
}

@MainActor
final class OverlayModel: ObservableObject {
    enum Phase: Equatable {
        case translating
        case done
        case failed(String)
    }

    /// 同時に翻訳するセッションの数 (macOS 26 以降)
    private static let parallelism = 4
    private static let logger = Logger(subsystem: "com.github.naoki-tomita.screen-translator", category: "translation")

    @Published var phase: Phase = .done
    @Published var blocks: [TranslatedBlock] = []
    /// これが設定 (または invalidate) されると OverlayView の translationTask が走る
    @Published var configuration: TranslationSession.Configuration?
    /// 定期的に画面を読み直しているか
    let isWatching: Bool

    private let cache = TranslationCache.shared
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
        let texts = TranslationPlanner.orderedTexts(blocks.filter { $0.translation == nil }.map(\.source))
        guard !texts.isEmpty else { return }

        let clock = ContinuousClock()
        let start = clock.now
        do {
            try await translateInParallel(texts, primary: session)
            if !blocks.contains(where: { $0.translation == nil }) { phase = .done }
            let elapsed = clock.now - start
            Self.logger.info("\(texts.count) 件を \(String(describing: elapsed), privacy: .public) で翻訳しました")
        } catch is CancellationError {
            // 読み直しで次の翻訳が始まった
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    /// 文をいくつかの組に分け、組ごとに別のセッションで同時に翻訳する。
    /// macOS 26 より前はセッションを自分で作れないので、1 つのセッションで順に訳す
    private func translateInParallel(_ texts: [String], primary: TranslationSession) async throws {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *), texts.count > 1 {
            let chunks = TranslationPlanner.chunks(texts, count: Self.parallelism)
            try await withThrowingTaskGroup(of: Void.self) { group in
                for (index, chunk) in chunks.enumerated() {
                    let session = index == 0
                        ? primary
                        : TranslationSession(installedSource: Languages.source, target: Languages.target)
                    group.addTask { try await self.translate(chunk, with: session) }
                }
                try await group.waitForAll()
            }
            return
        }
        #endif
        try await translate(texts, with: primary)
    }

    private func translate(_ texts: [String], with session: TranslationSession) async throws {
        let requests = texts.enumerated().map {
            TranslationSession.Request(sourceText: $0.element, clientIdentifier: String($0.offset))
        }
        // 訳せた文から順に表示する
        for try await response in session.translate(batch: requests) {
            guard let index = response.clientIdentifier.flatMap(Int.init), texts.indices.contains(index)
            else { continue }
            let source = texts[index]
            cache[source] = response.targetText
            for i in blocks.indices where blocks[i].translation == nil && blocks[i].source.text == source {
                blocks[i].translation = response.targetText
            }
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
