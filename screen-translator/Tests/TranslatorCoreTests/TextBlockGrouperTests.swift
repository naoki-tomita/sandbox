import CoreGraphics
import XCTest
@testable import TranslatorCore

final class TextBlockGrouperTests: XCTestCase {
    func testMergesConsecutiveLinesIntoOneBlock() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "The ancient door will not", rect: CGRect(x: 100, y: 500, width: 300, height: 20)),
            TextLine(text: "open without the key.", rect: CGRect(x: 100, y: 526, width: 250, height: 20)),
        ])

        XCTAssertEqual(blocks.count, 1)
        XCTAssertEqual(blocks[0].text, "The ancient door will not open without the key.")
        XCTAssertEqual(blocks[0].rect, CGRect(x: 100, y: 500, width: 300, height: 46))
        XCTAssertEqual(blocks[0].lineCount, 2)
    }

    func testKeepsDistantTextSeparate() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "HP 120/120", rect: CGRect(x: 20, y: 20, width: 120, height: 18)),
            TextLine(text: "Start Game", rect: CGRect(x: 400, y: 300, width: 160, height: 30)),
            TextLine(text: "Options", rect: CGRect(x: 400, y: 420, width: 120, height: 30)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["HP 120/120", "Start Game", "Options"])
    }

    func testDoesNotMergeDifferentFontSizes() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "CHAPTER ONE", rect: CGRect(x: 100, y: 100, width: 400, height: 48)),
            TextLine(text: "In which our hero wakes up.", rect: CGRect(x: 100, y: 152, width: 300, height: 20)),
        ])

        XCTAssertEqual(blocks.count, 2)
    }

    func testMergesCenteredLines() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "You have found", rect: CGRect(x: 420, y: 300, width: 160, height: 20)),
            TextLine(text: "a mysterious amulet", rect: CGRect(x: 400, y: 324, width: 200, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["You have found a mysterious amulet"])
    }

    func testJoinsHyphenatedWords() {
        XCTAssertEqual(TextBlockGrouper.joined("extra-", "ordinary"), "extraordinary")
        XCTAssertEqual(TextBlockGrouper.joined("HP -", "10"), "HP - 10")
    }
}
