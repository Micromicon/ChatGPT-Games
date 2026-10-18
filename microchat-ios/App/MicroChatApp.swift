import SwiftUI

@main
@MainActor
struct MicroChatApp: App {
    @StateObject private var store = MessengerStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ZStack {
                Velvet.background.ignoresSafeArea()
                if let fatal = store.fatalError {
                    ContentUnavailableView("Хранилище недоступно", systemImage: "lock.shield", description: Text(fatal))
                } else if store.state.owner.isEmpty {
                    OnboardingView().environmentObject(store)
                } else {
                    HomeView().environmentObject(store)
                }
                if scenePhase != .active {
                    Velvet.background.ignoresSafeArea()
                        .overlay { Label("MicroChat", systemImage: "lock.fill").font(.title2).foregroundStyle(Velvet.cream) }
                        .accessibilityHidden(true)
                }
            }
            .preferredColorScheme(.dark)
            .tint(Velvet.coral)
            .task { store.setForeground(scenePhase == .active) }
            .onChange(of: scenePhase) { _, phase in store.setForeground(phase == .active) }
            .alert("MicroChat", isPresented: Binding(get: { store.alert != nil }, set: { if !$0 { store.alert = nil } })) {
                Button("Понятно", role: .cancel) { store.alert = nil }
            } message: { Text(store.alert ?? "") }
        }
    }
}
