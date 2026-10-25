import SwiftUI

/// Colores de la propuesta para el reloj (artefacto "Rumbo — propuesta app", Apple Watch).
enum WatchColor {
    static let button = Color(red: 0x1F / 255, green: 0x7A / 255, blue: 0x4D / 255)
    static let bar = Color(red: 0x30 / 255, green: 0xD1 / 255, blue: 0x58 / 255)
    static let track = Color(red: 0x2C / 255, green: 0x2C / 255, blue: 0x2E / 255)
    static let muted = Color(red: 0x9A / 255, green: 0x9A / 255, blue: 0xA0 / 255)
    static let queued = Color(red: 0xFF / 255, green: 0xB3 / 255, blue: 0x40 / 255)
}

/// Registrar desde la muñeca en tres toques: dictar → confirmar → guardado.
/// Solo lo esencial: el disponible y registrar. Presupuesto, metas y deudas quedan en el iPhone.
struct ContentView: View {
    @EnvironmentObject private var model: WatchModel
    @State private var draft: Draft?
    @State private var saved: Bool?
    @State private var dictating = false

    struct Draft: Hashable {
        let phrase: String
        var category: String
    }

    var body: some View {
        NavigationStack {
            InicioView { dictating = true }
            .navigationDestination(isPresented: $dictating) {
                DictadoView { text in
                    dictating = false
                    draft = Draft(phrase: text, category: QuickParse.parse(text).category)
                } onQueued: {
                    dictating = false
                    saved = false
                } onCancel: {
                    dictating = false
                }
            }
            .navigationDestination(item: $draft) { _ in
                ConfirmarView(draft: $draft) { final in
                    model.send(final.phrase, category: final.category)
                    draft = nil
                    saved = model.reachable
                }
            }
        }
        .fullScreenCover(item: $saved) { delivered in
            ListoView(delivered: delivered) { saved = nil }
        }
        // El "+" de la esfera abre el dictado directo
        .onOpenURL { url in
            if url.host == "dictar" { dictating = true }
        }
    }
}

extension Bool: @retroactive Identifiable {
    public var id: Bool { self }
}

/// 1 · Inicio: el disponible del mes y el botón para dictar.
struct InicioView: View {
    @EnvironmentObject private var model: WatchModel
    /// Un toque: abre la pantalla de dictado.
    let onDictate: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Disponible")
                .font(.system(size: 13))
                .foregroundStyle(WatchColor.muted)
            Text(model.snapshot?.availableText ?? "—")
                .font(.system(size: 30, weight: .semibold))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(WatchColor.track)
                    Capsule().fill(WatchColor.bar).frame(width: geo.size.width * (model.snapshot?.usedShare ?? 0))
                }
            }
            .frame(height: 4)

            Spacer(minLength: 6)

            Button(action: onDictate) {
                dictateLabel
            }
            .buttonStyle(.plain)

            if let status = model.statusText {
                Text(status)
                    .font(.system(size: 11))
                    .foregroundStyle(WatchColor.queued)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 4)
    }

    private var dictateLabel: some View {
        Label("Dictar gasto", systemImage: "mic.fill")
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(WatchColor.button, in: Capsule())
            .foregroundStyle(.white)
    }
}

/// 3 · Confirmar: el monto entendido, la categoría y el medio de pago.
struct ConfirmarView: View {
    @Binding var draft: ContentView.Draft?
    let onSave: (ContentView.Draft) -> Void

    var body: some View {
        if let current = draft {
            let parsed = QuickParse.parse(current.phrase)
            ScrollView {
                VStack(spacing: 6) {
                    Text(parsed.count > 0 ? QuickParse.pesos(parsed.total) : "Sin monto")
                        .font(.system(size: 30, weight: .semibold))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text([current.category, parsed.payment].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(WatchColor.muted)
                    if parsed.count > 1 {
                        Text("\(parsed.count) gastos")
                            .font(.system(size: 12))
                            .foregroundStyle(WatchColor.muted)
                    }
                    Text("“\(current.phrase)”")
                        .font(.system(size: 12))
                        .foregroundStyle(WatchColor.muted)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .padding(.vertical, 2)

                    Button {
                        onSave(current)
                    } label: {
                        Text("Guardar")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(WatchColor.button, in: Capsule())
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        CategoriaView(selected: current.category) { category in
                            draft?.category = category
                        }
                    } label: {
                        Text("Cambiar categoría")
                            .font(.system(size: 15))
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(WatchColor.track, in: Capsule())
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct CategoriaView: View {
    @Environment(\.dismiss) private var dismiss
    let selected: String
    let onPick: (String) -> Void

    var body: some View {
        List(QuickParse.categories, id: \.self) { category in
            Button {
                onPick(category)
                dismiss()
            } label: {
                HStack {
                    Text(category)
                    Spacer()
                    if category == selected { Image(systemName: "checkmark").foregroundStyle(WatchColor.bar) }
                }
            }
        }
        .navigationTitle("Categoría")
    }
}

/// 4 · Listo.
struct ListoView: View {
    let delivered: Bool
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(WatchColor.button, in: Circle())
            Text("Guardado")
                .font(.system(size: 16, weight: .semibold))
            Text(delivered ? "Ya está en el iPhone" : "Se pasa al iPhone\ncuando se conecten")
                .font(.system(size: 12))
                .foregroundStyle(WatchColor.muted)
                .multilineTextAlignment(.center)
        }
        .task {
            try? await Task.sleep(for: .seconds(2.5))
            onDone()
        }
        .onTapGesture { onDone() }
    }
}
