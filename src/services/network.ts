import { Network } from '@capacitor/network';

/** Si el teléfono tiene conexión. En el navegador, lo que diga `navigator.onLine`. */
export async function isConnected(): Promise<boolean> {
  try {
    return (await Network.getStatus()).connected;
  } catch {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }
}

/** Avisa cada vez que se pierde o vuelve la conexión. Devuelve la función para dejar de escuchar. */
export function onConnectionChange(listener: (connected: boolean) => void): () => void {
  const handle = Network.addListener('networkStatusChange', (s) => listener(s.connected));
  return () => {
    handle.then((h) => h.remove()).catch(() => undefined);
  };
}
