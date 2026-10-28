import Foundation

/// 自動翻訳 (一定間隔で画面を読み直して訳を更新する) の設定
enum WatchSettings {
    static let enabledKey = "watch.enabled"
    static let intervalKey = "watch.interval"

    static let defaultInterval: Double = 2
    /// 設定画面で選べる間隔 (秒)
    static let intervals: [Double] = [1, 2, 3, 5, 10]

    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    static var interval: Double {
        let value = UserDefaults.standard.double(forKey: intervalKey)
        return value > 0 ? value : defaultInterval
    }
}
