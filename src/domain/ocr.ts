import { parseAmount } from './money';
import type { RawPaperReading, ReadItem } from './paper';

/** Un renglón de texto que detectó el OCR, con su caja en píxeles de la imagen. */
export interface OcrLine {
  text: string;
  box: { left: number; top: number; right: number; bottom: number };
}

interface Row {
  text: string;
  top: number;
  bottom: number;
}

interface Entry {
  written: string;
  /** Sin monto: un nombre suelto, que puede tener su monto en el renglón de abajo. */
  amount?: number;
  top: number;
  bottom: number;
}

/** "Queso dambo $ 1.046,40" → nombre + monto al final, con montos escritos a la uruguaya. */
const NAME_AND_AMOUNT = /^(.*?)[\s$:]*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*$/;
const ONLY_NUMBER = /^[\s$\d.,]*\d[\s$\d.,]*$/;
const TOTAL_WORD = /\btotal\b/i;

/**
 * Arma los renglones de un ticket de papel a partir del texto que devuelve el OCR (sin IA).
 * En un papelito de feria el nombre y el monto suelen detectarse por separado (columna izquierda y
 * derecha), así que primero se juntan por altura y después se interpreta cada renglón. El total es
 * el renglón que dice "total" o, si no hay, un número solo al final que sea el mayor de todos.
 */
export function parseOcrLines(lines: OcrLine[]): RawPaperReading {
  const valid = lines.filter((l) => l.text.trim());
  if (!valid.length) return { store: '', items: [], total: 0 };
  const heights = valid.map((l) => l.box.bottom - l.box.top).sort((a, b) => a - b);
  const lineHeight = heights[Math.floor(heights.length / 2)];

  const parsed = groupByHeight(valid, lineHeight / 2).map(parseRow).filter((e): e is Entry => e !== null);
  const entries = mergeNameWithNextNumber(parsed, lineHeight);

  let total = 0;
  let totalIdx = -1;
  for (let i = entries.length - 1; i >= 0 && totalIdx < 0; i--) {
    if (entries[i].amount !== undefined && TOTAL_WORD.test(entries[i].written)) totalIdx = i;
  }
  if (totalIdx >= 0) {
    total = entries[totalIdx].amount ?? 0;
    entries.splice(totalIdx, 1);
  } else {
    // Un número solo al final, mayor que los demás (o el único que se leyó), es el total escrito.
    const last = entries.at(-1);
    const others = entries.slice(0, -1).map((e) => e.amount ?? 0);
    if (last?.amount !== undefined && !last.written && last.amount >= Math.max(0, ...others)) {
      total = last.amount;
      entries.pop();
    }
  }

  const items: ReadItem[] = entries.flatMap((e) =>
    e.amount !== undefined && e.amount > 0 ? [{ written: e.written, name: e.written, amount: e.amount }] : [],
  );
  return { store: '', items, total };
}

/** Agrupa los renglones cuyos centros están a menos de `tolerance` px; cada grupo, de izquierda a derecha. */
function groupByHeight(lines: OcrLine[], tolerance: number): Row[] {
  const center = (l: OcrLine) => (l.box.top + l.box.bottom) / 2;
  const groups: { center: number; lines: OcrLine[] }[] = [];
  for (const line of [...lines].sort((a, b) => center(a) - center(b))) {
    const last = groups.at(-1);
    if (last && Math.abs(center(line) - last.center) <= tolerance) {
      last.lines.push(line);
      last.center = last.lines.reduce((s, l) => s + center(l), 0) / last.lines.length;
    } else {
      groups.push({ center: center(line), lines: [line] });
    }
  }
  return groups.map((g) => ({
    text: g.lines.sort((a, b) => a.box.left - b.box.left).map((l) => l.text.trim()).join(' '),
    top: Math.min(...g.lines.map((l) => l.box.top)),
    bottom: Math.max(...g.lines.map((l) => l.box.bottom)),
  }));
}

function parseRow(row: Row): Entry | null {
  const { text, top, bottom } = row;
  if (ONLY_NUMBER.test(text)) {
    // "14 39": el OCR a veces parte un número escrito a mano en dos.
    const amount = parseAmount(text.replace(/\s+/g, ''));
    return Number.isFinite(amount) ? { written: '', amount, top, bottom } : null;
  }
  const m = text.match(NAME_AND_AMOUNT);
  if (m) {
    const amount = parseAmount(m[2]);
    if (Number.isFinite(amount)) return { written: m[1].trim(), amount, top, bottom };
  }
  return /\p{L}/u.test(text) ? { written: text, top, bottom } : null;
}

/**
 * Un nombre sin monto seguido de un monto sin nombre es un mismo renglón, si están a menos de un
 * renglón de distancia (el monto quedó un poco más abajo). Los nombres sueltos que quedan se descartan.
 */
function mergeNameWithNextNumber(entries: Entry[], lineHeight: number): Entry[] {
  const out: Entry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const next = entries[i + 1];
    if (e.amount === undefined && next?.amount !== undefined && !next.written && next.top - e.bottom <= lineHeight) {
      out.push({ ...e, amount: next.amount, bottom: next.bottom });
      i++;
    } else if (e.amount !== undefined) {
      out.push(e);
    }
  }
  return out;
}
