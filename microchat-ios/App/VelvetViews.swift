import SwiftUI
import UIKit

enum Velvet {
    static let background = Color(red: 0.105, green: 0.047, blue: 0.055)
    static let panel = Color(red: 0.19, green: 0.10, blue: 0.115)
    static let coral = Color(red: 1, green: 0.51, blue: 0.45)
    static let cream = Color(red: 0.99, green: 0.95, blue: 0.90)
    static let muted = Color(red: 0.65, green: 0.57, blue: 0.56)
    static let stroke = Color(red: 0.34, green: 0.19, blue: 0.21)
    static let gradient = LinearGradient(colors: [panel, background], startPoint: .topLeading, endPoint: .bottomTrailing)
}

struct VelvetButton: View {
    let title: String
    let symbol: String
    var prominent = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.system(size: 16, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 54)
                .foregroundStyle(prominent ? Velvet.background : Velvet.cream)
                .background(prominent ? Velvet.coral : Velvet.panel, in: RoundedRectangle(cornerRadius: 17))
                .overlay { RoundedRectangle(cornerRadius: 17).stroke(prominent ? .clear : Velvet.stroke, lineWidth: 1) }
        }.buttonStyle(.plain)
    }
}

struct Avatar: View {
    let name: String
    var saved = false
    var size: CGFloat = 58
    var body: some View {
        ZStack {
            Circle().fill(LinearGradient(colors: [Velvet.stroke, Velvet.panel], startPoint: .topLeading, endPoint: .bottomTrailing))
            if saved { Image(systemName: "bookmark").font(.system(size: size * 0.38, weight: .light)) }
            else {
                Text(name.split(separator: " ").prefix(2).compactMap(\.first).map { String($0) }.joined().uppercased())
                    .font(.system(size: size * 0.32, weight: .semibold, design: .rounded))
            }
        }
        .foregroundStyle(Velvet.coral).frame(width: size, height: size)
        .overlay { Circle().stroke(Velvet.stroke, lineWidth: 1) }
        .accessibilityHidden(true)
    }
}

private struct Botanical: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        p.move(to: CGPoint(x: w * 0.76, y: h))
        p.addCurve(to: CGPoint(x: w * 0.56, y: h * 0.04), control1: CGPoint(x: w * 0.79, y: h * 0.5), control2: CGPoint(x: w * 0.64, y: h * 0.2))
        for (x, y, side) in [(0.72, 0.77, -1.0), (0.71, 0.59, 1.0), (0.65, 0.36, -1.0), (0.60, 0.22, 1.0)] {
            let origin = CGPoint(x: w * x, y: h * y)
            let tip = CGPoint(x: w * (x + side * 0.37), y: h * (y - 0.29))
            p.move(to: origin)
            p.addQuadCurve(to: tip, control: CGPoint(x: w * (x + side * 0.33), y: h * (y - 0.03)))
            p.addQuadCurve(to: origin, control: CGPoint(x: w * (x + side * 0.17), y: h * (y - 0.26)))
        }
        return p
    }
}

struct OnboardingView: View {
    @EnvironmentObject private var store: MessengerStore
    @State private var name = ""
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                Text("MicroChat").font(.system(size: 26, weight: .bold)).foregroundStyle(Velvet.coral)
                    .padding(.top, 50)
                ZStack(alignment: .leading) {
                    Botanical().stroke(Velvet.coral.opacity(0.18), lineWidth: 1).frame(width: 180, height: 240).frame(maxWidth: .infinity, alignment: .trailing)
                    Text("Ближе.\nДаже издалека.").font(.system(size: 46, design: .serif)).foregroundStyle(Velvet.cream)
                }
                Text("Как тебя называть?").font(.title3.weight(.semibold)).foregroundStyle(Velvet.cream)
                TextField("Твоё имя", text: $name).textContentType(.nickname).submitLabel(.done)
                    .padding(18).background(Velvet.panel, in: RoundedRectangle(cornerRadius: 16))
                    .onSubmit { store.setOwner(name) }
                Text("Сервер уже подключён. После входа обменяйтесь приглашениями и добавьте друг друга.")
                    .foregroundStyle(Velvet.muted).font(.subheadline)
                VelvetButton(title: "Открыть MicroChat", symbol: "arrow.right", prominent: true) { store.setOwner(name) }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Label("Текст шифруется на устройстве до отправки", systemImage: "lock.shield")
                    .font(.footnote).foregroundStyle(Velvet.muted)
            }.padding(26)
        }.background(Velvet.background)
    }
}

