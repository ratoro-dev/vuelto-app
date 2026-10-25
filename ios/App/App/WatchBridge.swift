import Foundation
import WatchConnectivity

/// Conexión con la app del Apple Watch (WatchConnectivity):
/// - le manda el mismo resumen que leen los widgets, para la app y las complicaciones del reloj;
/// - recibe la grabación del dictado, la convierte en texto en el teléfono y se la devuelve para confirmar;
/// - recibe el gasto confirmado y lo deja en la bandeja de entrada, como lo anotado con Siri.
/// Se activa al arrancar la app (AppDelegate), porque el reloj puede despertarla en segundo plano.
final class WatchBridge: NSObject, WCSessionDelegate {
    static let shared = WatchBridge()
    /// Se avisa cuando llega un gasto dictado en el reloj, para que la app lo guarde enseguida.
    static let inboxChanged = Notification.Name("RumboWatchInboxChanged")

    private var pendingSnapshot: String?
    private var activated = false
    /// Grabaciones que hay que guardar sin confirmar (el reloj no esperó la respuesta).
    private var autosaveIds = Set<String>()
    /// Lo entendido de cada grabación, por si el reloj después pide guardarla sin confirmar.
    private var transcripts: [String: (text: String, at: String?)] = [:]

    func activate() {
        guard WCSession.isSupported(), !activated else { return }
        activated = true
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Manda el resumen al reloj. Si la sesión todavía no está activa, lo manda cuando lo esté.
    func send(snapshot json: String) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else {
            pendingSnapshot = json
            return
        }
        guard session.isPaired, session.isWatchAppInstalled else { return }
        do {
            try session.updateApplicationContext(["snapshot": json])
        } catch {
            print("WatchBridge: no se pudo mandar el resumen \(error)")
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        print("WatchBridge: reloj \(session.isPaired ? "emparejado" : "sin emparejar") · app \(session.isWatchAppInstalled ? "instalada" : "sin instalar")")
        if let json = pendingSnapshot {
            pendingSnapshot = nil
            send(snapshot: json)
        }
    }

    /// Lo confirmado en el reloj llega por `transferUserInfo`, que se entrega aunque el iPhone estuviera lejos.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let id = userInfo["autosave"] as? String {
            DispatchQueue.main.async { self.autosave(id) }
            return
        }
        guard let phrase = userInfo["phrase"] as? String else { return }
        RumboShared.appendInbox(phrase, at: userInfo["at"] as? String, category: userInfo["category"] as? String)
        print("WatchBridge: gasto dictado en el reloj")
        NotificationCenter.default.post(name: Self.inboxChanged, object: nil)
    }

    /// La grabación del dictado: se entiende en el teléfono y el texto vuelve al reloj para confirmar.
    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        let id = file.metadata?["id"] as? String ?? UUID().uuidString
        let at = file.metadata?["at"] as? String
        let autosave = file.metadata?["autosave"] as? Bool ?? false
        // El archivo se borra al volver de este método: se copia antes
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("reloj-\(id).m4a")
        try? FileManager.default.removeItem(at: copy)
        do {
            try FileManager.default.copyItem(at: file.fileURL, to: copy)
        } catch {
            print("WatchBridge: no se pudo leer la grabación \(error)")
            return
        }
        if autosave { DispatchQueue.main.async { self.autosaveIds.insert(id) } }
        Task {
            let text = await FileTranscriber.transcribe(copy)
            try? FileManager.default.removeItem(at: copy)
            print("WatchBridge: grabación del reloj → \"\(text)\"")
            await MainActor.run { self.deliver(id: id, text: text, at: at, session: session) }
        }
    }

    private func deliver(id: String, text: String, at: String?, session: WCSession) {
        if autosaveIds.remove(id) != nil {
            save(text, at: at)
            return
        }
        transcripts[id] = (text, at)
        let payload: [String: Any] = ["id": id, "transcript": text]
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { _ in session.transferUserInfo(payload) }
        } else {
            session.transferUserInfo(payload)
        }
    }

    private func autosave(_ id: String) {
        if let pending = transcripts.removeValue(forKey: id) {
            save(pending.text, at: pending.at)
        } else {
            autosaveIds.insert(id)
        }
    }

    private func save(_ text: String, at: String?) {
        guard !text.isEmpty else { return }
        RumboShared.appendInbox(text, at: at)
        NotificationCenter.default.post(name: Self.inboxChanged, object: nil)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Cambio de reloj: se vuelve a activar con el nuevo
        session.activate()
    }
}
