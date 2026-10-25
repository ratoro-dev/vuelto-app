import Capacitor
import Foundation
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Lee un ticket de papel (feria, almacén sin QR) con el modelo de Apple Intelligence, dentro del teléfono.
/// Necesita iOS 27 y un iPhone con Apple Intelligence activado; si no, la app sigue con la carga a mano.
@objc(PaperVisionPlugin)
public class PaperVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PaperVisionPlugin"
    public let jsName = "PaperVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        // Queda en la consola de Xcode: dice si este iPhone puede leer papeles solo.
        print("PaperVision: modelo \(Self.status())")
    }

    @objc func availability(_ call: CAPPluginCall) {
        call.resolve(["status": Self.status()])
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let dataUrl = call.getString("image"), let image = Self.cgImage(fromDataUrl: dataUrl) else {
            call.reject("No se pudo abrir la foto.")
            return
        }
        #if canImport(FoundationModels)
        if #available(iOS 27.0, *) {
            Task {
                do {
                    let started = Date()
                    let reading = try await PaperReading.read(image, rules: call.getString("rules"))
                    #if DEBUG
                    // Capacitor corta sus logs a ~256 caracteres; esto deja la lectura completa en la consola.
                    if let json = try? JSONSerialization.data(withJSONObject: reading, options: [.sortedKeys]) {
                        print("PaperVision: leído en \(String(format: "%.1f", Date().timeIntervalSince(started))) s -> \(String(decoding: json, as: UTF8.self))")
                    }
                    #endif
                    call.resolve(reading)
                } catch {
                    print("PaperVision: error \(error)")
                    call.reject("No se pudo leer el papel: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.unavailable("Hace falta iOS 27 con Apple Intelligence.")
    }

    /// available · noVision · deviceNotEligible · appleIntelligenceNotEnabled · modelNotReady · unavailable · osTooOld
    static func status() -> String {
        #if canImport(FoundationModels)
        if #available(iOS 27.0, *) {
            let model = SystemLanguageModel.default
            switch model.availability {
            case .available:
                return model.capabilities.contains(.vision) ? "available" : "noVision"
            case .unavailable(.deviceNotEligible):
                return "deviceNotEligible"
            case .unavailable(.appleIntelligenceNotEnabled):
                return "appleIntelligenceNotEnabled"
            case .unavailable(.modelNotReady):
                return "modelNotReady"
            case .unavailable:
                return "unavailable"
            }
        }
        #endif
        return "osTooOld"
    }

    /// La foto llega como data URL JPEG ya reducido y orientado por la parte web (services/photo.ts).
    static func cgImage(fromDataUrl value: String) -> CGImage? {
        let base64 = value.components(separatedBy: ",").last ?? value
        guard let data = Data(base64Encoded: base64), let image = UIImage(data: data) else { return nil }
        return image.cgImage
    }
}

#if canImport(FoundationModels)
@available(iOS 27.0, *)
@Generable(description: "Lo que está escrito en un ticket de compra en papel")
struct PaperReceipt {
    @Guide(description: "Nombre del comercio o del puesto si aparece escrito; vacío si no aparece")
    var store: String
    @Guide(description: "Cada artículo con su precio, en el mismo orden que en el papel. Sin la línea del total.")
    var items: [PaperReceiptItem]
    @Guide(description: "El total escrito en el papel, en pesos; 0 si el papel no tiene total")
    var total: Double
}

@available(iOS 27.0, *)
@Generable(description: "Un renglón del ticket")
struct PaperReceiptItem {
    @Guide(description: "Solo el producto, copiado letra por letra como está en el papel y sin el precio, aunque sea una abreviatura, por ejemplo «BON» o «PLAT»")
    var written: String
    @Guide(description: "El producto que creés que es, en palabras normales, por ejemplo «Boniato»")
    var name: String
    @Guide(description: "El precio del renglón, en pesos uruguayos")
    var amount: Double
    @Guide(description: "true si el precio no se lee bien y lo estás adivinando; false si se lee claro")
    var doubtful: Bool
}

@available(iOS 27.0, *)
enum PaperReading {
    /// `rules`: lo que la app aprendió de este puesto a partir de tickets que la persona corrigió.
    static func read(_ image: CGImage, rules: String?) async throws -> [String: Any] {
        var instructions = """
        Leés tickets de compra uruguayos sin QR: papelitos de la feria escritos a mano, \
        boletas de almacén o recibos impresos. Los montos están en pesos uruguayos: \
        la coma separa los decimales y el punto separa los miles ("1.046,40"). \
        No inventes artículos ni montos; si un renglón no se lee, dejalo afuera.
        """
        if let rules, !rules.isEmpty {
            instructions += "\n\n" + rules
        }
        let session = LanguageModelSession(instructions: instructions)
        // Greedy: la misma foto da siempre la misma lectura. Con muestreo aleatorio los montos
        // cambiaban entre lecturas y las reglas aprendidas no coincidían.
        let response = try await session.respond(generating: PaperReceipt.self, options: GenerationOptions(samplingMode: .greedy)) {
            "Extraé el comercio, cada artículo con su precio y el total de este ticket."
            Attachment(image)
        }
        let receipt = response.content
        return [
            "store": receipt.store,
            "items": receipt.items.map { ["written": $0.written, "name": $0.name, "amount": $0.amount, "doubtful": $0.doubtful] },
            "total": receipt.total,
        ]
    }
}
#endif
