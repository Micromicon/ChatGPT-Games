// swift-tools-version: 5.9
import PackageDescription

#if os(Linux)
let dependencies: [Package.Dependency] = [.package(url: "https://github.com/apple/swift-crypto.git", exact: "3.12.3")]
let cryptoDependencies: [Target.Dependency] = [.product(name: "Crypto", package: "swift-crypto")]
#else
let dependencies: [Package.Dependency] = []
let cryptoDependencies: [Target.Dependency] = []
#endif

let package = Package(
    name: "MicroChatCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "MicroChatCore", targets: ["MicroChatCore"])],
    dependencies: dependencies,
    targets: [
        .target(name: "MicroChatCore", dependencies: cryptoDependencies, path: "Core"),
        .testTarget(name: "MicroChatCoreTests", dependencies: ["MicroChatCore"],
                    path: "Tests", resources: [.copy("Fixtures")])
    ]
)
