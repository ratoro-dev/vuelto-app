import AVFoundation
import Foundation

/// Graba lo que se dice al reloj, con el nivel del micrófono para dibujar las ondas.
/// Corta solo después de 1,6 s de silencio (una vez que hubo voz), o al tocar "Listo". Máximo 20 s.
final class Recorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published var levels: [CGFloat] = Array(repeating: 0.15, count: 7)

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var heardVoice = false
    private var manualStop = false
    private var silentSince: Date?
    private var url: URL?
    /// El archivo grabado, o nil si no se dijo nada (o se canceló).
    var onFinish: ((URL?) -> Void)?

    /// Pide el micrófono y empieza. Devuelve false si no hay permiso o no se pudo grabar.
    @MainActor
    func start() async -> Bool {
        let granted = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard granted else { return false }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("dictado-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 32_000,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            recorder.delegate = self
            guard recorder.record(forDuration: 20) else { return false }
            self.recorder = recorder
            self.url = url
            heardVoice = false
            manualStop = false
            silentSince = nil
            timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in self?.tick() }
            return true
        } catch {
            print("RumboWatch: no se pudo grabar \(error)")
            return false
        }
    }

    private func tick() {
        guard let recorder else { return }
        recorder.updateMeters()
        // -50 dB o menos es silencio; la voz cerca del reloj anda entre -25 y -10 dB
        let level = CGFloat(max(0, min(1, (recorder.averagePower(forChannel: 0) + 50) / 50)))
        levels = Array(levels.dropFirst()) + [max(0.12, level)]
        if level > 0.42 {
            heardVoice = true
            silentSince = nil
        } else if heardVoice, level < 0.32 {
            if let since = silentSince {
                if Date().timeIntervalSince(since) > 1.6 { recorder.stop() }
            } else {
                silentSince = Date()
            }
        }
    }

    /// "Listo": corta y manda lo grabado aunque no se haya detectado voz fuerte.
    func stop() {
        manualStop = true
        recorder?.stop()
    }

    func cancel() {
        onFinish = nil
        recorder?.stop()
        recorder?.deleteRecording()
    }

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        timer?.invalidate()
        timer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let result = flag && (heardVoice || manualStop) ? url : nil
        DispatchQueue.main.async { self.onFinish?(result) }
    }
}
