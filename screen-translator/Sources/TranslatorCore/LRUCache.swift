/// 件数に上限のあるキャッシュ。上限を超えたら、しばらく使われていないものから捨てる
public struct LRUCache<Key: Hashable, Value> {
    public let capacity: Int

    private var entries: [Key: (value: Value, lastUsed: UInt64)] = [:]
    private var clock: UInt64 = 0

    public init(capacity: Int) {
        self.capacity = max(1, capacity)
    }

    public var count: Int { entries.count }

    /// 値を取り出す。取り出したものは「最近使った」扱いになる
    public mutating func value(for key: Key) -> Value? {
        guard let entry = entries[key] else { return nil }
        clock += 1
        entries[key] = (entry.value, clock)
        return entry.value
    }

    public mutating func set(_ value: Value, for key: Key) {
        clock += 1
        entries[key] = (value, clock)
        if entries.count > capacity { evict() }
    }

    /// 上限を超えたら、古い方から 1 割をまとめて捨てる (毎回並べ替えなくて済むように)
    private mutating func evict() {
        let removeCount = max(entries.count - capacity, capacity / 10)
        let oldest = entries.sorted { $0.value.lastUsed < $1.value.lastUsed }.prefix(removeCount)
        for (key, _) in oldest {
            entries[key] = nil
        }
    }
}
