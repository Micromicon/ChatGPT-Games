import Foundation
import Combine

@MainActor
final class MessengerStore: ObservableObject {
    @Published private(set) var state: VaultState
    @Published private(set) var connected = false
    @Published private(set) var syncError = ""
    @Published private(set) var busy = false
    @Published private(set) var fatalError: String?
    @Published var alert: String?

    private var vault: DeviceVault?
    private var client: FirebaseClient?
    private var crypto: WireCrypto?
    private let gate = NetworkGate()
    private var polling: Task<Void, Never>?
    private var foreground = false

    init() {
        // This placeholder is never persisted or connected if loading the vault fails.
        state = VaultState(identity: Identity())
        do {
            let vault = try DeviceVault()
            let loaded = try vault.load()
            guard let url = Bundle.main.url(forResource: "service-config", withExtension: "json") else {
                throw MicroChatError.invalidData
            }
            let config = try JSONDecoder().decode(ServiceConfig.self, from: Data(contentsOf: url))
            self.vault = vault; self.client = try FirebaseClient(config: config)
            self.crypto = try WireCrypto(identity: loaded.identity); self.state = loaded
        } catch { fatalError = "Защищённое хранилище или конфигурация недоступны. Данные не были перезаписаны. Закрой MicroChat и открой после разблокировки iPhone." }
    }

    var peers: [Peer] {
        state.peers.values.sorted {
            let first = latest($0.id)?.created ?? 0, second = latest($1.id)?.created ?? 0
            return first == second ? $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending : first > second
        }
    }
    var unreadCount: Int { state.unread.values.reduce(0, +) }
    var fingerprint: String { (try? crypto?.publicBundle().fingerprint()) ?? "" }
    var uid: String { state.auth?.uid ?? "" }
    func latest(_ id: String) -> ChatMessage? { messages(id).last }
    func messages(_ id: String) -> [ChatMessage] {
        state.messages.filter { $0.chatID == id }.sorted { $0.created == $1.created ? $0.id < $1.id : $0.created < $1.created }
    }
    func title(_ id: String) -> String { id == "saved" ? "Избранное" : state.peers[id]?.name ?? "Контакт" }

    private func save() throws {
        guard fatalError == nil, let vault else { throw MicroChatError.storage }
        do { try vault.save(state) }
        catch {
            fatalError = MicroChatError.storage.localizedDescription
            connected = false; polling?.cancel(); throw MicroChatError.storage
        }
    }
    func setOwner(_ name: String) {
        let name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
        guard !name.isEmpty else { return }
        state.owner = name
        do { try save(); if foreground { startPolling() } } catch { show(error) }
    }
    func setDraft(_ id: String, _ text: String) {
        guard fatalError == nil, state.drafts[id, default: ""] != text else { return }
        state.drafts[id] = String(text.prefix(12_000))
        do { try save() } catch { show(error) }
    }
    func markRead(_ id: String) {
        guard state.unread[id, default: 0] > 0 else { return }
        state.unread[id] = 0
        do { try save() } catch { show(error) }
    }
    private func show(_ error: Error) {
        alert = (error as? MicroChatError)?.localizedDescription ?? MicroChatError.network.localizedDescription
    }
    private func ensureReady() throws -> (FirebaseClient, WireCrypto) {
        guard fatalError == nil, let client, let crypto else { throw MicroChatError.storage }
        return (client, crypto)
    }
    private func account() async throws -> Credentials {
        let (client, _) = try ensureReady()
        if let saved = state.auth, saved.expiresAt > Wire.now() + 60_000 { return saved }
        let saved = try await client.signIn(previous: state.auth)
        state.auth = saved; try save()
        return saved
    }
    private func database(_ method: String, _ path: String, body: Data? = nil, queue: Bool = false) async throws -> Data {
        let (client, _) = try ensureReady()
        let credentials = try await account()
        return try await client.database(method, path: path, token: credentials.idToken, body: body, queue: queue)
    }
    private func publish() async throws {
        let (_, crypto) = try ensureReady()
        let selfUID = try await account().uid
        let keys = crypto.publicBundle()
        let published = try await database("GET", "/profiles/" + selfUID)
        if String(data: published, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) == "null" {
            _ = try await database("PUT", "/profiles/" + selfUID, body: JSONEncoder().encode(keys))
        } else {
            let prior = try JSONDecoder().decode(PublicBundle.self, from: published)
            guard try prior.fingerprint() == keys.fingerprint() else {
                throw MicroChatError.message("Ключи телефона не совпали с профилем на сервере. Автоматическая замена запрещена.")
            }
        }
    }

    func invitation() async -> String? {
        busy = true
        await gate.acquire()
        defer { busy = false; Task { await gate.release() } }
        do {
            try await publish()
            let (client, crypto) = try ensureReady()
            let selfUID = try await account().uid
            return try Invitation(uid: selfUID, keys: crypto.publicBundle(), databaseUrl: client.config.databaseUrl,
                                  apiKey: client.config.apiKey, name: state.owner).encode()
        } catch { show(error); return nil }
    }

