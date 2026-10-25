import AVFoundation
import Capacitor
import Foundation
import Speech

/// Dictado de gastos con el reconocimiento de voz de iOS, dentro del teléfono.
/// - iOS 26 o más: SpeechAnalyzer, el modelo nuevo de Apple (el de Notas). Entiende mejor y no se corta en las pausas.
/// - Antes, o mientras se baja el modelo nuevo: SFSpeechRecognizer, sin conexión si el iPhone tiene el español.
@objc(OfflineSpeechPlugin)
public class OfflineSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfflineSpeechPlugin"
    public let jsName = "OfflineSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// El español de acá primero; si el iPhone no lo tiene para dictar sin conexión, el más parecido que sí.
    static let locales = ["es-UY", "es-AR", "es-419", "es-US", "es-MX", "es-CL", "es-CO", "es-ES"]
    /// Para SpeechAnalyzer el español de EE.UU. va al final: mezcla palabras en inglés ("Steam", "I don't know").
    static let analyzerLocales = ["es-UY", "es-AR", "es-419", "es-MX", "es-CL", "es-CO", "es-ES", "es-US"]

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    /// Todo lo entendido: los tramos ya cerrados más el que se está diciendo.
    private var text = ""
    /// Dentro del teléfono, el reconocedor empieza de cero después de cada pausa: lo dicho antes se guarda acá.
    private var committed = ""
    /// El tramo que se está diciendo ahora.
    private var segment = ""
    /// El tramo actual ya se guardó en `committed` (iOS avisó que terminó).
    private var segmentClosed = false
    private var stopCall: CAPPluginCall?
    /// Cada dictado tiene su número, para que lo que llega tarde de uno anterior no corte el actual.
    private var session = 0
    /// Hay un dictado en curso (con cualquiera de los dos motores).
    private var listening = false
    /// Español instalado para SpeechAnalyzer; nil si el iPhone no lo tiene (todavía).
    private var analyzerLocale: Locale?
    /// La sesión de SpeechAnalyzer en curso (`AnalyzerSession`, que solo existe desde iOS 26).
    private var analyzerSession: AnyObject?

    override public func load() {
        let (recognizer, offline) = Self.pickRecognizer()
        print("OfflineSpeech: \(recognizer?.locale.identifier ?? "sin español") · sin conexión: \(offline)")
        if #available(iOS 26.0, *) {
            Task { await self.prepareAnalyzer() }
        }
    }

    @objc func availability(_ call: CAPPluginCall) {
        let (recognizer, offline) = Self.pickRecognizer()
        let analyzer = analyzerLocale != nil
        call.resolve([
            "available": analyzer || (recognizer != nil && (offline || recognizer?.isAvailable == true)),
            "offline": analyzer || offline,
            "locale": analyzerLocale?.identifier ?? recognizer?.locale.identifier ?? "",
            "engine": analyzer ? "analyzer" : "recognizer",
            "permission": Self.permission(),
        ])
    }

    /// Busca el español para SpeechAnalyzer y, si se puede bajar, lo baja (una vez, con conexión).
    @available(iOS 26.0, *)
    private func prepareAnalyzer() async {
        guard SpeechTranscriber.isAvailable else {
            print("OfflineSpeech: SpeechAnalyzer no está disponible en este iPhone")
            return
        }
        let supported = await SpeechTranscriber.supportedLocales
        let spanish = supported.filter { $0.language.languageCode?.identifier == "es" }.map(\.identifier)
        print("OfflineSpeech: SpeechAnalyzer en español: \(spanish.sorted().joined(separator: ", "))")
        guard let locale = Self.pickSpanish(supported) else {
            print("OfflineSpeech: SpeechAnalyzer no tiene español")
            return
        }
        let module = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let status = await AssetInventory.status(forModules: [module])
        print("OfflineSpeech: SpeechAnalyzer \(locale.identifier) · \(status)")
        if status == .unsupported { return }
        if status != .installed {
            do {
                try await AssetInventory.reserve(locale: locale)
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
                    try await request.downloadAndInstall()
                }
                print("OfflineSpeech: SpeechAnalyzer \(locale.identifier) instalado")
            } catch {
                print("OfflineSpeech: no se pudo bajar el modelo de SpeechAnalyzer \(error)")
                return
            }
        }
        await MainActor.run { self.analyzerLocale = locale }
    }

    @available(iOS 26.0, *)
    static func pickSpanish(_ supported: [Locale]) -> Locale? {
        for id in analyzerLocales {
            if let match = supported.first(where: { $0.identifier(.bcp47) == id }) { return match }
        }
        return supported.first { $0.language.languageCode?.identifier == "es" }
    }

    @objc func start(_ call: CAPPluginCall) {
        Self.requestPermissions { problem in
            DispatchQueue.main.async {
                if let problem {
                    print("OfflineSpeech: sin permiso · \(problem)")
                    call.reject(problem, "permission")
                } else {
                    self.begin(call)
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.listening else {
                call.resolve(["text": self.text])
                return
            }
            self.stopCall = call
            self.stopAudio()
            if #available(iOS 26.0, *), let live = self.analyzerSession as? AnalyzerSession {
                let mine = self.session
                Task {
                    let final = await live.finish()
                    await MainActor.run {
                        guard self.session == mine else { return }
                        if !final.isEmpty { self.text = final }
                        self.finish()
                    }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    if self.session == mine { self.finish() }
                }
                return
            }
            self.request?.endAudio()
            // Si el resultado final no llega, devuelve lo último que entendió
            let mine = self.session
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                if self.session == mine { self.finish() }
            }
        }
    }

    private func begin(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *), let locale = analyzerLocale {
            beginAnalyzer(call, locale: locale)
            return
        }
        let (found, offline) = Self.pickRecognizer()
        guard let recognizer = found else {
            call.reject("Este iPhone no tiene el español para dictar.", "unavailable")
            return
        }
        guard offline || recognizer.isAvailable else {
            call.reject("Sin conexión este iPhone no puede dictar. Escribilo en Texto.", "offline")
            return
        }
        finish()
        text = ""
        committed = ""
        segment = ""
        segmentClosed = false
        session += 1
        let mine = session
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = offline
            request.taskHint = .dictation
            request.contextualStrings = call.getArray("hints", String.self) ?? []
            if #available(iOS 16.0, *) { request.addsPunctuation = false }

            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()

            self.recognizer = recognizer
            self.request = request
            listening = true
            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self, self.session == mine else { return }
                    if let result {
                        self.receive(result)
                        self.notifyListeners("partial", data: ["text": self.text])
                    }
                    if let error { print("OfflineSpeech: error \(error)") }
                    if error != nil || result?.isFinal == true { self.finish() }
                }
            }
            print("OfflineSpeech: escuchando en \(recognizer.locale.identifier) · sin conexión: \(offline)")
            call.resolve(["offline": offline, "locale": recognizer.locale.identifier])
        } catch {
            print("OfflineSpeech: no arrancó el audio \(error)")
            finish()
            call.reject("No se pudo usar el micrófono: \(error.localizedDescription)", "audio")
        }
    }

    @available(iOS 26.0, *)
    private func beginAnalyzer(_ call: CAPPluginCall, locale: Locale) {
        finish()
        text = ""
        session += 1
        let mine = session
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("No se pudo usar el micrófono: \(error.localizedDescription)", "audio")
            return
        }
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        let live = AnalyzerSession(locale: locale) { [weak self] text in
            DispatchQueue.main.async {
                guard let self, self.session == mine else { return }
                self.text = text
                self.notifyListeners("partial", data: ["text": text])
            }
        }
        analyzerSession = live
        listening = true
        Task {
            do {
                try await live.start(inputFormat: inputFormat, hints: call.getArray("hints", String.self) ?? [])
                await MainActor.run {
                    guard self.session == mine else { return }
                    input.removeTap(onBus: 0)
                    input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
                        live.append(buffer)
                    }
                    self.engine.prepare()
                    do {
                        try self.engine.start()
                    } catch {
                        print("OfflineSpeech: no arrancó el audio \(error)")
                        self.finish()
                        call.reject("No se pudo usar el micrófono: \(error.localizedDescription)", "audio")
                        return
                    }
                    print("OfflineSpeech: escuchando con SpeechAnalyzer en \(locale.identifier)")
                    call.resolve(["offline": true, "locale": locale.identifier, "engine": "analyzer"])
                }
            } catch {
                print("OfflineSpeech: SpeechAnalyzer no arrancó \(error)")
                await MainActor.run {
                    guard self.session == mine else { return }
                    // Sigue con el motor de siempre
                    self.listening = false
                    self.analyzerSession = nil
                    self.analyzerLocale = nil
                    self.begin(call)
                }
            }
        }
    }

    /// Junta los tramos: "Ayer gasté 180 en palta" … pausa … "200 en agua" llega como dos resultados que no se
    /// continúan, y hay que sumarlos en vez de quedarse con el último.
    private func receive(_ result: SFSpeechRecognitionResult) {
        let current = result.bestTranscription.formattedString
        if segmentClosed {
            // Después de un cierre, lo que llega distinto es un tramo nuevo; lo igual es el cierre repetido
            if current != segment {
                segmentClosed = false
                segment = current
            }
        } else {
            if Self.isNewSegment(previous: segment, current: current) { commit(segment) }
            segment = current
        }
        if #available(iOS 14.5, *), result.speechRecognitionMetadata != nil, !segmentClosed {
            commit(segment)
            segmentClosed = true
        }
        text = segmentClosed ? committed : [committed, segment].filter { !$0.isEmpty }.joined(separator: " ")
    }

    private func commit(_ piece: String) {
        guard !piece.isEmpty else { return }
        committed = committed.isEmpty ? piece : "\(committed) \(piece)"
    }

    /// Si `current` empieza un tramo nuevo en vez de corregir el anterior. Las correcciones conservan la
    /// primera palabra ("Ayer gas" → "Ayer gasté") o la completan ("A" → "Ayer"), y no pierden varias palabras.
    static func isNewSegment(previous: String, current: String) -> Bool {
        let words = { (s: String) in
            s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).split(separator: " ").map(String.init)
        }
        let p = words(previous)
        let c = words(current)
        guard let pf = p.first, let cf = c.first else { return false }
        if c.count + 2 <= p.count { return true }
        // Un tramo de una sola palabra todavía se está corrigiendo ("Gust" → "Gasté")
        if p.count <= 1 { return false }
        if pf == cf { return false }
        if p.count == 1 && (cf.hasPrefix(pf) || pf.hasPrefix(cf)) { return false }
        return true
    }

    /// Corta todo y entrega el texto, ya sea porque la persona soltó el botón o porque iOS terminó solo.
    private func finish() {
        stopAudio()
        let ended = listening
        listening = false
        if ended { print("OfflineSpeech: entendido \"\(text)\"") }
        task?.cancel()
        task = nil
        request = nil
        if #available(iOS 26.0, *), let live = analyzerSession as? AnalyzerSession { live.cancel() }
        analyzerSession = nil
        if let call = stopCall {
            stopCall = nil
            call.resolve(["text": text])
        } else if ended {
            notifyListeners("end", data: ["text": text])
        }
    }

    private func stopAudio() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// El primer español que el iPhone puede dictar sin conexión; si ninguno, el primero que tenga.
    static func pickRecognizer() -> (SFSpeechRecognizer?, Bool) {
        var fallback: SFSpeechRecognizer?
        for id in locales {
            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: id)) else { continue }
            if recognizer.supportsOnDeviceRecognition { return (recognizer, true) }
            if fallback == nil { fallback = recognizer }
        }
        return (fallback, false)
    }

    /// granted · denied · prompt
    static func permission() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    /// Pide permiso para reconocer voz y para el micrófono. Devuelve el problema, o nada si está todo bien.
    static func requestPermissions(_ done: @escaping (String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                done("Rumbo necesita permiso de reconocimiento de voz. Activalo en Ajustes → Rumbo.")
                return
            }
            let mic: (Bool) -> Void = { granted in
                done(granted ? nil : "Rumbo necesita el micrófono para dictar. Activalo en Ajustes → Rumbo.")
            }
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission(completionHandler: mic)
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission(mic)
            }
        }
    }
}

