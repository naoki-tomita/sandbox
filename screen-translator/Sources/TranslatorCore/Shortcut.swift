/// 翻訳を発動するキーの組み合わせ
public struct Shortcut: Codable, Equatable {
    /// Carbon の修飾キーフラグ (cmdKey などと同じ値)
    public struct Modifiers: OptionSet, Codable, Hashable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }

        public static let command = Modifiers(rawValue: 0x0100)
        public static let shift = Modifiers(rawValue: 0x0200)
        public static let option = Modifiers(rawValue: 0x0800)
        public static let control = Modifiers(rawValue: 0x1000)
    }

    public enum ValidationError: Error, Equatable {
        /// Esc はオーバーレイを閉じるのに使う
        case reserved
        /// 文字キー単体 (や Shift だけ) だと、普段の入力やゲームの操作とぶつかる
        case needsModifier
    }

    /// 仮想キーコード (kVK_ANSI_T など)
    public var keyCode: Int
    public var modifiers: Modifiers
    /// 表示用のキー名 ("T"、"F5" など)
    public var keyLabel: String

    public init(keyCode: Int, modifiers: Modifiers, keyLabel: String) {
        self.keyCode = keyCode
        self.modifiers = modifiers
        self.keyLabel = keyLabel
    }

    /// ⌃⌥T
    public static let `default` = Shortcut(keyCode: 0x11, modifiers: [.control, .option], keyLabel: "T")

    /// "⌃⌥⇧⌘T" のような表記。並び順は macOS のメニューと同じ
    public var displayString: String {
        var result = ""
        if modifiers.contains(.control) { result += "⌃" }
        if modifiers.contains(.option) { result += "⌥" }
        if modifiers.contains(.shift) { result += "⇧" }
        if modifiers.contains(.command) { result += "⌘" }
        return result + keyLabel
    }

    public static func validate(keyCode: Int, modifiers: Modifiers) -> ValidationError? {
        if keyCode == escapeKeyCode { return .reserved }
        if functionKeyLabels[keyCode] != nil { return nil }
        if modifiers.isDisjoint(with: [.command, .option, .control]) { return .needsModifier }
        return nil
    }

    /// 文字以外のキーの表示名。文字キーは nil (入力された文字を使う)
    public static func specialKeyLabel(for keyCode: Int) -> String? {
        functionKeyLabels[keyCode] ?? otherKeyLabels[keyCode]
    }

    static let escapeKeyCode = 0x35

    static let functionKeyLabels: [Int: String] = [
        0x7A: "F1", 0x78: "F2", 0x63: "F3", 0x76: "F4", 0x60: "F5",
        0x61: "F6", 0x62: "F7", 0x64: "F8", 0x65: "F9", 0x6D: "F10",
        0x67: "F11", 0x6F: "F12", 0x69: "F13", 0x6B: "F14", 0x71: "F15",
        0x6A: "F16", 0x40: "F17", 0x4F: "F18", 0x50: "F19", 0x5A: "F20",
    ]

    static let otherKeyLabels: [Int: String] = [
        0x31: "Space", 0x24: "↩", 0x30: "⇥", 0x33: "⌫", 0x75: "⌦",
        0x7B: "←", 0x7C: "→", 0x7D: "↓", 0x7E: "↑",
        0x73: "↖", 0x77: "↘", 0x74: "⇞", 0x79: "⇟",
    ]
}
