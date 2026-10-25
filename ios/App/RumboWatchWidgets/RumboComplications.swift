import SwiftUI
import WidgetKit

/// Complicaciones de Rumbo para las esferas del Apple Watch, como en la propuesta: el anillo con el
/// disponible y el "+" para registrar. Leen el resumen que la app del reloj guardó al recibirlo del iPhone.
@main
struct RumboComplications: WidgetBundle {
    var body: some Widget {
        DisponibleComplication()
        RegistrarComplication()
    }
}

/// Verde de la propuesta para el reloj.
private let accent = Color(red: 0x30 / 255, green: 0xD1 / 255, blue: 0x58 / 255)

/// "12,4k" para que el disponible entre en el anillo.
private func short(_ n: Double) -> String {
    let sign = n < 0 ? "−" : ""
    let v = abs(n)
    if v < 1000 { return "\(sign)\(Int(v.rounded()))" }
    let k = v / 1000
    let text = k < 100 ? String(format: "%.1f", (k * 10).rounded(.down) / 10).replacingOccurrences(of: ".", with: ",") : "\(Int(k))"
    return "\(sign)\(text.replacingOccurrences(of: ",0", with: ""))k"
}

struct ComplicationEntry: TimelineEntry {
    let date: Date
    let snapshot: RumboSnapshot
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(ComplicationEntry(date: .now, snapshot: context.isPreview ? .placeholder : (RumboShared.loadSnapshot() ?? .placeholder)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        let entry = ComplicationEntry(date: .now, snapshot: RumboShared.loadSnapshot() ?? .placeholder)
        let midnight = Calendar.current.startOfDay(for: Date.now.addingTimeInterval(86_400))
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

struct DisponibleComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "uy.rumbo.app.watch.disponible", provider: ComplicationProvider()) { entry in
            DisponibleComplicationView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Disponible")
        .description("Lo que te queda del presupuesto del mes.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}

struct DisponibleComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: RumboSnapshot

    private var left: Double { max(0, 1 - snapshot.usedShare) }

    var body: some View {
        content.containerBackground(for: .widget) { Color.clear }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("Disponible · \(snapshot.month)")
                    .font(.caption2)
                    .foregroundStyle(accent)
                Text(snapshot.availableText)
                    .font(.headline)
                    .minimumScaleFactor(0.6)
                Gauge(value: snapshot.usedShare) { EmptyView() }
                    .gaugeStyle(.accessoryLinearCapacity)
                    .tint(accent)
            }
        case .accessoryInline:
            Text("\(snapshot.availableText) disponibles")
        case .accessoryCorner:
            Text("\(Int((left * 100).rounded()))%")
                .widgetLabel {
                    Gauge(value: left) { EmptyView() }
                        .tint(accent)
                }
        default:
            // Anillo con lo usado del mes y, adentro, lo que queda
            Gauge(value: snapshot.usedShare) {
                EmptyView()
            } currentValueLabel: {
                Text(short(snapshot.available))
                    .font(.system(size: 12, weight: .semibold))
                    .minimumScaleFactor(0.6)
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(accent)
        }
    }
}

/// "+" en la esfera: abre Rumbo para dictar un gasto.
struct RegistrarComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "uy.rumbo.app.watch.registrar", provider: ComplicationProvider()) { _ in
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(accent)
            }
            .containerBackground(for: .widget) { Color.clear }
            .widgetURL(URL(string: "rumbo://dictar"))
        }
        .configurationDisplayName("Registrar gasto")
        .description("Abre Rumbo para dictar un gasto.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}
