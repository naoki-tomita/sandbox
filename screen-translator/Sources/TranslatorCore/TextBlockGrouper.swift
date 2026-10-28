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

/// 上下に並んだ行を段落にまとめる。
/// 行ごとに翻訳すると文の途中で切れて訳が崩れるので、ゲームのセリフ枠のような
/// 複数行の文章は 1 つにまとめてから翻訳する。
public enum TextBlockGrouper {
    public static func group(_ lines: [TextLine]) -> [TextBlock] {
        let sorted = lines.sorted { $0.rect.minY < $1.rect.minY }
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

    /// `next` が `previous` の次の行として続いているか
    static func continues(_ previous: TextLine, with next: TextLine) -> Bool {
        let height = max(previous.rect.height, next.rect.height)
        guard height > 0 else { return false }

        // 文字の大きさがほぼ同じ
        let ratio = next.rect.height / previous.rect.height
        guard ratio > 0.7, ratio < 1.4 else { return false }

        // すぐ下の行にある
        let gap = next.rect.minY - previous.rect.maxY
        guard gap > -height * 0.5, gap < height * 0.8 else { return false }

        // 左端がそろっているか、横方向に重なっている
        let leftAligned = abs(next.rect.minX - previous.rect.minX) < height * 1.5
        let overlap = min(previous.rect.maxX, next.rect.maxX) - max(previous.rect.minX, next.rect.minX)
        let overlapping = overlap > min(previous.rect.width, next.rect.width) * 0.5
        return leftAligned || overlapping
    }

    /// 行末のハイフンで単語が分かれていたらつなげる
    static func joined(_ head: String, _ tail: String) -> String {
        if head.hasSuffix("-"), let last = head.dropLast().last, last.isLetter {
            return String(head.dropLast()) + tail
        }
        return head + " " + tail
    }
}
