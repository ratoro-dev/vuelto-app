import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { DocumentScanner } from '@capacitor-mlkit/document-scanner';
import { photoToDataUrl } from './photo';

export interface CapturedPaper {
  /** JPEG reducido en data URL, para guardar con el ticket. */
  photo: string;
  /** Archivo local en resolución completa, para el OCR. */
  path?: string;
}

/** Solo en Android: la cámara de documentos de Google detecta el papel, lo recorta y lo endereza. */
export function canScanDocuments(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Abre el escáner de documentos (o la galería desde ahí). 'unavailable' cuando Google Play todavía
 * no bajó el módulo del escáner: se pide la instalación y, mientras tanto, se usa la foto común.
 */
export async function scanPaper(): Promise<CapturedPaper | 'cancelled' | 'unavailable'> {
  const { available } = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
  if (!available) {
    await DocumentScanner.installGoogleDocumentScannerModule();
    return 'unavailable';
  }
  let uri: string | undefined;
  try {
    const result = await DocumentScanner.scanDocument({ galleryImportAllowed: true, pageLimit: 1, resultFormats: 'JPEG', scannerMode: 'FULL' });
    uri = result.scannedImages?.[0];
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return 'cancelled';
    throw e;
  }
  if (!uri) return 'cancelled';
  const blob = await (await fetch(Capacitor.convertFileSrc(uri))).blob();
  return { photo: await photoToDataUrl(blob), path: uri };
}

/** La cámara común del teléfono (iPhone, o Android sin el escáner de documentos). */
async function cameraPhoto(): Promise<CapturedPaper | 'cancelled'> {
  let result;
  try {
    result = await Camera.takePhoto({ quality: 85 });
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return 'cancelled';
    throw e;
  }
  const src = result.webPath ?? (result.uri ? Capacitor.convertFileSrc(result.uri) : undefined);
  if (!src) return 'cancelled';
  const blob = await (await fetch(src)).blob();
  return { photo: await photoToDataUrl(blob), path: result.uri };
}

/**
 * La foto de un ticket en el teléfono: en Android el escáner de documentos (y la cámara común mientras
 * Google Play baja el módulo); en iPhone la cámara. En el navegador no hay: se elige un archivo con `pickImageFile`.
 */
export async function takePaperPhoto(): Promise<CapturedPaper | 'cancelled'> {
  if (canScanDocuments()) {
    const scanned = await scanPaper();
    if (scanned !== 'unavailable') return scanned;
  }
  return cameraPhoto();
}

/**
 * Elige una imagen con el selector del sistema (la galería, o la cámara con `capture`).
 * Hay que llamarla en el mismo toque del botón: el navegador no abre el selector después de un `await`.
 */
export function pickImageFile(capture = false): Promise<CapturedPaper | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) return resolve(undefined);
        photoToDataUrl(file).then(
          (photo) => resolve({ photo }),
          () => resolve(undefined),
        );
      },
      { once: true },
    );
    input.click();
  });
}
