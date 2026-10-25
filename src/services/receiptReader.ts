import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { GenAiPrompt } from '@capacitor-mlkit/genai-prompt';
import { TextRecognition } from '@capacitor-mlkit/text-recognition';
import { DEMO_SCAN } from '@/data/seed';
import { parseOcrLines } from '@/domain/ocr';
import { PAPER_FORMAT_INSTRUCTIONS, parsePaperFormat } from '@/domain/promptFormat';
import { normalizePaperReading, type RawPaperReading, type ReadItem } from '@/domain/paper';
import type { CfeHeader, Discount, Line } from '@/domain/types';

export interface ReadLinesResult {
  lines: Line[];
  discounts: Discount[];
  photoUri?: string;
}

/**
 * Lectura de las líneas de un ticket con QR.
 *
 * Hoy: implementación de demo que devuelve líneas fijas.
 * Próximo paso: subir la foto a un backend que llame a un modelo de visión,
 * devuelva líneas + descuentos en JSON, y validar el resultado con
 * `checkAgainstQr` antes de guardar (si no cuadra, pedir revisión al usuario).
 */
export interface ReceiptReader {
  readLines(header: CfeHeader): Promise<ReadLinesResult>;
}

/** Lo que se pudo leer de la foto de un ticket de papel (feria, almacén sin QR). Todo es opcional. */
export interface ReadPaperResult {
  store?: string;
  /** Con el texto literal de cada renglón cuando el lector lo da, para aprender del puesto. */
  items: ReadItem[];
  writtenTotal?: number;
}

/**
 * Lectura de un ticket de papel a partir de la foto. Lo leído solo precarga el formulario:
 * la persona siempre lo revisa antes de guardar. Un lector en el backend se enchufaría acá también.
 */
export interface PaperReader {
  /**
   * `rules`: lo aprendido del puesto (vendorRulesContext), para que el lector lo tenga en cuenta.
   * `path`: la foto en resolución completa como archivo local, si la hay (escáner de documentos).
   */
  read(photo: string, options?: { rules?: string; path?: string }): Promise<ReadPaperResult>;
}

/** Sin lectura automática: la persona completa los datos mirando la foto. */
export const manualPaperReader: PaperReader = {
  async read() {
    return { items: [] };
  },
};

/**
 * iPhone: available · noVision · deviceNotEligible · appleIntelligenceNotEnabled · modelNotReady · unavailable · osTooOld.
 * Android (Gemini Nano): AVAILABLE · DOWNLOADABLE · DOWNLOADING · UNAVAILABLE.
 */
export type PaperVisionStatus = string;

/** Plugin propio de la app (ios/App/App/PaperVisionPlugin.swift): Foundation Models de iOS 27 con imagen. */
interface PaperVisionPlugin {
  availability(): Promise<{ status: PaperVisionStatus }>;
  read(options: { image: string; rules?: string }): Promise<RawPaperReading>;
}

const PaperVision = registerPlugin<PaperVisionPlugin>('PaperVision');

/** Lee el papel con el modelo de Apple Intelligence, dentro del teléfono y sin internet. */
export const onDevicePaperReader: PaperReader = {
  async read(photo, options) {
    return normalizePaperReading(await PaperVision.read({ image: photo, rules: options?.rules || undefined }));
  },
};

/** El OCR necesita un archivo: si no vino del escáner, se guarda la foto en la caché. */
async function localPathFor(photo: string): Promise<string> {
  const { uri } = await Filesystem.writeFile({ path: 'papel-ocr.jpg', data: photo.slice(photo.indexOf(',') + 1), directory: Directory.Cache });
  return uri;
}

/**
 * OCR de ML Kit, sin IA: lee el texto de la foto y lo arma en renglones (domain/ocr.ts).
 * Anda en cualquier Android o iPhone. Lee peor la letra a mano que un modelo de visión,
 * pero lo aprendido de cada puesto (applyVendorRules) corrige las abreviaturas igual.
 */
