import AppIntents
import SwiftUI
import WidgetKit

/// Control "Registrar gasto" para el Centro de control, la pantalla bloqueada y el botón de Acción:
/// abre el dictado directo.
struct RegistrarGastoControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "uy.rumbo.app.dictar") {
            ControlWidgetButton(action: DictarGastoIntent()) {
                Label("Registrar gasto", systemImage: "mic.fill")
            }
        }
        .displayName("Registrar gasto")
        .description("Abre Rumbo escuchando para dictar un gasto.")
    }
}
