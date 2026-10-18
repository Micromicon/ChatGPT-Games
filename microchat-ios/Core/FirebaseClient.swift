import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct FirebaseClient {
    let config: ServiceConfig
    private let session: URLSession

    init(config: ServiceConfig) throws {
        try config.validate()
        self.config = config
        let settings = URLSessionConfiguration.ephemeral
        settings.urlCache = nil; settings.httpCookieStorage = nil; settings.httpShouldSetCookies = false
        settings.requestCachePolicy = .reloadIgnoringLocalCacheData
        settings.timeoutIntervalForRequest = 20; settings.timeoutIntervalForResource = 30
        session = URLSession(configuration: settings, delegate: NoRedirects(), delegateQueue: nil)
    }

    private func request(method: String, url: URL, body: Data? = nil, form: Bool = false) async throws -> Data {
        guard url.scheme == "https", let host = url.host,
              [URL(string: config.databaseUrl)?.host, "identitytoolkit.googleapis.com", "securetoken.googleapis.com"].contains(host),
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil else {
            throw MicroChatError.invalidData
        }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue(form ? "application/x-www-form-urlencoded" : "application/json", forHTTPHeaderField: "Content-Type") }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch is CancellationError { throw CancellationError() }
        catch { throw MicroChatError.network }
        guard let response = response as? HTTPURLResponse, data.count <= 4_000_000 else { throw MicroChatError.network }
        if response.statusCode == 401 || response.statusCode == 403 { throw MicroChatError.permission }
        guard (200 ... 299).contains(response.statusCode) else { throw MicroChatError.network }
        return data
    }

    func signIn(previous: Credentials?) async throws -> Credentials {
        var parts = URLComponents()
        parts.scheme = "https"
        parts.queryItems = [URLQueryItem(name: "key", value: config.apiKey)]
        if let previous {
            guard !previous.refreshToken.isEmpty, Wire.validUID(previous.uid) else { throw MicroChatError.authentication }
            parts.host = "securetoken.googleapis.com"; parts.path = "/v1/token"
            var form = URLComponents()
            form.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token"),
                               URLQueryItem(name: "refresh_token", value: previous.refreshToken)]
            guard let url = parts.url, let body = form.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B") else {
                throw MicroChatError.invalidData
            }
            struct Response: Decodable { let user_id: String; let id_token: String; let refresh_token: String; let expires_in: String }
            let result = try JSONDecoder().decode(Response.self, from: await request(method: "POST", url: url, body: Data(body.utf8), form: true))
            guard result.user_id == previous.uid, let seconds = Int64(result.expires_in), (1 ... 86_400).contains(seconds) else {
                throw MicroChatError.authentication
            }
            return Credentials(uid: previous.uid, idToken: result.id_token, refreshToken: result.refresh_token, expiresAt: Wire.now() + seconds * 1000)
        } else {
            parts.host = "identitytoolkit.googleapis.com"; parts.path = "/v1/accounts:signUp"
            guard let url = parts.url else { throw MicroChatError.invalidData }
            struct Response: Decodable { let localId: String; let idToken: String; let refreshToken: String; let expiresIn: String }
            let result = try JSONDecoder().decode(Response.self, from: await request(method: "POST", url: url, body: Data("{\"returnSecureToken\":true}".utf8)))
            guard Wire.validUID(result.localId), let seconds = Int64(result.expiresIn), (1 ... 86_400).contains(seconds) else {
                throw MicroChatError.authentication
            }
            return Credentials(uid: result.localId, idToken: result.idToken, refreshToken: result.refreshToken, expiresAt: Wire.now() + seconds * 1000)
        }
    }

    func database(_ method: String, path: String, token: String, body: Data? = nil, queue: Bool = false) async throws -> Data {
        guard path.range(of: "^/(profiles|peers|queue)(/[A-Za-z0-9_-]+){1,3}$", options: .regularExpression) != nil,
              var url = URLComponents(string: config.databaseUrl + path + ".json") else { throw MicroChatError.invalidData }
        url.queryItems = [URLQueryItem(name: "auth", value: token)]
        if queue {
            url.queryItems?.append(contentsOf: [URLQueryItem(name: "orderBy", value: "\"$key\""), URLQueryItem(name: "limitToFirst", value: "100")])
        }
        guard let endpoint = url.url else { throw MicroChatError.invalidData }
        return try await request(method: method, url: endpoint, body: body)
    }
}

/// Serializes complete workflows across suspension points, including initial anonymous sign-in.
actor NetworkGate {
    private var held = false
    private var waiting: [CheckedContinuation<Void, Never>] = []
    func acquire() async {
        if !held { held = true; return }
        await withCheckedContinuation { waiting.append($0) }
    }
    func release() {
        if waiting.isEmpty { held = false } else { waiting.removeFirst().resume() }
    }
}
