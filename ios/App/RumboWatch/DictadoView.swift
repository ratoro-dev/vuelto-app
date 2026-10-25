import SwiftUI

/// 2 · Dictado: graba con un toque, como en la propuesta ("Escuchando…" con las ondas). El iPhone convierte
/// la voz en texto dentro del teléfono y lo devuelve; si está lejos, la grabación queda en cola y el gasto
/// se guarda cuando se conecten.
struct DictadoView: View {
    @EnvironmentObject private var model: WatchModel
    @StateObject private var recorder = Recorder()
    let onText: (String) -> Void
    let onQueued: () -> Void
    let onCancel: () -> Void

    enum Phase: Equatable {
        case starting, listening, understanding, failed(String)
    }

    @State private var phase: Phase = .starting
    @State private var recordingId: String?

    var body: some View {
        VStack(spacing: 14) {
            switch phase {
            case .starting, .listening:
                HStack(alignment: .center, spacing: 4) {
                    ForEach(Array(recorder.levels.enumerated()), id: \.offset) { _, level in
                        Capsule()
                            .fill(WatchColor.bar)
                            .frame(width: 4, height: 6 + 30 * level)
                    }
                }
                .frame(height: 40)
                .animation(.easeOut(duration: 0.08), value: recorder.levels)
                Text("Escuchando…")
                    .font(.system(size: 12))
                    .foregroundStyle(WatchColor.muted)
                Button {
                    recorder.stop()
                } label: {
                    Text("Listo")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(WatchColor.button, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            case .understanding:
                ProgressView()
                Text("Entendiendo…")
                    .font(.system(size: 12))
                    .foregroundStyle(WatchColor.muted)
            case .failed(let message):
                Text(message)
                    .font(.system(size: 14))
                    .multilineTextAlignment(.center)
                Button {
                    Task { await start() }
                } label: {
                    Text("Probar de nuevo")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(WatchColor.button, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                // Sin micrófono, queda el teclado del sistema
                TextFieldLink(prompt: Text("¿Qué gastaste?")) {
                    Text("Escribirlo")
                        .font(.system(size: 13))
                        .foregroundStyle(WatchColor.muted)
                } onSubmit: { text in
                    let phrase = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !phrase.isEmpty { onText(phrase) }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 4)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") {
                    recorder.cancel()
                    recordingId = nil
                    onCancel()
                }
            }
        }
        .task { await start() }
        .onChange(of: model.transcript) { _, transcript in
            guard phase == .understanding, let transcript, transcript.id == recordingId else { return }
            recordingId = nil
            if transcript.text.isEmpty {
                phase = .failed("No te entendí. Probá de nuevo.")
            } else {
                onText(transcript.text)
            }
        }
    }

    @MainActor
    private func start() async {
        phase = .starting
        recorder.onFinish = { url in finished(url) }
        if await recorder.start() {
            phase = .listening
        } else {
            phase = .failed("Permití el micrófono para Rumbo en Ajustes del reloj.")
        }
    }

    private func finished(_ url: URL?) {
        guard let url else {
            phase = .failed("No te escuché. Probá de nuevo.")
            return
        }
        let id = UUID().uuidString
        // Sin el iPhone cerca no hay quién lo entienda ahora: queda en cola y se guarda solo al conectarse
        guard model.reachable else {
            model.sendRecording(url, id: id, autosave: true)
            onQueued()
            return
        }
        recordingId = id
        phase = .understanding
        model.sendRecording(url, id: id, autosave: false)
        Task {
            try? await Task.sleep(for: .seconds(12))
            guard recordingId == id else { return }
            // El iPhone no respondió a tiempo: que lo guarde cuando lo entienda
            recordingId = nil
            model.autosave(id)
            onQueued()
        }
    }
}
