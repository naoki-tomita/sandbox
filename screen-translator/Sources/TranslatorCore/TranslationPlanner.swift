/// 翻訳する文の順番と、並列に翻訳するときの分け方を決める
public enum TranslationPlanner {
    /// 重複を除き、画面の上から (同じ高さなら左から) 読む順に並べた文
    public static func orderedTexts(_ blocks: [TextBlock]) -> [String] {
        let sorted = blocks.sorted {
            $0.rect.minY != $1.rect.minY ? $0.rect.minY < $1.rect.minY : $0.rect.minX < $1.rect.minX
        }
        var seen = Set<String>()
        return sorted.map(\.text).filter { seen.insert($0).inserted }
    }

    /// `count` 個に分ける。どの組も画面の上の方から訳されるよう、順番に 1 つずつ配る
    public static func chunks(_ texts: [String], count: Int) -> [[String]] {
        let count = max(1, min(count, texts.count))
        var result = Array(repeating: [String](), count: count)
        for (index, text) in texts.enumerated() {
            result[index % count].append(text)
        }
        return result.filter { !$0.isEmpty }
    }
}
