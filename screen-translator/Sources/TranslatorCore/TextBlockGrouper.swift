import CoreGraphics

/// OCR で読み取った 1 行分のテキスト。座標は左上原点。
public struct TextLine: Equatable {
    public var text: String
    public var rect: CGRect

    public init(text: String, rect: CGRect) {
        self.text = text
        self.rect = rect
    }
}

/// 翻訳の単位になるテキストのまとまり (段落)。
public struct TextBlock: Equatable {
    public var text: String
    public var rect: CGRect
    /// 元のテキストの 1 行あたりの高さ。訳文のフォントサイズの目安にする
    public var lineHeight: CGFloat
    public var lineCount: Int

    public init(text: String, rect: CGRect, lineHeight: CGFloat, lineCount: Int) {
        self.text = text
        self.rect = rect
        self.lineHeight = lineHeight
        self.lineCount = lineCount
    }
}

/// OCR の行を、翻訳の単位になる段落にまとめる。
/// 行ごとに翻訳すると文の途中で切れて訳が崩れるので、ゲームのセリフ枠のような
/// 複数行の文章は 1 つにまとめてから翻訳する。一方でメニュー項目のような
/// 別々の短い文はまとめない。位置と文字の大きさに加えて、文の中身も手がかりにする。
public enum TextBlockGrouper {
    public static func group(_ lines: [TextLine]) -> [TextBlock] {
        let sorted = mergeSameRow(lines).sorted { $0.rect.minY < $1.rect.minY }
        var blocks: [TextBlock] = []
        // 各ブロックの最後の行
        var lastLines: [TextLine] = []

        for line in sorted {
            if let index = lastLines.indices.last(where: { continues(lastLines[$0], with: line) }) {
                var block = blocks[index]
                block.text = joined(block.text, line.text)
                block.rect = block.rect.union(line.rect)
                block.lineHeight = (block.lineHeight * CGFloat(block.lineCount) + line.rect.height)
                    / CGFloat(block.lineCount + 1)
                block.lineCount += 1
                blocks[index] = block
                lastLines[index] = line
            } else {
                blocks.append(TextBlock(text: line.text, rect: line.rect, lineHeight: line.rect.height, lineCount: 1))
                lastLines.append(line)
            }
        }
        return blocks
    }

    // MARK: - 同じ行の断片

    /// OCR が 1 行を横に分けて返すことがあるので、同じ高さで横に近い断片を 1 行に戻す
    static func mergeSameRow(_ lines: [TextLine]) -> [TextLine] {
        var result: [TextLine] = []
        for line in lines.sorted(by: { $0.rect.minX < $1.rect.minX }) {
            if let index = result.firstIndex(where: { isSameRow($0, line) }) {
                result[index] = TextLine(
                    text: result[index].text + " " + line.text,
                    rect: result[index].rect.union(line.rect)
                )
            } else {
                result.append(line)
            }
        }
        return result
    }

    static func isSameRow(_ left: TextLine, _ right: TextLine) -> Bool {
        let height = min(left.rect.height, right.rect.height)
        guard height > 0, heightsMatch(left, right, limit: 1.4) else { return false }

        let verticalOverlap = min(left.rect.maxY, right.rect.maxY) - max(left.rect.minY, right.rect.minY)
        guard verticalOverlap > height * 0.6 else { return false }

        // 単語の間隔より少し広いくらいまで。離れた別の項目 (HP と MP など) はつなげない
        let gap = right.rect.minX - left.rect.maxX
        return gap > -height * 0.5 && gap < height * 1.0
    }

    // MARK: - 上下の行

    /// `next` が `previous` の次の行として続いているか
    static func continues(_ previous: TextLine, with next: TextLine) -> Bool {
        let height = max(previous.rect.height, next.rect.height)
        guard height > 0 else { return false }

        // 左端がそろっているか、横方向に重なっている
        let leftAligned = abs(next.rect.minX - previous.rect.minX) < height * 1.5
        let overlap = min(previous.rect.maxX, next.rect.maxX) - max(previous.rect.minX, next.rect.minX)
        let overlapping = overlap > min(previous.rect.width, next.rect.width) * 0.5
        guard leftAligned || overlapping else { return false }

        // OCR の行の箱は文字の形で高さが変わる ("women." は上下に伸びる文字がなく低い) ので、
        // 行間は箱の端ではなく行の中心どうしの距離で測る
        let pitch = next.rect.midY - previous.rect.midY
        guard pitch > height * 0.5 else { return false }

        // 全部大文字の見出し ("A CREST ON A NECKLACE") と、その下の普通の文は別の段落
        if isAllCaps(previous.text) != isAllCaps(next.text) { return false }

        // 文の途中で改行されているのが明らかなら、行間が広め・文字の大きさが少しぶれていてもつなげる
        if isMidSentence(previous.text, next.text) {
            return pitch < height * 2.3 && heightsMatch(previous, next, limit: 1.6)
        }

        guard pitch < height * 1.8, heightsMatch(previous, next, limit: 1.4) else { return false }
        // メニューや一覧の項目が縦に並んでいるだけならつなげない
        return !looksLikeListItems(previous.text, next.text)
    }

