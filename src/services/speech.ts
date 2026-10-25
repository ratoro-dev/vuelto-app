import { Capacitor, type PluginListenerHandle, registerPlugin } from '@capacitor/core';

/** Lo mínimo de la Web Speech API que se usa (TypeScript no la trae en lib.dom). */
interface WebRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => WebRecognition;

function webRecognition(): RecognitionCtor | undefined {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface SpeechStatus {
  /** Se puede dictar ahora. */
  available: boolean;
  /** Se procesa dentro del teléfono, sin internet. */
  offline: boolean;
  /** Android está bajando el español para dictar sin conexión. */
  downloading?: boolean;
  permission?: 'granted' | 'denied' | 'prompt';
}

interface SpeechEvent {
  text: string;
  error?: string;
}

/**
 * Plugin propio de la app: `ios/App/App/OfflineSpeechPlugin.swift` (Speech de iOS) y
 * `android/.../OfflineSpeechPlugin.java` (SpeechRecognizer de Android).
 */
interface OfflineSpeechPlugin {
  availability(): Promise<SpeechStatus & { locale: string }>;
  start(options: { hints?: string[] }): Promise<{ offline: boolean; locale: string }>;
  stop(): Promise<SpeechEvent>;
  addListener(event: 'partial' | 'end', listener: (e: SpeechEvent) => void): Promise<PluginListenerHandle>;
}

const OfflineSpeech = registerPlugin<OfflineSpeechPlugin>('OfflineSpeech');

/** Si este equipo puede dictar y si lo hace sin conexión. En el navegador usa la Web Speech API. */
export async function speechStatus(): Promise<SpeechStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      return await OfflineSpeech.availability();
    } catch {
      return { available: false, offline: false };
    }
  }
  return { available: !!webRecognition(), offline: false };
}

export interface ListenOptions {
  /** El texto parcial, mientras la persona habla. */
  onText(text: string): void;
  /** El dictado terminó solo (silencio largo o error), sin que se llamara a `stop`. */
  onEnd(text: string, error?: string): void;
  /** Palabras que conviene reconocer bien: comercios usados, medios de pago. */
  hints?: string[];
}

export interface Listening {
  /** Termina de escuchar y devuelve lo que se entendió. Falla si no se entendió nada por un problema. */
  stop(): Promise<string>;
}

/** Empieza a escuchar en español. En el teléfono pide los permisos la primera vez. */
export function startListening(options: ListenOptions): Promise<Listening> {
  return Capacitor.isNativePlatform() ? startNative(options) : Promise.resolve(startWeb(options));
}

async function startNative({ onText, onEnd, hints }: ListenOptions): Promise<Listening> {
  let handles: PluginListenerHandle[] = [];
  const cleanup = () => {
    handles.forEach((h) => void h.remove());
    handles = [];
  };
  handles = await Promise.all([
    OfflineSpeech.addListener('partial', (e) => onText(e.text)),
    OfflineSpeech.addListener('end', (e) => {
      cleanup();
      onEnd(e.text, e.error);
    }),
  ]);
  try {
    await OfflineSpeech.start({ hints });
  } catch (e) {
    cleanup();
    throw e;
  }
  return {
    async stop() {
      const r = await OfflineSpeech.stop();
      cleanup();
      if (r.error && !r.text) throw new Error(r.error);
      return r.text;
    },
  };
}

function startWeb({ onText, onEnd }: ListenOptions): Listening {
  const Ctor = webRecognition();
  if (!Ctor) throw new Error('Este equipo no puede dictar. Escribilo en Texto.');
  const rec = new Ctor();
  rec.lang = 'es-UY';
  rec.interimResults = true;
  rec.continuous = true;
  let text = '';
  let stopping = false;
  let ended: () => void = () => undefined;
  const done = new Promise<void>((r) => (ended = r));
  rec.onresult = (e) => {
    text = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(' ')
      .trim();
    onText(text);
  };
  rec.onerror = () => ended();
  rec.onend = () => {
    ended();
    if (!stopping) onEnd(text);
  };
  rec.start();
  return {
    async stop() {
      stopping = true;
      rec.stop();
      await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
      return text;
    },
  };
}
