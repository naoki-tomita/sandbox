import XCTest
@testable import TranslatorCore

final class LRUCacheTests: XCTestCase {
    func testNeverExceedsCapacity() {
        var cache = LRUCache<Int, String>(capacity: 100)
        for i in 0..<1000 {
            cache.set("\(i)", for: i)
            XCTAssertLessThanOrEqual(cache.count, 100)
        }
    }

    func testEvictsLeastRecentlyUsedFirst() {
        var cache = LRUCache<String, String>(capacity: 10)
        for i in 0..<10 {
            cache.set("訳\(i)", for: "text\(i)")
        }
        // よく使う文
        XCTAssertEqual(cache.value(for: "text0"), "訳0")

        cache.set("訳10", for: "text10")

        XCTAssertEqual(cache.value(for: "text0"), "訳0")
        XCTAssertNil(cache.value(for: "text1"))
        XCTAssertEqual(cache.value(for: "text10"), "訳10")
    }

    func testOverwritingKeepsOneEntry() {
        var cache = LRUCache<String, String>(capacity: 10)
        cache.set("a", for: "key")
        cache.set("b", for: "key")
        XCTAssertEqual(cache.count, 1)
        XCTAssertEqual(cache.value(for: "key"), "b")
    }
}
