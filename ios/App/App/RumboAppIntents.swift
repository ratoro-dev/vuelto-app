import AppIntents
import Foundation

/// "Anotá un gasto en Rumbo" → "¿Qué gastaste?" → "450 en la feria". Se guarda sin abrir la app (y sin señal):
/// queda en el App Group y la app lo convierte en gasto, con el mismo lector de frases, la próxima vez que se abre.
@available(iOS 18.0, *)
struct AnotarGastoIntent: AppIntent {
    static let title: LocalizedStringResource = "Anotar un gasto"
    static let description = IntentDescription("Anota un gasto con una frase, como en WhatsApp: “450 en la feria, efectivo”.")

    @Parameter(title: "Gasto", requestValueDialog: IntentDialog("¿Qué gastaste?"))
    var frase: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = frase.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .result(dialog: "No escuché el gasto. Probá de nuevo.") }
        RumboShared.appendInbox(text)
        return .result(dialog: "Anotado: “\(text)”. Lo vas a ver en Rumbo.")
    }
}

/// "¿Cuánto me queda en Rumbo?": lo que queda del presupuesto del mes, sin abrir la app.
@available(iOS 18.0, *)
struct CuantoMeQuedaIntent: AppIntent {
    static let title: LocalizedStringResource = "Cuánto me queda"
    static let description = IntentDescription("Te dice cuánto te queda del presupuesto del mes.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = RumboShared.loadSnapshot() else {
            return .result(dialog: "Abrí Rumbo una vez para que pueda contarte.")
        }
        if s.over {
            return .result(dialog: "Te pasaste del presupuesto de \(s.month): llevás gastados \(RumboShared.spoken(s.spentText)) de \(RumboShared.spoken(s.budgetText)).")
        }
        return .result(dialog: "Te quedan \(RumboShared.spoken(s.availableText)) del presupuesto de \(s.month). Llevás gastados \(RumboShared.spoken(s.spentText)).")
    }
}

/// "¿Qué vence en Rumbo?": la próxima factura sin pagar.
@available(iOS 18.0, *)
struct ProximoVencimientoIntent: AppIntent {
    static let title: LocalizedStringResource = "Qué vence"
    static let description = IntentDescription("Te dice cuál es la próxima factura sin pagar y cuándo vence.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = RumboShared.loadSnapshot() else {
            return .result(dialog: "Abrí Rumbo una vez para que pueda contarte.")
        }
        guard let bill = s.nextBill else {
            return .result(dialog: "No te queda nada por vencer este mes.")
        }
        let when = bill.dueText.components(separatedBy: " · ").last ?? bill.dueText
        return .result(dialog: "\(bill.name): \(RumboShared.spoken(bill.amountText)), vence \(when).")
    }
}

/// Las frases para Siri y los atajos que aparecen solos en la app Atajos y en Spotlight.
@available(iOS 18.0, *)
struct RumboShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AnotarGastoIntent(),
            phrases: ["Anotar un gasto en \(.applicationName)", "Anotá un gasto en \(.applicationName)", "Registrar un gasto en \(.applicationName)"],
            shortTitle: "Anotar gasto",
            systemImageName: "plus.circle.fill"
        )
        AppShortcut(
            intent: CuantoMeQuedaIntent(),
            phrases: ["Cuánto me queda en \(.applicationName)", "Cuánta plata me queda en \(.applicationName)"],
            shortTitle: "Cuánto me queda",
            systemImageName: "chart.bar.fill"
        )
        AppShortcut(
            intent: ProximoVencimientoIntent(),
            phrases: ["Qué vence en \(.applicationName)", "Próximo vencimiento en \(.applicationName)"],
            shortTitle: "Qué vence",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: DictarGastoIntent(),
            phrases: ["Dictar un gasto en \(.applicationName)"],
            shortTitle: "Dictar gasto",
            systemImageName: "mic.fill"
        )
    }
}