private enum HomeSheet: String, Identifiable {
    case contacts, add, invite, settings, calls
    var id: String { rawValue }
}

struct HomeView: View {
    @EnvironmentObject private var store: MessengerStore
    @State private var search = ""
    @State private var path: [String] = []
    @State private var sheet: HomeSheet?
    private var filtered: [Peer] {
        store.peers.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)
            || (store.latest($0.id)?.text.localizedCaseInsensitiveContains(search) ?? false) }
    }
    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ZStack(alignment: .leading) {
                        Botanical().stroke(Velvet.coral.opacity(0.16), lineWidth: 1)
                            .frame(width: 180, height: 140).frame(maxWidth: .infinity, alignment: .trailing)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Чаты").font(.system(size: 60, weight: .regular, design: .serif)).foregroundStyle(Velvet.cream)
                            Text(store.unreadCount > 0 ? "Новых сообщений: \(store.unreadCount)" : "Твои люди — рядом")
                                .font(.system(size: 18)).foregroundStyle(Velvet.coral)
                            Capsule().fill(Velvet.coral).frame(width: 42, height: 2).padding(.top, 8)
                        }
                    }.padding(.top, 12)
                    HStack(spacing: 12) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Velvet.cream)
                        TextField("Поиск по чатам", text: $search).autocorrectionDisabled()
                            .accessibilityLabel("Поиск по чатам")
                        if !search.isEmpty { Button("Сбросить") { search = "" }.font(.caption) }
                    }.padding(17).background(Velvet.panel, in: RoundedRectangle(cornerRadius: 15))
                        .overlay { RoundedRectangle(cornerRadius: 15).stroke(Velvet.stroke, lineWidth: 1) }
                    HStack(spacing: 12) {
                        VelvetButton(title: "Контакты", symbol: "person.2.fill") { sheet = .contacts }
                        VelvetButton(title: "Звонки", symbol: "phone.fill") { sheet = .calls }
                    }
                    if !store.syncError.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(store.syncError).font(.footnote).foregroundStyle(Velvet.muted)
                            Button("Повторить соединение", systemImage: "arrow.clockwise") { Task { await store.syncNow() } }
                                .font(.footnote.weight(.semibold))
                        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Velvet.panel, in: RoundedRectangle(cornerRadius: 14))
                    }
                    LazyVStack(spacing: 0) {
                        if search.isEmpty || "Избранное".localizedCaseInsensitiveContains(search) {
                            NavigationLink(value: "saved") { ChatRow(id: "saved", name: "Избранное", saved: true) }.buttonStyle(.plain)
                        }
                        ForEach(filtered) { peer in
                            NavigationLink(value: peer.id) { ChatRow(id: peer.id, name: peer.name) }.buttonStyle(.plain)
                        }
                    }
                    if store.peers.isEmpty && search.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Начни с приглашения").font(.headline).foregroundStyle(Velvet.cream)
                            Text("Отправь своё приглашение собеседнику и добавь его приглашение. После этого можно переписываться между Android и iPhone.")
                                .font(.subheadline).foregroundStyle(Velvet.muted)
                            Button("Моё приглашение", systemImage: "square.and.arrow.up") { sheet = .invite }
                                .font(.subheadline.weight(.semibold)).padding(.top, 5)
                        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            .background(Velvet.panel.opacity(0.6), in: RoundedRectangle(cornerRadius: 18))
                    }
                    Label(store.connected ? "Соединение установлено" : "Ожидание соединения", systemImage: store.connected ? "lock.shield" : "arrow.triangle.2.circlepath")
                        .font(.caption).foregroundStyle(Velvet.muted).frame(maxWidth: .infinity)
                }.padding(.horizontal, 20).padding(.bottom, 22)
            }
            .background(Velvet.gradient)
            .navigationTitle("MicroChat").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { sheet = .settings } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "gearshape")
                            Text("Настройки")
                        }
                    }.font(.footnote).foregroundStyle(Velvet.coral)
                }
            }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 12) {
                    VelvetButton(title: "Избранное", symbol: "bookmark") { path.append("saved") }
                    VelvetButton(title: "Новый чат", symbol: "square.and.pencil", prominent: true) { sheet = .add }
                }.padding(16).background(Velvet.background)
            }
            .navigationDestination(for: String.self) { id in ChatView(chatID: id) }
            .sheet(item: $sheet) { current in
                NavigationStack {
                    Group {
                        switch current {
                        case .contacts:
                            ContactsView(add: { sheet = .add }, invite: { sheet = .invite }, open: { id in sheet = nil; path.append(id) })
                        case .add:
                            AddContactView(invite: { sheet = .invite }, added: { id in sheet = nil; path.append(id) })
                        case .invite: InvitationView()
                        case .settings: SettingsView()
                        case .calls:
                            ContentUnavailableView("Звонки появятся позже", systemImage: "phone", description: Text("В текущей версии доступны личные текстовые сообщения и заметки."))
                                .navigationTitle("Звонки")
                        }
                    }
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Готово") { sheet = nil } } }
                }.presentationDragIndicator(.visible).tint(Velvet.coral).preferredColorScheme(.dark)
            }
        }
    }
}