    /// 前の行で文が終わっておらず、次の行がその続きに見える
    static func isMidSentence(_ previous: String, _ next: String) -> Bool {
        guard let last = previous.trimmingTrailingSpaces.last,
              let first = next.first(where: { !$0.isWhitespace })
        else { return false }

        if continuationEndings.contains(last) { return true }
        if endsWithFunctionWord(previous) { return true }
        // 文末の記号がなく、次の行が小文字で始まる
        return !sentenceEndings.contains(last) && first.isLowercase
    }

    /// 縦に並んだメニュー項目のような、別々の短い文に見える
    static func looksLikeListItems(_ previous: String, _ next: String) -> Bool {
        guard let last = previous.trimmingTrailingSpaces.last,
              let first = next.first(where: { !$0.isWhitespace })
        else { return false }

        let wordCount = { (text: String) in text.split(separator: " ").count }
        guard !sentenceEndings.contains(last), !continuationEndings.contains(last),
              first.isUppercase || first.isNumber
        else { return false }
        // "Start Game" / "Options" のように、記号で終わらない短い行の次が大文字や数字で始まる。
        // 1 語だけの行 (セリフの上の話者名や見出し) の次も別の文とみなす
        return (wordCount(previous) <= 3 && wordCount(next) <= 3) || wordCount(previous) == 1
    }

    /// 小文字を含まず、大文字が 2 文字以上ある (見出しやタイトルによくある書き方)
    static func isAllCaps(_ text: String) -> Bool {
        let letters = text.filter(\.isLetter)
        return letters.count >= 2 && !letters.contains(where: \.isLowercase)
    }

    // MARK: - 文字列

    /// 行末のハイフンで単語が分かれていたらつなげる
    static func joined(_ head: String, _ tail: String) -> String {
        if head.hasSuffix("-"), let last = head.dropLast().last, last.isLetter {
            return String(head.dropLast()) + tail
        }
        return head + " " + tail
    }

    private static let sentenceEndings: Set<Character> = [".", "!", "?", "。", "…", "\"", "”", "'", "’", ")", "]"]
    private static let continuationEndings: Set<Character> = [",", "-", "—", "–", ";", ":"]

    /// 行末にあれば、まず間違いなく文が続く単語
    private static let functionWords: Set<String> = [
        "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "from",
        "by", "as", "that", "which", "who", "is", "are", "was", "were", "be", "your", "my", "our",
        "their", "his", "her", "its", "this", "these", "if", "when", "than", "into",
    ]

    private static func endsWithFunctionWord(_ text: String) -> Bool {
        guard let word = text.split(separator: " ").last else { return false }
        return functionWords.contains(word.lowercased())
    }

    /// 文字の大きさが同じくらいか。背の低い文字 (a, c, e, m, n, o など) だけの行は
    /// 箱が低く出るので、そのぶん差を大目に見る
    static func heightsMatch(_ a: TextLine, _ b: TextLine, limit: CGFloat) -> Bool {
        let (short, tall) = a.rect.height < b.rect.height ? (a, b) : (b, a)
        guard short.rect.height > 0 else { return false }
        let ratio = tall.rect.height / short.rect.height
        return ratio < (hasTallGlyphs(short.text) ? limit : limit * 1.6)
    }

    /// 大文字・数字や、上下に伸びる小文字 (b, d, g, p など) を含むか
    static func hasTallGlyphs(_ text: String) -> Bool {
        text.contains { $0.isUppercase || $0.isNumber || tallLowercase.contains($0) }
    }

    private static let tallLowercase: Set<Character> = Set("bdfhijklpqtyg")
}

private extension String {
    var trimmingTrailingSpaces: Substring {
        var result = self[...]
        while let last = result.last, last.isWhitespace { result = result.dropLast() }
        return result
    }
}
