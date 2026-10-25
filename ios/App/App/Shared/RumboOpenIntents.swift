import AppIntents
import Foundation

/// Abre Rumbo escuchando: lo usan el Centro de control, el botón de acción, la pantalla bloqueada y Siri.
/// Está en la app y en la extensión de widgets, porque los controles corren en la extensión.
@available(iOS 18.0, *)
struct DictarGastoIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Rumbo escuchando, para dictar un gasto o toda la compra.")

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "rumbo://registrar?modo=voz&escuchar=1")!))
    }
}

/// Abre Rumbo con el lector del QR de la DGI.
@available(iOS 18.0, *)
struct EscanearTicketIntent: AppIntent {
    static let title: LocalizedStringResource = "Escanear un ticket"
    static let description = IntentDescription("Abre Rumbo para leer el QR de la DGI de un ticket.")

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "rumbo://registrar?modo=qr")!))
    }
}
