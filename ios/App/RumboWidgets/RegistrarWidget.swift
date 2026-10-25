import SwiftUI
import WidgetKit

/// Registrar a un toque. Chico: Voz, Texto, Foto y QR. Pantalla bloqueada: botón de dictado.
struct RegistrarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "uy.rumbo.app.registrar", provider: RumboProvider()) { _ in
            RegistrarView()
        }
        .configurationDisplayName("Registrar")
        .description("Registrá un gasto por voz, texto, foto o el QR de la DGI.")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct RegistrarView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if family == .accessoryCircular {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "mic")
                    .font(.system(size: 22, weight: .medium))
            }
            .containerBackground(for: .widget) { Color.clear }
            .widgetURL(RumboLink.dictar)
        } else {
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow {
                    tile("Voz", icon: "mic", url: RumboLink.dictar)
                    tile("Texto", icon: "textformat", url: RumboLink.texto)
                }
                GridRow {
                    tile("Foto", icon: "camera", url: RumboLink.foto)
                    tile("QR", icon: "qrcode", url: RumboLink.qr, filled: true)
                }
            }
            .containerBackground(.white, for: .widget)
        }
    }

    private func tile(_ title: String, icon: String, url: URL, filled: Bool = false) -> some View {
        Link(destination: url) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .regular))
                Text(title)
                    .font(.system(size: 11, weight: .medium))
            }
            .foregroundStyle(filled ? .white : .primary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(filled ? RumboColor.accent : RumboColor.chip, in: RoundedRectangle(cornerRadius: 14))
        }
    }
}
