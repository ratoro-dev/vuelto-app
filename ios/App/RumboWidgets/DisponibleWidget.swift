import SwiftUI
import WidgetKit

/// Disponible del mes. Chico: monto y % usado. Mediano: además "+ Gasto" y los últimos gastos.
/// En la pantalla bloqueada: anillo con el % usado y "disponible · tarjeta vence el viernes".
struct DisponibleWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "uy.rumbo.app.disponible", provider: RumboProvider()) { entry in
            DisponibleView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Disponible")
        .description("Lo que te queda del mes. El mediano suma los últimos gastos y un acceso para registrar.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DisponibleView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: RumboSnapshot

    private var usedPercent: Int { Int((snapshot.usedShare * 100).rounded()) }
    private var usedText: String { snapshot.usedText ?? "\(usedPercent)% de \(snapshot.month) usado" }
    private var barColor: Color { snapshot.over ? RumboColor.warn : RumboColor.accent }

    var body: some View {
        switch family {
        case .systemMedium: medium
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .accessoryInline: inline
        default: small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Disponible")
                .font(.system(size: 12))
                .foregroundStyle(RumboColor.muted)
            Text(snapshot.availableText)
                .font(.system(size: 28, weight: .semibold))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .foregroundStyle(snapshot.over ? RumboColor.warn : .primary)
            Spacer(minLength: 0)
            UsedBar(share: snapshot.usedShare, color: barColor)
            Text(usedText)
                .font(.system(size: 11))
                .foregroundStyle(RumboColor.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(.white, for: .widget)
        .widgetURL(RumboLink.inicio)
    }

    private var medium: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Disponible")
                    .font(.system(size: 12))
                    .foregroundStyle(RumboColor.muted)
                Text(snapshot.availableText)
                    .font(.system(size: 24, weight: .semibold))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundStyle(snapshot.over ? RumboColor.warn : .primary)
                UsedBar(share: snapshot.usedShare, color: barColor)
                Spacer(minLength: 0)
                Link(destination: RumboLink.dictar) {
                    Text("+ Gasto")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .background(RumboColor.accent, in: Capsule())
                }
            }
            .frame(width: 120)

            Rectangle()
                .fill(RumboColor.track)
                .frame(width: 1)

            VStack(alignment: .leading, spacing: 0) {
                if snapshot.today.isEmpty {
                    Text("Sin gastos hoy")
                        .font(.system(size: 13))
                        .foregroundStyle(RumboColor.muted)
                    Spacer(minLength: 0)
                } else {
                    ForEach(Array(snapshot.today.prefix(3).enumerated()), id: \.offset) { _, item in
                        HStack {
                            Text(item.name)
                                .font(.system(size: 13))
                                .lineLimit(1)
                            Spacer(minLength: 6)
                            Text(item.amountText)
                                .font(.system(size: 13))
                                .foregroundStyle(RumboColor.muted)
                        }
                        Spacer(minLength: 0)
                    }
                }
                if snapshot.pendingCount > 0 {
                    Text("\(snapshot.pendingCount) sin sincronizar")
                        .font(.system(size: 11))
                        .foregroundStyle(RumboColor.warn)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .containerBackground(.white, for: .widget)
        .widgetURL(RumboLink.inicio)
    }

    private var circular: some View {
        Gauge(value: min(1, max(0, snapshot.usedShare))) {
            EmptyView()
        } currentValueLabel: {
            Text("\(usedPercent)%")
                .font(.system(size: 12, weight: .semibold))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        .widgetURL(RumboLink.inicio)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(snapshot.availableText) disponible")
                .font(.system(size: 13, weight: .semibold))
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            if let bill = snapshot.nextBill {
                Text(bill.shortText ?? bill.name)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        .widgetURL(RumboLink.inicio)
    }

    private var inline: some View {
        Text("\(snapshot.availableText) disponible")
            .containerBackground(for: .widget) { Color.clear }
    }
}
