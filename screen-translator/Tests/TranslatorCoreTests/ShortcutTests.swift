import Foundation
import XCTest
@testable import TranslatorCore

final class ShortcutTests: XCTestCase {
    func testDisplayStringUsesMenuOrder() {
        let shortcut = Shortcut(keyCode: 0x11, modifiers: [.command, .shift, .option, .control], keyLabel: "T")
        XCTAssertEqual(shortcut.displayString, "⌃⌥⇧⌘T")
        XCTAssertEqual(Shortcut.default.displayString, "⌃⌥T")
    }

    func testLetterNeedsModifier() {
        XCTAssertEqual(Shortcut.validate(keyCode: 0x11, modifiers: []), .needsModifier)
        XCTAssertEqual(Shortcut.validate(keyCode: 0x11, modifiers: [.shift]), .needsModifier)
        XCTAssertNil(Shortcut.validate(keyCode: 0x11, modifiers: [.option]))
    }

    func testFunctionKeyAloneIsAllowed() {
        XCTAssertNil(Shortcut.validate(keyCode: 0x60, modifiers: []))
        XCTAssertEqual(Shortcut.specialKeyLabel(for: 0x60), "F5")
    }

    func testEscapeIsReserved() {
        XCTAssertEqual(Shortcut.validate(keyCode: 0x35, modifiers: [.command]), .reserved)
    }

    func testRoundTripsThroughJSON() throws {
        let shortcut = Shortcut(keyCode: 0x31, modifiers: [.control, .shift], keyLabel: "Space")
        let decoded = try JSONDecoder().decode(Shortcut.self, from: JSONEncoder().encode(shortcut))
        XCTAssertEqual(decoded, shortcut)
    }
}