private struct ChatRow: View {
    @EnvironmentObject private var store: MessengerStore
    let id: String
    let name: String
    var saved = false
    var body: some View {
        HStack(spacing: 15) {
            Avatar(name: name, saved: saved)
            VStack(alignment: .leading, spacing: 6) {
                Text(name).font(.system(size: 19, weight: .semibold)).foregroundStyle(Velvet.cream).lineLimit(1)
                Text(store.latest(id)?.text ?? (saved ? "Идеи и заметки на устройстве" : "Напиши первым"))
                    .font(.system(size: 15)).foregroundStyle(Velvet.muted).lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 8) {
                if let message = store.latest(id) { Text(clock(message.created)).font(.caption).foregroundStyle(Velvet.muted) }
                if let count = store.state.unread[id], count > 0 {
                    Text(count > 99 ? "99+" : String(count)).font(.caption.weight(.bold)).foregroundStyle(Velvet.background)
                        .padding(7).background(Velvet.coral, in: Circle())
                }
            }
        }.padding(.vertical, 17).padding(.horizontal, 2)
            .overlay(alignment: .bottom) { Rectangle().fill(Velvet.stroke.opacity(0.5)).frame(height: 1).padding(.leading, 74) }
            .contentShape(Rectangle())
    }
}

private func clock(_ milliseconds: Int64) -> String {
    Date(timeIntervalSince1970: Double(milliseconds) / 1000).formatted(date: .omitted, time: .shortened)
}

