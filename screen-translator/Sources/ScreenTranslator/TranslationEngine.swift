import Foundation
import TranslatorCore
#if canImport(FoundationModels)
import FoundationModels
#endif

/// どの仕組みで翻訳するか
enum TranslationEngine: String, CaseIterable, Identifiable {
    /// Translation フレームワーク。速いが直訳調になりやすい
    case standard
    /// Apple Intelligence の端末内言語モデル。遅いが、ゲームの文脈を踏まえた自然な訳になる
    case appleIntelligence
    /// PLaMo 3 Translate。翻訳専用モデルなので訳が自然。同じ Mac で翻訳サーバーを起動しておく必要がある
    case plamo

    static let defaultsKey = "translation.engine"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .standard: "標準 (速い)"
        case .appleIntelligence: "Apple Intelligence (自然な訳)"
        case .plamo: "PLaMo 3 Translate (翻訳サーバーが必要)"
        }
    }

    /// 設定で選ばれているエンジン (初期値は Apple Intelligence)。Apple Intelligence が使えなければ標準にする
    static var current: TranslationEngine {
        let selected = UserDefaults.standard.string(forKey: defaultsKey).flatMap(TranslationEngine.init) ?? .appleIntelligence
        if selected == .appleIntelligence, LanguageModelTranslator.unavailableReason != nil { return .standard }
        return selected
    }
}

/// Apple Intelligence の端末内言語モデルで、画面の文をまとめて翻訳する
enum LanguageModelTranslator {
    /// 一度に渡す量。端末内モデルの文脈長 (約 4,000 トークン) に収まるようにする
    static let maxBatchCount = 12
    static let maxBatchCharacters = 1200

    static let instructions = """
        You are a professional localizer who translates English video games into Japanese.
        Translate each numbered line of on-screen game text into natural Japanese, \
        as it would appear in a commercially localized Japanese game.
        - Lines come from the same screen, so keep terms and tone consistent between them.
        - Write dialogue as natural spoken Japanese that fits the speaker, not a literal translation.
        - Keep menu items, buttons and labels short, like real Japanese game UI (for example "Start Game" → "ゲームスタート", "Options" → "オプション").
        - Write character names and place names in katakana.
        - Keep numbers, symbols and button names such as "A" or "Enter" as they are.
        - Do not add explanations or notes.
        Return exactly one translation per line, in the same order.
        """

    /// 使えないときの理由。使えるなら nil
    static var unavailableReason: String? {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return nil
            case .unavailable(.deviceNotEligible):
                return "この Mac は Apple Intelligence に対応していません"
            case .unavailable(.appleIntelligenceNotEnabled):
                return "システム設定で Apple Intelligence をオンにしてください"
            case .unavailable(.modelNotReady):
                return "Apple Intelligence のモデルを準備中です。しばらく待ってください"
            case .unavailable:
                return "Apple Intelligence が使えません"
            }
        }
        #endif
        return "macOS 26 以降で使えます"
    }

    /// `texts` と同じ順番の訳を返す。件数が合わないなど、うまく訳せなければエラーにする
    static func translate(_ texts: [String]) async throws -> [String] {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            // 前の画面の内容に引きずられないよう、毎回新しいセッションにする
            // ゲームの戦闘シーンなどの文も訳せるよう、文の変換向けの緩いガードレールを使う
            let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
            let session = LanguageModelSession(model: model, instructions: instructions)
            let response = try await session.respond(
                to: TranslationPlanner.numberedList(texts),
                generating: GameTextTranslations.self,
                options: GenerationOptions(temperature: 0.3)
            )
            let translations = response.content.translations
            guard translations.count == texts.count else { throw TranslatorError.countMismatch }
            return translations
        }
        #endif
        throw TranslatorError.unavailable
    }

    enum TranslatorError: Error {
        case unavailable
        case countMismatch
    }
}

#if canImport(FoundationModels)
@available(macOS 26.0, *)
@Generable
struct GameTextTranslations {
    @Guide(description: "Japanese translations, one for each numbered input line, in the same order")
    var translations: [String]
}
#endif