    func addPeer(_ text: String) async -> String? {
        busy = true
        await gate.acquire()
        defer { busy = false; Task { await gate.release() } }
        do {
            let (client, _) = try ensureReady()
            let invite = try Invitation.decode(text, config: client.config)
            let selfUID = try await account().uid
            guard invite.uid != selfUID else { throw MicroChatError.message("Это твоё приглашение. Для заметок есть «Избранное».") }
            let fingerprint = try invite.keys.fingerprint()
            let published = try await database("GET", "/profiles/" + invite.uid)
            guard let keys = try? JSONDecoder().decode(PublicBundle.self, from: published),
                  try keys.fingerprint() == fingerprint else { throw MicroChatError.invalidKeys }
            if let peer = state.peers[invite.uid], try peer.keys.fingerprint() != fingerprint {
                throw MicroChatError.message("Ключ контакта изменился. Добавление заблокировано.")
            }
            let name = String(invite.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
            state.peers[invite.uid] = Peer(id: invite.uid, name: name.isEmpty ? "Контакт" : name, keys: keys)
            try save()
            try await authorize(invite.uid, selfUID: selfUID)
            return invite.uid
        } catch { show(error); return nil }
    }
    private func authorize(_ peer: String, selfUID: String) async throws {
        _ = try await database("PUT", "/peers/\(selfUID)/\(peer)", body: Data("{\"allowed\":true}".utf8))
        state.peers[peer]?.authorized = true
        try save()
    }

    func send(_ text: String, to id: String) async -> Bool {
        await gate.acquire()
        defer { Task { await gate.release() } }
        do {
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf8.count <= 12_000 else {
                throw MicroChatError.message("Сообщение пустое или длиннее 12 000 байт.")
            }
            let (_, crypto) = try ensureReady()
            let messageID = UUID().uuidString.lowercased(), created = Wire.now()
            if id != "saved" {
                guard let peer = state.peers[id] else { throw MicroChatError.invalidKeys }
                let selfUID = try await account().uid
                let envelope = try crypto.seal(sender: selfUID, recipient: id, id: messageID, created: created, text: text, peer: peer.keys)
                state.outbox[messageID] = envelope
            }
            state.append(ChatMessage(id: messageID, chatID: id, text: text, created: created, outgoing: true))
            if state.drafts[id] == text { state.drafts[id] = "" }
            try save()
            if id != "saved" { Task { await syncNow() } }
            return true
        } catch { show(error); return false }
    }

    private func flush() async throws {
        var firstError: Error?
        for id in state.outbox.keys.sorted() {
            guard let message = state.outbox[id] else { continue }
            do {
                _ = try await database("PUT", "/queue/\(message.recipient)/\(message.sender)/\(id)", body: JSONEncoder().encode(message))
                state.outbox.removeValue(forKey: id)
                try save()
            } catch {
                if fatalError != nil { throw error }
                if firstError == nil { firstError = error }
            }
        }
        if let firstError { throw firstError }
    }
    private func receive() async throws {
        let (_, crypto) = try ensureReady()
        let selfUID = try await account().uid
        for sender in state.peers.keys.sorted() {
            guard let peer = state.peers[sender] else { continue }
            let path = "/queue/\(selfUID)/\(sender)"
            let data = try await database("GET", path, queue: true)
            if String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) == "null" { continue }
            let queue = try JSONDecoder().decode([String: Envelope].self, from: data)
            for id in queue.keys.sorted() {
                guard let envelope = queue[id], envelope.id == id else { throw MicroChatError.invalidEnvelope }
                let text = try crypto.open(envelope, sender: sender, ownUID: selfUID, peer: peer.keys)
                state.append(ChatMessage(id: id, chatID: sender, text: text, created: envelope.created, outgoing: false))
                // Commit even on a duplicate before acknowledging it; failed storage never deletes the queue item.
                try save()
                _ = try await database("DELETE", path + "/" + id)
            }
        }
    }
    func syncNow() async {
        guard fatalError == nil, !state.owner.isEmpty else { return }
        await gate.acquire()
        defer { Task { await gate.release() } }
        do {
            try Task.checkCancellation()
            try await publish()
            let selfUID = try await account().uid
            for peer in state.peers.values.filter({ !$0.authorized }).map(\.id) { try await authorize(peer, selfUID: selfUID) }
            var deliveryError: Error?
            do { try await flush() } catch { deliveryError = error }
            try await receive()
            if let deliveryError { throw deliveryError }
            connected = true; syncError = ""
        } catch is CancellationError {
            connected = false
        } catch {
            connected = false
            syncError = (error as? MicroChatError)?.localizedDescription ?? MicroChatError.network.localizedDescription
        }
    }
    func setForeground(_ active: Bool) {
        foreground = active
        if active { startPolling() } else { polling?.cancel(); polling = nil; connected = false }
    }
    private func startPolling() {
        guard polling == nil, fatalError == nil, !state.owner.isEmpty else { return }
        polling = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.syncNow()
                do { try await Task.sleep(for: .seconds(7)) } catch { return }
            }
        }
    }
}