struct ChatView: View {
    @EnvironmentObject private var store: MessengerStore
    let chatID: String
    @State private var draft = ""
    @State private var sending = false
    @State private var showKey = false
    private var messages: [ChatMessage] { store.messages(chatID) }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    Text(chatID == "saved" ? "Эти заметки сохраняются только на твоём iPhone." : "Сообщения шифруются до отправки. Для переписки добавьте приглашения друг друга.")
                        .font(.caption).foregroundStyle(Velvet.muted).multilineTextAlignment(.center).padding(16)
                    ForEach(messages) { message in
                        HStack {
                            if message.outgoing { Spacer(minLength: 38) }
                            VStack(alignment: .leading, spacing: 7) {
                                Text(message.text).font(.body).foregroundStyle(Velvet.cream).textSelection(.enabled)
                                HStack(spacing: 5) {
                                    Text(clock(message.created))
                                    if message.outgoing {
                                        Text(chatID == "saved" ? "На устройстве" : store.state.outbox[message.id] != nil ? "В очереди" : "Отправлено")
                                    }
                                }.font(.system(size: 10)).foregroundStyle(Velvet.muted).frame(maxWidth: .infinity, alignment: .trailing)
                            }.padding(14).background(message.outgoing ? Velvet.stroke : Velvet.panel, in: RoundedRectangle(cornerRadius: 18))
                            if !message.outgoing { Spacer(minLength: 38) }
                        }.id(message.id)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding(.horizontal, 16).padding(.bottom, 12)
            }
            .background(Velvet.gradient)
            .onAppear {
                draft = store.state.drafts[chatID, default: ""]
                store.markRead(chatID); proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: messages.count) { _, _ in
                store.markRead(chatID)
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    if draft.utf8.count > 12_000 { Text("Сообщение длиннее 12 000 байт").font(.caption).foregroundStyle(Velvet.coral) }
                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Сообщение", text: $draft, axis: .vertical).lineLimit(1 ... 5)
                            .padding(13).background(Velvet.panel, in: RoundedRectangle(cornerRadius: 16))
                            .onChange(of: draft) { _, text in store.setDraft(chatID, text) }
                        Button(action: send) {
                            Label(sending ? "Отправка" : "Отправить", systemImage: "arrow.up")
                                .font(.system(size: 13, weight: .bold)).padding(.vertical, 16).padding(.horizontal, 10)
                                .foregroundStyle(Velvet.background).background(Velvet.coral, in: RoundedRectangle(cornerRadius: 15))
                        }.disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draft.utf8.count > 12_000)
                    }
                }.padding(12).background(Velvet.background)
            }
        }
        .navigationTitle(store.title(chatID)).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if chatID != "saved" {
                ToolbarItem(placement: .topBarTrailing) { Button("Ключ", systemImage: "lock.shield") { showKey = true }.labelStyle(.titleAndIcon).font(.caption) }
            }
        }
        .alert("Ключ контакта", isPresented: $showKey) { Button("Готово", role: .cancel) {} } message: {
            Text("Сверьте этот отпечаток по другому каналу связи:\n\n" + ((try? store.state.peers[chatID]?.keys.fingerprint()) ?? ""))
        }
    }
    private func send() {
        let submitted = draft
        sending = true
        Task {
            if await store.send(submitted, to: chatID), draft == submitted { draft = "" }
            sending = false
        }
    }
}

private struct ContactsView: View {
    @EnvironmentObject private var store: MessengerStore
    let add: () -> Void
    let invite: () -> Void
    let open: (String) -> Void
    var body: some View {
        List {
            Section {
                Button("Добавить контакт", systemImage: "person.badge.plus", action: add)
                Button("Моё приглашение", systemImage: "square.and.arrow.up", action: invite)
            }
            Section("Контакты: \(store.peers.count)") {
                if store.peers.isEmpty { Text("Пока никого нет. Обменяйтесь приглашениями.").foregroundStyle(Velvet.muted) }
                ForEach(store.peers) { peer in
                    Button { open(peer.id) } label: {
                        HStack(spacing: 14) { Avatar(name: peer.name, size: 46); Text(peer.name).foregroundStyle(Velvet.cream) }
                    }
                }
            }
        }.scrollContentBackground(.hidden).background(Velvet.background).navigationTitle("Контакты")
    }
}

private struct AddContactView: View {
    @EnvironmentObject private var store: MessengerStore
    @State private var text = ""
    let invite: () -> Void
    let added: (String) -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Вставь приглашение собеседника").font(.title2.weight(.semibold)).foregroundStyle(Velvet.cream)
                Text("Оно начинается с microchat:. Получи его непосредственно от собеседника.").foregroundStyle(Velvet.muted)
                TextEditor(text: $text).font(.system(.footnote, design: .monospaced)).frame(height: 150)
                    .padding(10).scrollContentBackground(.hidden).background(Velvet.panel, in: RoundedRectangle(cornerRadius: 16))
                    .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel("Приглашение контакта")
                VelvetButton(title: store.busy ? "Проверка ключей…" : "Добавить контакт", symbol: "person.badge.plus", prominent: true) {
                    Task { if let uid = await store.addPeer(text) { added(uid) } }
                }.disabled(store.busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Text("Чтобы сообщения доходили в обе стороны, собеседник тоже должен добавить твоё приглашение.")
                    .font(.subheadline).foregroundStyle(Velvet.muted)
                Button("Показать моё приглашение", systemImage: "square.and.arrow.up", action: invite)
            }.padding(22)
        }.background(Velvet.background).navigationTitle("Новый чат").navigationBarTitleDisplayMode(.inline)
    }
}

