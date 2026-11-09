import Foundation

/// Preferred Networks の翻訳モデル PLaMo 3 Translate で翻訳する。
/// モデルは独自のコードを Python (MLX) で動かす必要があるので、アプリには組み込まず、
/// 同じ Mac で起動した翻訳サーバー (scripts/plamo-server.sh) に頼む
enum PlamoTranslator {
    static let serverURLKey = "plamo.serverURL"
    static let defaultServerURL = "http://127.0.0.1:8000"
    /// 同時に頼む数。サーバー (serve.py) は 4 件まで同時に訳せる
    static let concurrency = 4
    /// 訳の参考として一緒に渡す、同じ画面のほかの文の量
    static let maxContextCharacters = 1500

    static var serverURL: String {
        let saved = UserDefaults.standard.string(forKey: serverURLKey) ?? ""
        return saved.isEmpty ? defaultServerURL : saved
    }

    enum TranslatorError: LocalizedError {
        case invalidURL
        case badResponse(String)

        var errorDescription: String? {
            switch self {
            case .invalidURL: "サーバーの URL が正しくありません"
            case let .badResponse(message): "翻訳サーバーの応答が正しくありません: \(message)"
            }
        }
    }

    /// `text` を日本語に訳す。`context` には同じ画面のほかの文を渡すと、用語や文脈をそろえてくれる
    static func translate(_ text: String, context: String? = nil) async throws -> String {
        guard let url = URL(string: serverURL)?.appending(path: "v1/chat/completions") else {
            throw TranslatorError.invalidURL
        }

        var options: [String: Any] = ["source_lang": "en", "target_lang": "ja"]
        if let context, !context.isEmpty { options["context"] = context }
        // mlx-lm のサーバーは "model" を書くとそのモデルを読み込みに行くので、送らない
        let body: [String: Any] = [
            "messages": [["role": "user", "content": text]],
            "temperature": 0,
            "max_tokens": 512,
            "chat_template_kwargs": options,
        ]

        var request = URLRequest(url: url, timeoutInterval: 60)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status) else {
            throw TranslatorError.badResponse(String(decoding: data.prefix(200), as: UTF8.self))
        }
        let decoded = try JSONDecoder().decode(ChatCompletion.self, from: data)
        guard let content = decoded.choices.first?.message.content else {
            throw TranslatorError.badResponse("訳文がありません")
        }
        return content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// サーバーにつながらない (起動していない) ときのエラーか
    static func isConnectionError(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        return [.cannotConnectToHost, .cannotFindHost, .networkConnectionLost, .timedOut].contains(urlError.code)
    }

    /// 同じ画面のほかの文を、訳の参考として渡せる長さにまとめる
    static func context(for text: String, among texts: [String]) -> String {
        var result = ""
        for other in texts where other != text {
            guard result.count + other.count + 1 <= maxContextCharacters else { break }
            result += (result.isEmpty ? "" : "\n") + other
        }
        return result
    }

    private struct ChatCompletion: Decodable {
        struct Choice: Decodable {
            struct Message: Decodable {
                let content: String?
            }
            let message: Message
        }
        let choices: [Choice]
    }
}
