import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export type ScanOutcome =
  | { kind: 'ok'; content: string }
  | { kind: 'cancelled' }
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

/** En iOS/Android hay escáner nativo; en el navegador la pantalla ofrece pegar o simular el QR. */
export function hasNativeScanner(): boolean {
  return Capacitor.isNativePlatform();
}

/** Abre el escáner nativo de ML Kit y devuelve el contenido del primer QR leído. */
export async function scanQr(): Promise<ScanOutcome> {
  if (!hasNativeScanner()) return { kind: 'unsupported' };
  try {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) return { kind: 'unsupported' };

    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
    }

    let perm = await BarcodeScanner.checkPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') perm = await BarcodeScanner.requestPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') return { kind: 'denied' };

    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    const content = barcodes[0]?.rawValue;
    return content ? { kind: 'ok', content } : { kind: 'cancelled' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(message)) return { kind: 'cancelled' };
    return { kind: 'error', message };
  }
}