private struct InvitationView: View {
    @EnvironmentObject private var store: MessengerStore
    @State private var invitation: String?
    @State private var loading = false
    @State private var copied = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Avatar(name: store.state.owner, size: 80)
                Text(store.state.owner).font(.title2.weight(.semibold)).foregroundStyle(Velvet.cream)
                Text("Отправь приглашение человеку, с которым хочешь переписываться. Затем добавь его приглашение.").foregroundStyle(Velvet.muted)
                if let invitation {
                    ShareLink(item: invitation) {
                        Label("Поделиться приглашением", systemImage: "square.and.arrow.up")
                            .font(.headline).frame(maxWidth: .infinity).padding(18)
                            .foregroundStyle(Velvet.background).background(Velvet.coral, in: RoundedRectangle(cornerRadius: 17))
                    }
                    Button(copied ? "Приглашение скопировано" : "Скопировать приглашение", systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = invitation; copied = true
                    }
                    Text("Отпечаток твоих ключей").font(.caption).foregroundStyle(Velvet.muted)
                    Text(store.fingerprint).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .foregroundStyle(Velvet.cream)
                } else if loading { ProgressView("Подготовка приглашения…").tint(Velvet.coral) }
                else { Button("Повторить", systemImage: "arrow.clockwise") { load() } }
                Text("Приглашение содержит публичные ключи. Приватные ключи остаются на твоём устройстве.").font(.footnote).foregroundStyle(Velvet.muted)
            }.padding(24)
        }.background(Velvet.background).navigationTitle("Моё приглашение").navigationBarTitleDisplayMode(.inline)
            .task { load() }
    }
    private func load() {
        guard !loading else { return }
        loading = true
        Task { invitation = await store.invitation(); loading = false }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var store: MessengerStore
    @State private var name = ""
    var body: some View {
        Form {
            Section("Профиль") {
                TextField("Твоё имя", text: $name).textContentType(.nickname)
                Button("Сохранить имя", systemImage: "checkmark") { store.setOwner(name) }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            Section("Соединение") {
                Label(store.connected ? "Подключено к MicroChat" : "Ожидание соединения", systemImage: "network")
                LabeledContent("Сообщений в очереди", value: String(store.state.outbox.count))
                Button("Повторить соединение", systemImage: "arrow.clockwise") { Task { await store.syncNow() } }
                if !store.syncError.isEmpty { Text(store.syncError).font(.footnote).foregroundStyle(Velvet.coral) }
                Text("Сервер настроен автоматически. Соединение — HTTPS; текст защищён сквозным шифрованием. REALITY в iOS-клиент пока не встроен.")
                    .font(.footnote).foregroundStyle(Velvet.muted)
            }
            Section("Твои ключи") {
                Text(store.fingerprint).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                Text("Сверяй отпечатки с собеседником по другому каналу. Ключи, токены и история сохраняются в зашифрованном хранилище.")
                    .font(.footnote).foregroundStyle(Velvet.muted)
            }
            Section("Текущая версия") {
                Text("MicroChat 0.5 · iPhone · экспериментальная версия")
                Text("Новые сообщения приходят, пока приложение открыто. Фоновых уведомлений, звонков, файлов и восстановления ключей пока нет. Это прототип без независимого аудита и без Double Ratchet.")
                    .font(.footnote).foregroundStyle(Velvet.muted)
            }
        }.scrollContentBackground(.hidden).background(Velvet.background)
            .navigationTitle("Настройки").navigationBarTitleDisplayMode(.inline)
            .onAppear { name = store.state.owner }
    }
}
