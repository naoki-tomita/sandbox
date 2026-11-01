import CoreGraphics
import XCTest
@testable import TranslatorCore

final class TranslationPlannerTests: XCTestCase {
    private func block(_ text: String, x: CGFloat, y: CGFloat) -> TextBlock {
        TextBlock(text: text, rect: CGRect(x: x, y: y, width: 100, height: 20), lineHeight: 20, lineCount: 1)
    }

    func testOrdersTopToBottomThenLeftToRight() {
        let texts = TranslationPlanner.orderedTexts([
            block("Options", x: 0, y: 300),
            block("Right", x: 500, y: 100),
            block("Left", x: 0, y: 100),
        ])
        XCTAssertEqual(texts, ["Left", "Right", "Options"])
    }

    func testRemovesDuplicates() {
        let texts = TranslationPlanner.orderedTexts([
            block("Buy", x: 0, y: 100),
            block("Sword", x: 200, y: 100),
            block("Buy", x: 0, y: 200),
        ])
        XCTAssertEqual(texts, ["Buy", "Sword"])
    }

    func testDealsTextsRoundRobin() {
        let chunks = TranslationPlanner.chunks(["a", "b", "c", "d", "e"], count: 2)
        XCTAssertEqual(chunks, [["a", "c", "e"], ["b", "d"]])
    }

    func testNeverMakesMoreChunksThanTexts() {
        XCTAssertEqual(TranslationPlanner.chunks(["a", "b"], count: 4), [["a"], ["b"]])
        XCTAssertEqual(TranslationPlanner.chunks([], count: 4), [])
        XCTAssertEqual(TranslationPlanner.chunks(["a"], count: 0), [["a"]])
    }

    func testBatchesByCountAndCharacters() {
        XCTAssertEqual(
            TranslationPlanner.batches(["a", "b", "c"], maxCount: 2, maxCharacters: 100),
            [["a", "b"], ["c"]]
        )
        XCTAssertEqual(
            TranslationPlanner.batches(["aaaa", "bbbb", "cc"], maxCount: 10, maxCharacters: 6),
            [["aaaa"], ["bbbb", "cc"]]
        )
    }

    func testLongTextGetsItsOwnBatch() {
        XCTAssertEqual(
            TranslationPlanner.batches(["a", String(repeating: "x", count: 50), "b"], maxCount: 10, maxCharacters: 10),
            [["a"], [String(repeating: "x", count: 50)], ["b"]]
        )
    }

    func testNumberedList() {
        XCTAssertEqual(TranslationPlanner.numberedList(["Start Game", "Load\nGame"]), "1. Start Game\n2. Load Game")
    }
}

