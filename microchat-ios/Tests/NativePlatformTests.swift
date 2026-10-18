#if canImport(MicroChat)
import XCTest
import Security
import SwiftUI
import UIKit
@testable import MicroChat

/// Actual iOS APIs; each test owns a unique file directory and Keychain service.
final class NativePlatformTests: XCTestCase {
    final class Fixture {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MicroChatTest-" + UUID().uuidString, isDirectory: true)
        let service = "com.microchat.test." + UUID().uuidString
        var file: URL { directory.appendingPathComponent("vault-v1.aesgcm") }
        var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service, kSecAttrAccount as String: "device-master"] }
        func vault() throws -> DeviceVault {
            do { return try DeviceVault(directory: directory, keychainService: service) }
            catch {
                // Test-only diagnostics distinguish missing signing entitlements from vault failures.
                let readStatus = SecItemCopyMatching(query as CFDictionary, nil)
                var probe = query; probe[kSecAttrService as String] = service + ".diagnostic"
                var insertion = probe
                insertion[kSecValueData as String] = Data(repeating: 0, count: 32)
                insertion[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                let insertStatus = SecItemAdd(insertion as CFDictionary, nil)
                if insertStatus == errSecSuccess { SecItemDelete(probe as CFDictionary) }
                print("Test vault error: \(error); Keychain read=\(readStatus), insert=\(insertStatus)")
                throw error
            }
        }
        deinit {
            SecItemDelete(query as CFDictionary)
            try? FileManager.default.removeItem(at: directory)
        }
    }

    func testVaultRoundTripAndTamperingFailsClosed() throws {
        let fixture = Fixture()
        let vault = try fixture.vault()
        var state = try vault.load()
        let bundle = try WireCrypto(identity: state.identity).publicBundle()
        state.owner = "Проверка хранилища"
        let privateText = "Текст, который нельзя хранить открыто: секретная заметка 12345"
        state.append(ChatMessage(id: UUID().uuidString, chatID: "saved", text: privateText, created: 1000, outgoing: true))
        try vault.save(state)
        let restored = try fixture.vault().load()
        XCTAssertEqual(restored.owner, state.owner)
        XCTAssertEqual(restored.messages.first?.text, privateText)
        XCTAssertEqual(try WireCrypto(identity: restored.identity).publicBundle(), bundle)
        let encrypted = try Data(contentsOf: fixture.file)
        XCTAssertNil(encrypted.range(of: Data(privateText.utf8)))
        var corrupted = encrypted; corrupted[corrupted.count - 1] ^= 1
        try corrupted.write(to: fixture.file)
        XCTAssertThrowsError(try fixture.vault().load())
        XCTAssertEqual(try Data(contentsOf: fixture.file), corrupted, "Corruption must not reset the user's identity")
    }

    func testMissingMasterKeyDoesNotReplaceExistingData() throws {
        let fixture = Fixture()
        _ = try fixture.vault().load()
        let encrypted = try Data(contentsOf: fixture.file)
        XCTAssertEqual(SecItemDelete(fixture.query as CFDictionary), errSecSuccess)
        XCTAssertThrowsError(try fixture.vault())
        XCTAssertEqual(try Data(contentsOf: fixture.file), encrypted)
        var query = fixture.query; query[kSecReturnData as String] = true
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, nil), errSecItemNotFound)
    }

    @MainActor
    func testNativeHomeSnapshots() async throws {
        let fixture = Fixture()
        let vault = try fixture.vault()
        var state = try vault.load()
        state.owner = "Тестовый профиль"
        let keys = try WireCrypto(identity: Identity()).publicBundle()
        for (index, name, text) in [(1, "Аня", "Буду через 10 минут"), (2, "Максим", "Отлично, договорились"), (3, "Катя", "Спасибо за сообщение!")] {
            let uid = "PreviewContact00\(index)"
            state.peers[uid] = Peer(id: uid, name: name, keys: keys)
            state.append(ChatMessage(id: UUID().uuidString, chatID: uid, text: text, created: Wire.now() - Int64(index * 60_000), outgoing: false))
        }
        state.unread["PreviewContact001"] = 2
        try vault.save(state)
        let store = MessengerStore(vaultFactory: { try fixture.vault() })
        XCTAssertNil(store.fatalError)
        XCTAssertEqual(store.peers.count, 3)
        // This store never enters foreground polling: visual fixtures do not create Firebase accounts.
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let originalWindow = scene.windows.first(where: \.isKeyWindow)
        for size in [CGSize(width: 393, height: 852), CGSize(width: 320, height: 693)] {
            let controller = UIHostingController(rootView: HomeView().environmentObject(store).preferredColorScheme(.dark))
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(origin: .zero, size: size)
            window.rootViewController = controller
            window.makeKeyAndVisible()
            controller.view.frame = window.bounds
            controller.view.setNeedsLayout(); controller.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(800))
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let image = UIGraphicsImageRenderer(bounds: controller.view.bounds, format: format).image { _ in
                controller.view.drawHierarchy(in: controller.view.bounds, afterScreenUpdates: true)
            }
            let attachment = XCTAttachment(image: image)
            attachment.name = "MicroChat-Home-\(Int(size.width))"
            attachment.lifetime = .keepAlways
            add(attachment)
            window.isHidden = true; window.rootViewController = nil
        }
        originalWindow?.makeKeyAndVisible()
    }
}
#endif
