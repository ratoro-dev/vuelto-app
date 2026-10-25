import Capacitor
import Foundation
import WidgetKit

/// Puente entre la app y los widgets: guarda el resumen en el App Group (y se lo manda al reloj) y entrega lo
/// anotado con Siri o dictado en el Apple Watch.
@objc(RumboWidgetsPlugin)
public class RumboWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RumboWidgetsPlugin"
    public let jsName = "RumboWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeInbox", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        print("RumboWidgets: App Group \(RumboShared.hasAppGroup ? "ok" : "sin acceso") · anotados con Siri: \(RumboShared.inboxCount())")
        WatchBridge.shared.activate()
        NotificationCenter.default.addObserver(forName: WatchBridge.inboxChanged, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("inbox", data: [:])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let json = call.getString("snapshot") else {
            call.reject("Falta el resumen para los widgets.")
            return
        }
        RumboShared.saveSnapshot(json: json)
        WatchBridge.shared.send(snapshot: json)
        WidgetCenter.shared.reloadAllTimelines()
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadAllControls() }
        call.resolve()
    }

    @objc func takeInbox(_ call: CAPPluginCall) {
        let items = RumboShared.takeInbox().map { item -> [String: Any] in
            var out: [String: Any] = ["phrase": item.phrase, "at": item.at]
            if let category = item.category { out["category"] = category }
            return out
        }
        if !items.isEmpty { print("RumboWidgets: \(items.count) anotado(s) con Siri") }
        call.resolve(["items": items])
    }
}
