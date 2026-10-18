import XCTest
#if canImport(MicroChat)
@testable import MicroChat
#else
@testable import MicroChatCore
#endif

final class WireCryptoTests: XCTestCase {
    struct Fixture: Decodable {
        let androidUID: String
        let iosUID: String
        let plaintext: String
        let androidBundle: PublicBundle
        let iosBundle: PublicBundle
        let iosIdentity: Identity
        let androidEnvelope: Envelope
    }
    func fixture() throws -> Fixture {
        #if SWIFT_PACKAGE
        let bundle = Bundle.module
        #else
        let bundle = Bundle(for: Self.self)
        #endif
        let url = try XCTUnwrap(bundle.url(forResource: "android-v1", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }
    func testAndroidToSwift() throws {
        let data = try fixture()
        let crypto = try WireCrypto(identity: data.iosIdentity)
        XCTAssertEqual(crypto.publicBundle(), data.iosBundle, "Tink keyset bytes and IDs must match exactly")
        XCTAssertEqual(try crypto.open(data.androidEnvelope, sender: data.androidUID, ownUID: data.iosUID, peer: data.androidBundle), data.plaintext)
    }
    func testSwiftReplyForAndroid() throws {
        let data = try fixture()
        let crypto = try WireCrypto(identity: data.iosIdentity)
        let plaintext = "iPhone → Android: ответ получен ✅\n\"Кавычки\", эмодзи и русский текст."
        let reply = try crypto.seal(sender: data.iosUID, recipient: data.androidUID, id: UUID().uuidString,
                                    created: 1_792_324_801_000, text: plaintext, peer: data.androidBundle)
        let another = try crypto.seal(sender: data.iosUID, recipient: data.androidUID, id: UUID().uuidString,
                                      created: 1_792_324_801_000, text: plaintext, peer: data.androidBundle)
        XCTAssertNotEqual(reply.ciphertext, another.ciphertext)
        struct Reply: Encodable { let plaintext: String; let envelope: Envelope; let bundle: PublicBundle }
        if let path = ProcessInfo.processInfo.environment["MICROCHAT_INTEROP_OUTPUT"] {
            try JSONEncoder().encode(Reply(plaintext: plaintext, envelope: reply, bundle: crypto.publicBundle())).write(to: URL(fileURLWithPath: path))
        }
    }
    func testRejectsTamperingAndWrongKeys() throws {
        let data = try fixture()
        let crypto = try WireCrypto(identity: data.iosIdentity)
        var samples: [Envelope] = []
        var changed = data.androidEnvelope; changed.created += 1; samples.append(changed)
        changed = data.androidEnvelope; changed.id = UUID().uuidString; samples.append(changed)
        changed = data.androidEnvelope; changed.sender = "OtherSender123456"; samples.append(changed)
        changed = data.androidEnvelope; changed.recipient = "OtherReceiver12345"; samples.append(changed)
        changed = data.androidEnvelope; changed.v = 2; samples.append(changed)
        changed = data.androidEnvelope
        var bytes = try Wire.decode(changed.ciphertext); bytes[bytes.count - 1] ^= 1
        changed.ciphertext = Wire.encode(bytes); samples.append(changed)
        changed = data.androidEnvelope
        bytes = try Wire.decode(changed.signature); bytes[bytes.count - 1] ^= 1
        changed.signature = Wire.encode(bytes); samples.append(changed)
        for sample in samples {
            XCTAssertThrowsError(try crypto.open(sample, sender: data.androidUID, ownUID: data.iosUID, peer: data.androidBundle))
        }
        let stranger = try WireCrypto(identity: Identity())
        XCTAssertThrowsError(try stranger.open(data.androidEnvelope, sender: data.androidUID, ownUID: data.iosUID, peer: data.androidBundle))
        XCTAssertThrowsError(try crypto.open(data.androidEnvelope, sender: data.androidUID, ownUID: data.iosUID, peer: stranger.publicBundle()))
    }
    func testRejectsInvalidKeysetsAndBase64() throws {
        let data = try fixture()
        for value in ["!", "AA=", "A", "AB", String(repeating: "x", count: 5000)] {
            XCTAssertThrowsError(try TinkPublicKey.parse(value, kind: .hpke))
        }
        let raw = Data(repeating: 7, count: 32)
        let publicKey = TinkPublicKey.encode(raw: raw, id: 123, kind: .hpke)
        XCTAssertEqual(try TinkPublicKey.parse(publicKey, kind: .hpke).raw, raw)
        XCTAssertThrowsError(try TinkPublicKey.parse(data.androidBundle.sign, kind: .hpke))
        let duplicate = try Wire.decode(publicKey) + Proto.number(1, 123)
        XCTAssertThrowsError(try TinkPublicKey.parse(Wire.encode(duplicate), kind: .hpke))
        let secretData = Proto.bytes(1, TinkPublicKey.typeURL(.hpke)) + Proto.bytes(2, raw) + Proto.number(3, 2)
        let entry = Proto.bytes(1, secretData) + Proto.number(2, 1) + Proto.number(3, 123) + Proto.number(4, 1)
        let secret = Wire.encode(Proto.number(1, 123) + Proto.bytes(2, entry))
        XCTAssertThrowsError(try TinkPublicKey.parse(secret, kind: .hpke))
    }
    func testMessageLimitsAndUnicode() throws {
        let crypto = try WireCrypto(identity: Identity())
        let id = UUID().uuidString
        let text = String(repeating: "я", count: 6000)
        let message = try crypto.seal(sender: "TestSender12345", recipient: "TestReceiver12345", id: id, created: 0, text: text, peer: crypto.publicBundle())
        XCTAssertEqual(try crypto.open(message, sender: "TestSender12345", ownUID: "TestReceiver12345", peer: crypto.publicBundle()), text)
        for text in ["", "   \n", String(repeating: "я", count: 6001)] {
            XCTAssertThrowsError(try crypto.seal(sender: "TestSender12345", recipient: "TestReceiver12345", id: id, created: 0, text: text, peer: crypto.publicBundle()))
        }
    }
    func testIdentityAndHistorySurviveSerializationWithoutDuplicates() throws {
        var state = VaultState(identity: Identity())
        let message = ChatMessage(id: UUID().uuidString, chatID: "TestSender12345", text: "Привет", created: 1000, outgoing: false)
        XCTAssertTrue(state.append(message)); XCTAssertFalse(state.append(message))
        XCTAssertEqual(state.unread[message.chatID], 1)
        state.drafts["saved"] = "Черновик"
        let restored = try JSONDecoder().decode(VaultState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(restored.messages.count, 1)
        XCTAssertEqual(restored.drafts["saved"], "Черновик")
        XCTAssertEqual(try WireCrypto(identity: state.identity).publicBundle(), try WireCrypto(identity: restored.identity).publicBundle())
    }
    func testUnsignedTinkKeyIDs() throws {
        var identity = Identity()
        identity.encryptionID = 0xf123_4567; identity.signingID = UInt32.max
        let crypto = try WireCrypto(identity: identity)
        XCTAssertEqual(try TinkPublicKey.parse(crypto.publicBundle().enc, kind: .hpke).id, identity.encryptionID)
        let message = try crypto.seal(sender: "TestSender12345", recipient: "TestReceiver12345", id: UUID().uuidString,
                                      created: 0, text: "Unsigned key IDs", peer: crypto.publicBundle())
        XCTAssertEqual(try crypto.open(message, sender: "TestSender12345", ownUID: "TestReceiver12345", peer: crypto.publicBundle()), "Unsigned key IDs")
    }
    func testInvitationAndServerValidation() throws {
        let config = ServiceConfig(v: 1, projectId: "test-project", databaseUrl: "https://test-project-default-rtdb.europe-west1.firebasedatabase.app",
                                   apiKey: String(repeating: "x", count: 39))
        try config.validate()
        let keys = try WireCrypto(identity: Identity()).publicBundle()
        var invitation = Invitation(uid: "TestSender12345", keys: keys, databaseUrl: config.databaseUrl, apiKey: config.apiKey, name: "Аня")
        XCTAssertEqual(try Invitation.decode(invitation.encode(), config: config).keys, keys)
        invitation.databaseUrl = "https://foreign-default-rtdb.firebaseio.com"
        XCTAssertThrowsError(try Invitation.decode(invitation.encode(), config: config))
        for address in ["http://test.firebaseio.com", "https://test.firebaseio.com.evil.example", "https://test.firebaseio.com/path",
                        "https://user@test.firebaseio.com", "https://test.firebaseio.com?query=1"] {
            XCTAssertThrowsError(try ServiceConfig(v: 1, projectId: "test-project", databaseUrl: address, apiKey: config.apiKey).validate())
        }
    }
    func testConcurrentWorkflowsRemainExclusiveAcrossAwait() async {
        actor Counter {
            var active = 0, maximum = 0, completed = 0
            func enter() { active += 1; maximum = max(maximum, active) }
            func leave() { active -= 1; completed += 1 }
            func result() -> (Int, Int) { (maximum, completed) }
        }
        let gate = NetworkGate(), counter = Counter()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0 ..< 20 {
                group.addTask {
                    await gate.acquire()
                    await counter.enter()
                    await Task.yield()
                    await counter.leave()
                    await gate.release()
                }
            }
        }
        let (maximum, completed) = await counter.result()
        XCTAssertEqual(maximum, 1); XCTAssertEqual(completed, 20)
    }
}