export const ocrPaperReader: PaperReader = {
  async read(photo, options) {
    const path = options?.path ?? (await localPathFor(photo));
    const { blocks } = await TextRecognition.processImage({ path });
    const lines = blocks
      .flatMap((b) => b.lines)
      .flatMap((l) => (l.boundingBox ? [{ text: l.text, box: l.boundingBox }] : []));
    const reading = parseOcrLines(lines);
    // Capacitor solo pasa la consola a logcat/Xcode en compilaciones de prueba. Sirve para
    // convertir papeles reales en casos de test de domain/ocr.ts.
    console.info(`PaperOCR ${JSON.stringify({ lines, reading })}`);
    return normalizePaperReading(reading);
  },
};

/** Las mismas reglas generales que el lector de iPhone (PaperVisionPlugin.swift). Nada propio de un puesto: eso lo aporta `rules`. */
const NANO_INSTRUCTIONS = `Leés tickets de compra uruguayos sin QR: papelitos de la feria escritos a mano, boletas de almacén o recibos impresos. Los montos están en pesos uruguayos: la coma separa los decimales y el punto separa los miles ("1.046,40"). No inventes artículos ni montos; si un renglón no se lee, dejalo afuera.`;

/**
 * Gemini Nano (ML Kit GenAI Prompt API), en el teléfono y sin internet: el equivalente en Android de
 * Foundation Models. Devuelve texto libre, así que se le pide un formato compacto (domain/promptFormat.ts).
 * Solo en teléfonos con AICore (Pixel 9 o posterior, Galaxy S24/S25…).
 */
export const nanoPaperReader: PaperReader = {
  async read(photo, options) {
    const imagePath = options?.path ?? (await localPathFor(photo));
    const prompt = [NANO_INSTRUCTIONS, options?.rules, PAPER_FORMAT_INSTRUCTIONS].filter(Boolean).join('\n\n');
    // temperature 0 + topK 1 + seed fijo: la misma foto da la misma lectura (como .greedy en iPhone).
    const { text } = await GenAiPrompt.generateContent({ prompt, imagePath, temperature: 0, topK: 1, seed: 1, maxOutputTokens: 256 });
    console.info(`PaperNano ${JSON.stringify(text)}`);
    return normalizePaperReading(parsePaperFormat(text));
  },
};

/** ia: modelo de visión en el teléfono · ocr: texto sin IA · manual: la persona carga todo. */
export type PaperReaderKind = 'ia' | 'ocr' | 'manual';

/**
 * iPhone con Apple Intelligence que ve imágenes, o Android con Gemini Nano → IA. Si no → OCR.
 * Navegador → carga a mano. `status` explica por qué no se usó la IA.
 */
export async function choosePaperReader(): Promise<{ reader: PaperReader; kind: PaperReaderKind; status: PaperVisionStatus }> {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') {
    let status: PaperVisionStatus = 'unavailable';
    try {
      status = (await PaperVision.availability()).status;
    } catch {
      // Sin el plugin: queda el OCR.
    }
    return status === 'available' ? { reader: onDevicePaperReader, kind: 'ia', status } : { reader: ocrPaperReader, kind: 'ocr', status };
  }
  if (platform === 'android') {
    let status: PaperVisionStatus = 'UNAVAILABLE';
    try {
      status = (await GenAiPrompt.checkFeatureStatus()).featureStatus;
    } catch {
      // Sin Google Play services o sin AICore: queda el OCR.
    }
    console.info(`PaperNano estado ${status}`);
    if (status === 'AVAILABLE') return { reader: nanoPaperReader, kind: 'ia', status };
    // Gemini Nano se puede bajar: se pide la descarga y, mientras tanto, se lee con OCR.
    if (status === 'DOWNLOADABLE') GenAiPrompt.downloadFeature().catch(() => undefined);
    return { reader: ocrPaperReader, kind: 'ocr', status };
  }
  return { reader: manualPaperReader, kind: 'manual', status: 'unavailable' };
}

export const demoReceiptReader: ReceiptReader = {
  async readLines(header) {
    if (header.url === DEMO_SCAN.qr) {
      return { lines: DEMO_SCAN.lines.map((l) => ({ ...l })), discounts: DEMO_SCAN.discounts.map((d) => ({ ...d })) };
    }
    // Con un QR real y sin backend todavía: una sola línea por el total. "Separar por productos" la detalla con una foto.
    return {
      discounts: [],
      lines: [{ raw: 'TOTAL DEL TICKET', pretty: 'Compra (sin detalle)', category: 'Otros', subcategory: 'Varios', amount: header.total }],
    };
  },
};
