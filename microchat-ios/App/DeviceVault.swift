import Foundation
import CryptoKit
import Security

/// Only a non-migrating AES key is in Keychain; the whole state is an authenticated encrypted file.
final class DeviceVault {
    private let url: URL
    private let key: SymmetricKey
    private let aad = Data("MicroChat-iOS-v1".utf8)

    init(directory: URL? = nil, keychainService: String = "com.microchat.app.vault.v1") throws {
        let manager = FileManager.default
        let root: URL
        if let directory { root = directory }
        else {
            root = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                .appendingPathComponent("MicroChat", isDirectory: true)
        }
        try manager.createDirectory(at: root, withIntermediateDirectories: true,
                                    attributes: [.protectionKey: FileProtectionType.complete])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var protectedDirectory = root; try protectedDirectory.setResourceValues(values)
        url = root.appendingPathComponent("vault-v1.aesgcm")
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                  kSecAttrService as String: keychainService,
                                  kSecAttrAccount as String: "device-master",
                                  kSecAttrSynchronizable as String: false]
        var readQuery = query
        readQuery[kSecReturnData as String] = true
        readQuery[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: CFTypeRef?
        let status = SecItemCopyMatching(readQuery as CFDictionary, &found)
        let material: Data
        if status == errSecSuccess, let stored = found as? Data, stored.count == 32 {
            material = stored
        } else if status == errSecItemNotFound, !manager.fileExists(atPath: url.path) {
            let generated = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
            var insert = query
            insert[kSecValueData as String] = generated
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw MicroChatError.storage }
            material = generated
        } else { throw MicroChatError.storage }
        key = SymmetricKey(data: material)
    }

    func load() throws -> VaultState {
        if !FileManager.default.fileExists(atPath: url.path) {
            let initial = VaultState(identity: Identity())
            try save(initial)
            return initial
        }
        do {
            let encrypted = try Data(contentsOf: url)
            let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: encrypted), using: key, authenticating: aad)
            let state = try JSONDecoder().decode(VaultState.self, from: plaintext)
            guard state.version == 1 else { throw MicroChatError.storage }
            _ = try WireCrypto(identity: state.identity)
            if let auth = state.auth, !Wire.validUID(auth.uid) { throw MicroChatError.storage }
            for (uid, peer) in state.peers {
                guard uid == peer.id, Wire.validUID(uid) else { throw MicroChatError.storage }
                _ = try peer.keys.fingerprint()
            }
            return state
        } catch { throw MicroChatError.storage }
    }

    func save(_ state: VaultState) throws {
        do {
            let plaintext = try JSONEncoder().encode(state)
            guard let sealed = try AES.GCM.seal(plaintext, using: key, authenticating: aad).combined else {
                throw MicroChatError.storage
            }
            try sealed.write(to: url, options: [.atomic, .completeFileProtection])
        } catch { throw MicroChatError.storage }
    }
}