/// Un dictado con SpeechAnalyzer: recibe el audio del micrófono, lo pasa al formato del modelo y junta el texto.
/// El modelo entrega tramos finales ("isFinal") y uno provisorio que se va corrigiendo mientras se habla.
@available(iOS 26.0, *)
final class AnalyzerSession {
    private let transcriber: SpeechTranscriber
    private let analyzer: SpeechAnalyzer
    private let onText: (String) -> Void
    private var continuation: AsyncStream<AnalyzerInput>.Continuation?
    private var converter: AVAudioConverter?
    private var format: AVAudioFormat?
    private var resultsTask: Task<Void, Never>?
    private let lock = NSLock()
    private var finalized = ""
    private var volatile = ""

    init(locale: Locale, onText: @escaping (String) -> Void) {
        transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        analyzer = SpeechAnalyzer(modules: [transcriber])
        self.onText = onText
    }

    var text: String { lock.withLock { Self.join(finalized, volatile) } }

    func start(inputFormat: AVAudioFormat, hints: [String]) async throws {
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw NSError(domain: "OfflineSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "No hay un formato de audio compatible"])
        }
        self.format = format
        converter = AVAudioConverter(from: inputFormat, to: format)
        if !hints.isEmpty {
            let context = AnalysisContext()
            context.contextualStrings[.general] = hints
            try? await analyzer.setContext(context)
        }
        try await analyzer.prepareToAnalyze(in: format)
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = continuation
        let transcriber = self.transcriber
        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    guard let self else { return }
                    let piece = String(result.text.characters)
                    let text: String = self.lock.withLock {
                        if result.isFinal {
                            self.finalized = Self.join(self.finalized, piece)
                            self.volatile = ""
                        } else {
                            self.volatile = piece
                        }
                        return Self.join(self.finalized, self.volatile)
                    }
                    self.onText(text)
                }
            } catch {
                print("OfflineSpeech: SpeechAnalyzer terminó con error \(error)")
            }
        }
        try await analyzer.start(inputSequence: stream)
    }

    /// Se llama desde el hilo de audio con cada pedazo del micrófono.
    func append(_ buffer: AVAudioPCMBuffer) {
        guard let continuation, let format, let converter else { return }
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 16
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
        var given = false
        var error: NSError?
        let status = converter.convert(to: out, error: &error) { _, inputStatus in
            if given {
                inputStatus.pointee = .noDataNow
                return nil
            }
            given = true
            inputStatus.pointee = .haveData
            return buffer
        }
        if status != .error, out.frameLength > 0 { continuation.yield(AnalyzerInput(buffer: out)) }
    }

    /// Termina de escuchar, espera los últimos tramos finales y devuelve todo el texto.
    func finish() async -> String {
        continuation?.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            print("OfflineSpeech: SpeechAnalyzer no pudo cerrar \(error)")
        }
        _ = await resultsTask?.value
        return text
    }

    func cancel() {
        continuation?.finish()
        resultsTask?.cancel()
        let analyzer = self.analyzer
        Task { await analyzer.cancelAndFinishNow() }
    }

    static func join(_ a: String, _ b: String) -> String {
        [a, b].map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}
