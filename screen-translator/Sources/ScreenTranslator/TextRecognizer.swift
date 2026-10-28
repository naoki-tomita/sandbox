import CoreGraphics
import TranslatorCore
import Vision

/// Vision で画像から英語のテキストを読み取る (オンデバイスで動作)
enum TextRecognizer {
    /// - Parameter size: 結果の座標系にする大きさ (画面のポイント数)。左上原点で返す
    static func recognize(in image: CGImage, size: CGSize) async throws -> [TextLine] {
        try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            request.usesLanguageCorrection = true

            try VNImageRequestHandler(cgImage: image).perform([request])

            return (request.results ?? []).compactMap { observation -> TextLine? in
                guard let candidate = observation.topCandidates(1).first,
                      candidate.confidence >= 0.3,
                      candidate.string.contains(where: { $0.isASCII && $0.isLetter })
                else { return nil }

                // Vision は左下原点・0〜1 の正規化座標
                let box = observation.boundingBox
                let rect = CGRect(
                    x: box.minX * size.width,
                    y: (1 - box.maxY) * size.height,
                    width: box.width * size.width,
                    height: box.height * size.height
                )
                return TextLine(text: candidate.string, rect: rect)
            }
        }.value
    }
}
