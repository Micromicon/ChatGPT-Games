import Foundation
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public struct Identity: Codable, Sendable {
    public var encryptionPrivate: Data
    public var signingPrivate: Data
    public var encryptionID: UInt32
    public var signingID: UInt32

    public init() {
        encryptionPrivate = Curve25519.KeyAgreement.PrivateKey().rawRepresentation
        signingPrivate = Curve25519.Signing.PrivateKey().rawRepresentation
        encryptionID = UInt32.random(in: 1 ... 0x7fff_ffff)
        signingID = UInt32.random(in: 1 ... 0x7fff_ffff)
    }
}

public extension PublicBundle {
    func fingerprint() throws -> String {
        _ = try TinkPublicKey.parse(enc, kind: .hpke)
        _ = try TinkPublicKey.parse(sign, kind: .signing)
        return SHA256.hash(data: Data((enc + "\n" + sign).utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

public struct WireCrypto {
    private let encryption: Curve25519.KeyAgreement.PrivateKey
    private let signing: Curve25519.Signing.PrivateKey
    private let identity: Identity
    private static let suite = HPKE.Ciphersuite(kem: .Curve25519_HKDF_SHA256, kdf: .HKDF_SHA256, aead: .AES_GCM_256)

    public init(identity: Identity) throws {
        guard identity.encryptionID != 0, identity.signingID != 0,
              identity.encryptionPrivate.count == 32, identity.signingPrivate.count == 32 else {
            throw MicroChatError.invalidKeys
        }
        self.identity = identity
        encryption = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: identity.encryptionPrivate)
        signing = try Curve25519.Signing.PrivateKey(rawRepresentation: identity.signingPrivate)
    }

    public func publicBundle() -> PublicBundle {
        PublicBundle(enc: TinkPublicKey.encode(raw: encryption.publicKey.rawRepresentation, id: identity.encryptionID, kind: .hpke),
                     sign: TinkPublicKey.encode(raw: signing.publicKey.rawRepresentation, id: identity.signingID, kind: .signing))
    }

    public func seal(sender: String, recipient: String, id: String, created: Int64, text: String, peer: PublicBundle) throws -> Envelope {
        let plaintext = Data(text.utf8)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, plaintext.count <= 12_000 else {
            throw MicroChatError.message("В сообщении должно быть от 1 до 12 000 байт текста.")
        }
        _ = try peer.fingerprint()
        var envelope = Envelope(sender: sender, recipient: recipient, id: id, created: created)
        let info = try envelope.header()
        let recipient = try TinkPublicKey.parse(peer.enc, kind: .hpke)
        let key = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: recipient.raw)
        // A fresh HPKE sender is required for EACH envelope; MicroChat uses sequence number zero.
        var hpke = try HPKE.Sender(recipientKey: key, ciphersuite: Self.suite, info: info)
        let encrypted = try hpke.seal(plaintext, authenticating: Data())
        let ciphertext = recipient.prefix + hpke.encapsulatedKey + encrypted
        let signature = try signing.signature(for: info + ciphertext)
        envelope.ciphertext = Wire.encode(ciphertext)
        envelope.signature = Wire.encode(TinkPublicKey.prefix(identity.signingID) + signature)
        return envelope
    }

    public func open(_ envelope: Envelope, sender: String, ownUID: String, peer: PublicBundle) throws -> String {
        guard envelope.sender == sender, envelope.recipient == ownUID else { throw MicroChatError.invalidEnvelope }
        let info = try envelope.header()
        _ = try peer.fingerprint()
        let ciphertext = try Wire.decode(envelope.ciphertext)
        let signature = try Wire.decode(envelope.signature, limit: 256)
        let signer = try TinkPublicKey.parse(peer.sign, kind: .signing)
        guard ciphertext.count >= 53, ciphertext.count <= 20_000, signature.count == 69,
              ciphertext.prefix(5) == TinkPublicKey.prefix(identity.encryptionID),
              signature.prefix(5) == signer.prefix else { throw MicroChatError.invalidEnvelope }
        let key = try Curve25519.Signing.PublicKey(rawRepresentation: signer.raw)
        guard key.isValidSignature(Data(signature.dropFirst(5)), for: info + ciphertext) else {
            throw MicroChatError.invalidEnvelope
        }
        var hpke = try HPKE.Recipient(privateKey: encryption, ciphersuite: Self.suite, info: info,
                                      encapsulatedKey: Data(ciphertext.dropFirst(5).prefix(32)))
        let plaintext = try hpke.open(Data(ciphertext.dropFirst(37)), authenticating: Data())
        guard plaintext.count <= 12_000, let result = String(data: plaintext, encoding: .utf8) else {
            throw MicroChatError.invalidEnvelope
        }
        return result
    }
}
