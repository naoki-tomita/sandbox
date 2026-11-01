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

    func testKeepsMenuItemsSeparate() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "New Game", rect: CGRect(x: 100, y: 300, width: 120, height: 20)),
            TextLine(text: "Load Game", rect: CGRect(x: 100, y: 326, width: 130, height: 20)),
            TextLine(text: "Options", rect: CGRect(x: 100, y: 352, width: 100, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["New Game", "Load Game", "Options"])
    }

    func testKeepsSpeakerNameSeparateFromDialogue() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "Aria", rect: CGRect(x: 100, y: 500, width: 60, height: 20)),
            TextLine(text: "Have you seen my brother anywhere?", rect: CGRect(x: 100, y: 526, width: 400, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["Aria", "Have you seen my brother anywhere?"])
    }

    func testMergesSentencesInTheSameDialogueBox() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "Hello there, traveler.", rect: CGRect(x: 100, y: 500, width: 250, height: 20)),
            TextLine(text: "What brings you to our village?", rect: CGRect(x: 100, y: 526, width: 350, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["Hello there, traveler. What brings you to our village?"])
    }

    func testMergesAcrossWideLineSpacingWhenSentenceContinues() {
        // 行間が文字の高さと同じくらい空いていても、"the" で終わっていれば続きとみなす
        let blocks = TextBlockGrouper.group([
            TextLine(text: "You must bring the", rect: CGRect(x: 100, y: 500, width: 200, height: 20)),
            TextLine(text: "Crystal of Light to the temple.", rect: CGRect(x: 100, y: 540, width: 320, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["You must bring the Crystal of Light to the temple."])
    }

    func testKeepsAllCapsHeadingSeparateFromBody() {
        // アイテム説明の画面: 見出しと本文が同じくらいの大きさで、すぐ下に続く
        let blocks = TextBlockGrouper.group([
            TextLine(text: "A CREST ON A NECKLACE", rect: CGRect(x: 60, y: 65, width: 540, height: 36)),
            TextLine(text: "An elaborate crest,", rect: CGRect(x: 90, y: 125, width: 380, height: 40)),
            TextLine(text: "worn with pride. I", rect: CGRect(x: 90, y: 175, width: 380, height: 40)),
            TextLine(text: "don't recognise the", rect: CGRect(x: 90, y: 225, width: 400, height: 40)),
            TextLine(text: "symbol itself, however.", rect: CGRect(x: 90, y: 275, width: 480, height: 40)),
        ])

        XCTAssertEqual(blocks.map(\.text), [
            "A CREST ON A NECKLACE",
            "An elaborate crest, worn with pride. I don't recognise the symbol itself, however.",
        ])
    }

    func testMergesLastLineWithoutTallLetters() {
        // "women." には上下に伸びる文字がなく、OCR の箱が上の行の半分くらいの高さになる
        let blocks = TextBlockGrouper.group([
            TextLine(text: "COSTUME JEWELLERY", rect: CGRect(x: 65, y: 40, width: 480, height: 40)),
            TextLine(text: "An array of jewellery,", rect: CGRect(x: 65, y: 105, width: 430, height: 46)),
            TextLine(text: "the sort worn by", rect: CGRect(x: 65, y: 160, width: 330, height: 44)),
            TextLine(text: "spiritualists and show-", rect: CGRect(x: 65, y: 210, width: 480, height: 46)),
            TextLine(text: "women.", rect: CGRect(x: 65, y: 272, width: 130, height: 22)),
        ])

        XCTAssertEqual(blocks.map(\.text), [
            "COSTUME JEWELLERY",
            "An array of jewellery, the sort worn by spiritualists and showwomen.",
        ])
    }

    func testMergesShortLastLineOfDialogue() {
        // "arts..." は背の低い文字 (と少しだけ出っ張る t) だけで、箱が上の行の半分強の高さになる
        let blocks = TextBlockGrouper.group([
            TextLine(text: "There's quite the turnout at", rect: CGRect(x: 65, y: 40, width: 680, height: 62)),
            TextLine(text: "this event. Any number of", rect: CGRect(x: 65, y: 125, width: 650, height: 60)),
            TextLine(text: "people skilled in the magical", rect: CGRect(x: 65, y: 205, width: 715, height: 62)),
            TextLine(text: "arts...", rect: CGRect(x: 65, y: 305, width: 140, height: 34)),
        ])

        XCTAssertEqual(blocks.map(\.text), [
            "There's quite the turnout at this event. Any number of people skilled in the magical arts...",
        ])
    }

    func testMergesMultiLineAllCapsText() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "YOU HAVE BEEN WARNED. TURN BACK", rect: CGRect(x: 100, y: 100, width: 500, height: 30)),
            TextLine(text: "BEFORE IT IS TOO LATE.", rect: CGRect(x: 100, y: 136, width: 360, height: 30)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["YOU HAVE BEEN WARNED. TURN BACK BEFORE IT IS TOO LATE."])
    }

    func testMergesFragmentsOfTheSameRow() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "the bridge.", rect: CGRect(x: 312, y: 501, width: 110, height: 19)),
            TextLine(text: "Meet me at", rect: CGRect(x: 200, y: 500, width: 100, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["Meet me at the bridge."])
    }

    func testKeepsDistantItemsOnTheSameRowSeparate() {
        let blocks = TextBlockGrouper.group([
            TextLine(text: "HP 120", rect: CGRect(x: 20, y: 20, width: 80, height: 20)),
            TextLine(text: "MP 45", rect: CGRect(x: 200, y: 20, width: 70, height: 20)),
        ])

        XCTAssertEqual(blocks.map(\.text), ["HP 120", "MP 45"])
    }

    func testJoinsHyphenatedWords() {
        XCTAssertEqual(TextBlockGrouper.joined("extra-", "ordinary"), "extraordinary")
        XCTAssertEqual(TextBlockGrouper.joined("HP -", "10"), "HP - 10")
    }
}
