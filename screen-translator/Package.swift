// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ScreenTranslator",
    platforms: [.macOS(.v15)],
    targets: [
        // OCR 結果の行をまとめるなど、Apple のフレームワークに依存しない処理
        .target(name: "TranslatorCore"),
        .executableTarget(
            name: "ScreenTranslator",
            dependencies: ["TranslatorCore"]
        ),
        .testTarget(
            name: "TranslatorCoreTests",
            dependencies: ["TranslatorCore"]
        ),
    ],
    swiftLanguageModes: [.v5]
)
