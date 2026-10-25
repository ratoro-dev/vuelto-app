/**
 * Reduce una foto a un JPEG chico en data URL para guardarla dentro del ticket.
 * Con 1280 px de lado mayor la letra a mano sigue legible y cada foto queda en ~100–200 KB.
 * TODO: cuando haya muchos tickets con foto, guardar los archivos con @capacitor/filesystem
 * en vez de dentro de Preferences.
 */
export async function photoToDataUrl(file: Blob, maxSide = 1280, quality = 0.6): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la foto.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
