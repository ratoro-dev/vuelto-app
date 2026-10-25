import SwiftUI
import WidgetKit

/// Widgets de Rumbo como en la propuesta (artefacto "Rumbo — propuesta app", Widgets): disponible (chico y
/// mediano con los últimos gastos), registrar (chico), pantalla bloqueada y el control "Registrar gasto".
@main
struct RumboWidgetsBundle: WidgetBundle {
    var body: some Widget {
        DisponibleWidget()
        RegistrarWidget()
        RegistrarGastoControl()
    }
}

/// Colores de la app (src/theme/variables.css).
enum RumboColor {
    static let accent = Color(red: 0x16 / 255, green: 0x81 / 255, blue: 0x5F / 255)
    static let warn = Color(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255)
    static let muted = Color(red: 0x6B / 255, green: 0x6B / 255, blue: 0x70 / 255)
    static let track = Color(red: 0xE5 / 255, green: 0xE5 / 255, blue: 0xEA / 255)
    static let chip = Color(red: 0xF2 / 255, green: 0xF2 / 255, blue: 0xF7 / 255)
}

/// Links que abren la app (los resuelve src/domain/deepLinks.ts).
enum RumboLink {
    static let inicio = URL(string: "rumbo://inicio")!
    static let dictar = URL(string: "rumbo://registrar?modo=voz&escuchar=1")!
    static let texto = URL(string: "rumbo://registrar?modo=texto")!
    static let foto = URL(string: "rumbo://registrar?modo=foto")!
    static let qr = URL(string: "rumbo://registrar?modo=qr")!
}

struct RumboEntry: TimelineEntry {
    let date: Date
    let snapshot: RumboSnapshot
}

/// Lee el resumen que dejó la app. A medianoche pide otro, porque "hoy" y "vence mañana" cambian.
struct RumboProvider: TimelineProvider {
    func placeholder(in context: Context) -> RumboEntry {
        RumboEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (RumboEntry) -> Void) {
        completion(RumboEntry(date: .now, snapshot: context.isPreview ? .placeholder : (RumboShared.loadSnapshot() ?? .placeholder)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RumboEntry>) -> Void) {
        let entry = RumboEntry(date: .now, snapshot: RumboShared.loadSnapshot() ?? .placeholder)
        let midnight = Calendar.current.startOfDay(for: Date.now.addingTimeInterval(86_400))
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

/// La barra fina de lo usado del mes.
struct UsedBar: View {
    let share: Double
    var color: Color = RumboColor.accent

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(RumboColor.track)
                Capsule().fill(color).frame(width: geo.size.width * min(1, max(0, share)))
            }
        }
        .frame(height: 4)
    }
}
