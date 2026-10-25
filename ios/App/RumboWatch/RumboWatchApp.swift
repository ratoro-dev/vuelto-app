import SwiftUI
import WatchConnectivity
import WidgetKit

/// Rumbo en el Apple Watch: el disponible del mes y registrar un gasto dictado en tres toques.
/// Los datos los manda el iPhone (WatchBridge.swift); lo dictado vuelve al iPhone y se guarda como gasto.
@main
struct RumboWatchApp: App {
    @StateObject private var model = WatchModel.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
}

final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchModel()

    @Published var snapshot: RumboSnapshot?
    /// Lo último dictado en el reloj.
    @Published var lastSent: String?
    /// Dictados que todavía no llegaron al iPhone (por ejemplo, si quedó lejos).
    @Published var waiting = 0
    /// El iPhone está cerca y con la app conectada.
    @Published var reachable = false
    /// El texto que devolvió el iPhone para una grabación.
    @Published var transcript: Transcript?

    struct Transcript: Equatable {
        let id: String
        let text: String
    }

    /// "Sin conexión · 1 en cola" cuando hay dictados esperando al iPhone.
    var statusText: String? {
        if waiting > 0 { return "Sin conexión · \(waiting) en cola" }
        if !reachable { return "Sin conexión con el iPhone" }
        return nil
    }

    override init() {
        super.init()
        snapshot = RumboShared.loadSnapshot()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    /// Manda lo dictado al iPhone. `transferUserInfo` lo guarda en cola si el iPhone no está cerca.
    func send(_ phrase: String, category: String? = nil) {
        let text = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        var info: [String: Any] = ["phrase": text, "at": ISO8601DateFormatter().string(from: Date())]
        // La categoría elegida en "Cambiar categoría" gana sobre la que entienda el iPhone
        if let category, category != QuickParse.parse(text).category { info["category"] = category }
        WCSession.default.transferUserInfo(info)
        lastSent = text
        waiting = pending(WCSession.default)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.reachable = session.isReachable }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let left = pending(session)
        DispatchQueue.main.async {
            self.reachable = session.isReachable
            self.waiting = left
        }
        if let json = session.receivedApplicationContext["snapshot"] as? String {
            DispatchQueue.main.async { self.apply(json) }
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        guard let json = context["snapshot"] as? String else { return }
        // Si llegó un resumen nuevo, el iPhone está conectado: se recalcula la cola
        let left = pending(session)
        DispatchQueue.main.async {
            self.apply(json)
            self.waiting = left
        }
    }

    /// Lo que falta entregar al iPhone. La transferencia que termina todavía figura en la lista durante su aviso.
    private func pending(_ session: WCSession, excluding done: AnyObject? = nil) -> Int {
        session.outstandingUserInfoTransfers.filter { $0 !== done && $0.isTransferring }.count
            + session.outstandingFileTransfers.filter { $0 !== done && $0.isTransferring }.count
    }

    /// Manda la grabación al iPhone para que la convierta en texto. `autosave`: guardarla sin confirmar.
    func sendRecording(_ url: URL, id: String, autosave: Bool) {
        WCSession.default.transferFile(url, metadata: ["id": id, "at": ISO8601DateFormatter().string(from: Date()), "autosave": autosave])
        waiting = pending(WCSession.default)
    }

    /// La confirmación no llegó a tiempo: el iPhone guarda el gasto apenas entienda la grabación.
    func autosave(_ id: String) {
        WCSession.default.transferUserInfo(["autosave": id])
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        let left = pending(session, excluding: error == nil ? fileTransfer : nil)
        DispatchQueue.main.async { self.waiting = left }
        if error == nil { try? FileManager.default.removeItem(at: fileTransfer.file.fileURL) }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receiveTranscript(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        receiveTranscript(userInfo)
    }

    private func receiveTranscript(_ info: [String: Any]) {
        guard let id = info["id"] as? String, let text = info["transcript"] as? String else { return }
        DispatchQueue.main.async { self.transcript = Transcript(id: id, text: text) }
    }

    func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        let left = pending(session, excluding: error == nil ? userInfoTransfer : nil)
        DispatchQueue.main.async { self.waiting = left }
    }

    /// Guarda el resumen en el App Group del reloj, para que lo lean las complicaciones.
    private func apply(_ json: String) {
        RumboShared.saveSnapshot(json: json)
        snapshot = RumboShared.loadSnapshot()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
