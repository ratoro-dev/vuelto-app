import AVFoundation
import Foundation
import Speech

/// Convierte en texto una grabación (la del Apple Watch), dentro del teléfono.
/// Usa el mismo motor que el dictado del iPhone: SpeechAnalyzer desde iOS 26 y, si no, SFSpeechRecognizer.
enum FileTranscriber {
    static func transcribe(_ url: URL) async -> String {
        if #available(iOS 26.0, *) {
            do {
                let text = try await analyzer(url)
                if !text.isEmpty { return text }
            } catch {
                print("FileTranscriber: SpeechAnalyzer falló \(error)")
            }
        }
        do {
            return try await recognizer(url)
        } catch {
            print("FileTranscriber: SFSpeechRecognizer falló \(error)")
            return ""
        }
    }

    @available(iOS 26.0, *)
    private static func analyzer(_ url: URL) async throws -> String {
        guard let locale = OfflineSpeechPlugin.pickSpanish(await SpeechTranscriber.installedLocales) else {
            throw NSError(domain: "FileTranscriber", code: 1, userInfo: [NSLocalizedDescriptionKey: "Sin español instalado"])
        }
        let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
        // Se empieza a leer antes de arrancar el análisis, para no perder ningún tramo
        let collect = Task { () throws -> String in
            var text = ""
            for try await result in transcriber.results where result.isFinal {
                text = AnalyzerSession.join(text, String(result.text.characters))
            }
            return text
        }
        let file = try AVAudioFile(forReading: url)
        let analyzer = try await SpeechAnalyzer(inputAudioFile: file, modules: [transcriber], finishAfterFile: true)
        let text = try await collect.value
        _ = analyzer
        return text
    }

    private static func recognizer(_ url: URL) async throws -> String {
        let (found, offline) = OfflineSpeechPlugin.pickRecognizer()
        guard let recognizer = found else {
            throw NSError(domain: "FileTranscriber", code: 2, userInfo: [NSLocalizedDescriptionKey: "Sin reconocedor de español"])
        }
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.requiresOnDeviceRecognition = offline
        request.shouldReportPartialResults = false
        return try await withCheckedThrowingContinuation { continuation in
            var done = false
            recognizer.recognitionTask(with: request) { result, error in
                // El reconocedor tiene que seguir vivo hasta el resultado final
                _ = recognizer
                guard !done else { return }
                if let result, result.isFinal {
                    done = true
                    continuation.resume(returning: result.bestTranscription.formattedString)
                } else if let error {
                    done = true
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}
