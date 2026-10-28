import AppKit
import TranslatorCore

/// 発動キーの設定。UserDefaults に保存する
@MainActor
final class ShortcutSettings: ObservableObject {
    private static let defaultsKey = "shortcut"

    @Published private(set) var shortcut: Shortcut
    /// キーの入力を待っている間は、今のホットキーを外しておく
    @Published var isRecording = false

    /// ホットキーを登録し直す。登録できなければ false を返す
    var register: ((Shortcut) -> Bool)?

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.defaultsKey),
           let saved = try? JSONDecoder().decode(Shortcut.self, from: data) {
            shortcut = saved
        } else {
            shortcut = .default
        }
    }

    /// 新しいキーに変更する。登録に失敗したら元のキーに戻して false を返す
    func update(_ newValue: Shortcut) -> Bool {
        guard register?(newValue) ?? true else {
            _ = register?(shortcut)
            return false
        }
        shortcut = newValue
        if let data = try? JSONEncoder().encode(newValue) {
            UserDefaults.standard.set(data, forKey: Self.defaultsKey)
        }
        return true
    }
}

extension Shortcut.Modifiers {
    init(_ flags: NSEvent.ModifierFlags) {
        self = []
        if flags.contains(.command) { insert(.command) }
        if flags.contains(.shift) { insert(.shift) }
        if flags.contains(.option) { insert(.option) }
        if flags.contains(.control) { insert(.control) }
    }
}
