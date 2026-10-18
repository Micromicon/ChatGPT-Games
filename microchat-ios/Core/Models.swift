import Foundation

public enum MicroChatError: Error, LocalizedError {
    case invalidData, invalidKeys, invalidEnvelope, authentication, storage, network, permission
    case message(String)

    public var errorDescription: String? {
        switch self {
        case .invalidData: return "Некорректные данные MicroChat."
        case .invalidKeys: return "Ключи контакта не прошли проверку."
        case .invalidEnvelope: return "Не удалось проверить подпись или расшифровать сообщение."
        case .authentication: return "Не удалось войти в аккаунт. Личность не будет заменена автоматически."
        case .storage: return "Не удалось открыть защищённое хранилище. Данные не были перезаписаны."
        case .network: return "Нет соединения с сервером. Проверь интернет и повтори попытку."
        case .permission: return "Сервер отклонил доставку. Собеседник должен добавить твоё приглашение."
        case .message(let value): return value
        }
    }
}

public enum Wire {
    public static func encode(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    public static func decode(_ value: String, limit: Int = 30_000) throws -> Data {
        guard !value.isEmpty, value.utf8.count <= limit,
              value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
              value.count % 4 != 1 else { throw MicroChatError.invalidData }
        let padded = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/") + String(repeating: "=", count: (4 - value.count % 4) % 4)
        guard let result = Data(base64Encoded: padded), encode(result) == value else {
            throw MicroChatError.invalidData
        }
        return result
    }

    public static func validUID(_ uid: String) -> Bool {
        uid.range(of: "^[A-Za-z0-9_-]{10,128}$", options: .regularExpression) != nil
    }
    public static func now() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}

public struct PublicBundle: Codable, Equatable, Sendable {
    public var enc: String
    public var sign: String
    public init(enc: String, sign: String) { self.enc = enc; self.sign = sign }
}

public struct Envelope: Codable, Equatable, Sendable {
    public var v: Int = 1
    public var sender: String
    public var recipient: String
    public var id: String
    public var created: Int64
    public var ciphertext: String = ""
    public var signature: String = ""

    public func header() throws -> Data {
        guard v == 1, Wire.validUID(sender), Wire.validUID(recipient),
              id.range(of: "^[A-Za-z0-9_-]{16,64}$", options: .regularExpression) != nil,
              created >= 0, created <= 9_007_199_254_740_991 else { throw MicroChatError.invalidEnvelope }
        return Data("MicroChat-v1|\(id)|\(sender)|\(recipient)|\(created)".utf8)
    }
}

public struct ServiceConfig: Codable, Sendable {
    public let v: Int
    public let projectId: String
    public let databaseUrl: String
    public let apiKey: String

    public func validate() throws {
        guard v == 1, let url = URLComponents(string: databaseUrl), url.scheme == "https",
              let host = url.host, host.hasSuffix(".firebasedatabase.app") || host.hasSuffix(".firebaseio.com"),
              url.user == nil, url.password == nil, url.port == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty, databaseUrl == "https://" + host,
              apiKey.range(of: "^[A-Za-z0-9_-]{25,100}$", options: .regularExpression) != nil
        else { throw MicroChatError.invalidData }
    }
}

public struct Invitation: Codable, Sendable {
    public var v: Int = 1
    public var uid: String
    public var keys: PublicBundle
    public var databaseUrl: String
    public var apiKey: String
    public var name: String

    public func encode() throws -> String {
        "microchat:" + Wire.encode(try JSONEncoder().encode(self))
    }
    public static func decode(_ text: String, config: ServiceConfig) throws -> Invitation {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("microchat:"), text.utf8.count <= 20_000 else {
            throw MicroChatError.message("Вставь приглашение, которое начинается с microchat:.")
        }
        let invite = try JSONDecoder().decode(Invitation.self, from: Wire.decode(String(text.dropFirst(10)), limit: 20_000))
        guard invite.v == 1, Wire.validUID(invite.uid), invite.databaseUrl == config.databaseUrl else {
            throw MicroChatError.message("Приглашение относится к другому серверу MicroChat.")
        }
        _ = try invite.keys.fingerprint()
        return invite
    }
}

public struct Credentials: Codable, Sendable {
    public var uid: String
    public var idToken: String
    public var refreshToken: String
    public var expiresAt: Int64
}

public struct Peer: Codable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var keys: PublicBundle
    public var authorized = false
}

public struct ChatMessage: Codable, Identifiable, Sendable {
    public var id: String
    public var chatID: String
    public var text: String
    public var created: Int64
    public var outgoing: Bool
}

public struct VaultState: Codable, Sendable {
    public var version = 1
    public var owner = ""
    public var identity: Identity
    public var auth: Credentials?
    public var peers: [String: Peer] = [:]
    public var messages: [ChatMessage] = []
    public var outbox: [String: Envelope] = [:]
    public var drafts: [String: String] = [:]
    public var unread: [String: Int] = [:]

    public init(identity: Identity) { self.identity = identity }

    @discardableResult
    public mutating func append(_ message: ChatMessage) -> Bool {
        guard !messages.contains(where: { $0.id == message.id && $0.chatID == message.chatID }) else { return false }
        messages.append(message)
        if !message.outgoing { unread[message.chatID, default: 0] += 1 }
        return true
    }
}
