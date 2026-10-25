import { parseAmount } from './money';
import type { RawPaperReading, ReadItem } from './paper';
import { normalize } from './products';

/**
 * Formato de respuesta que se le pide a un modelo que devuelve texto libre (Gemini Nano en Android).
 * Es compacto a propósito: ML Kit recomienda respuestas de menos de ~256 tokens.
 * En iPhone no hace falta: Foundation Models devuelve la estructura directamente (@Generable).
 */
export const PAPER_FORMAT_INSTRUCTIONS = `Respondé solo con estos renglones, sin explicaciones.
Uno por cada artículo, en el orden del papel:
ARTICULO | lo escrito en el papel, letra por letra, sin el precio | el producto en palabras normales | monto
Si no estás seguro de un monto, ponele ? al final (210?).
Y al final, si el papel tiene total:
TOTAL | monto`;

/** Lee la respuesta del modelo con el formato de arriba, tolerando viñetas, bloques de código y renglones cortados. */
export function parsePaperFormat(text: string): RawPaperReading {
  const items: ReadItem[] = [];
  let total = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s>*\-•`]+/, '').trim();
    if (!line.includes('|')) continue;
    const parts = line.split('|').map((p) => p.trim());
    const last = parts[parts.length - 1];
    const doubtful = /\?\s*$/.test(last) || /^¿/.test(last);
    const amount = parseAmount(last.replace(/[¿?]/g, ''));
    if (!Number.isFinite(amount)) continue;
    const key = normalize(parts[0]).replace(/[^a-z]/g, '');
    if (key === 'total') {
      total = amount;
      continue;
    }
    const fields = parts.slice(1, -1).filter(Boolean);
    if (key !== 'articulo' || !fields.length) continue;
    items.push({ written: fields[0], name: fields[fields.length - 1], amount, ...(doubtful ? { doubtful: true } : {}) });
  }
  return { store: '', items, total };
}
