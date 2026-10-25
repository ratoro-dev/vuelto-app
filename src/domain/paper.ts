import { round2 } from './money';
import { prettifyRaw } from './products';
import type { Category, Line } from './types';

export interface PaperItem {
  /** Como lo escribió la persona: "tomate 1kg". */
  name: string;
  amount: number;
}

/** Un renglón leído de la foto. `written` es el texto literal del papel ("BON"); `name`, lo que el lector cree que es. */
export interface ReadItem extends PaperItem {
  written?: string;
  /** El lector no está seguro del monto: la persona lo confirma antes de agregar el ticket. */
  doubtful?: boolean;
}

/** Lo que devuelve un lector automático (modelo de visión) sin filtrar. */
export interface RawPaperReading {
  store: string;
  items: ReadItem[];
  /** 0 cuando el papel no tiene total. */
  total: number;
}

/**
 * Deja lo leído listo para precargar el formulario: sin montos en cero ni inválidos,
 * redondeado a centésimos y sin comercio ni total cuando el modelo no los encontró.
 * Los nombres vacíos se conservan: el monto sirve igual y la persona lo completa.
 */
export function normalizePaperReading(raw: RawPaperReading): { store?: string; items: ReadItem[]; writtenTotal?: number } {
  const valid = (n: number) => Number.isFinite(n) && n > 0;
  return {
    store: raw.store.trim() || undefined,
    items: raw.items
      .filter((i) => valid(i.amount))
      .map((i) => ({
        name: i.name.trim(),
        amount: round2(i.amount),
        ...(i.written?.trim() ? { written: i.written.trim() } : {}),
        ...(i.doubtful ? { doubtful: true } : {}),
      })),
    writtenTotal: valid(raw.total) ? round2(raw.total) : undefined,
  };
}

/**
 * Líneas de un ticket de papel (feria, almacén sin QR). Los artículos son opcionales:
 * si no hay ninguno con monto, queda una sola línea por el total escrito.
 * Todas las líneas toman la categoría elegida; después se pueden cambiar una por una.
 */
export function buildPaperLines(input: { description: string; items: PaperItem[]; writtenTotal?: number; category: Category; subcategory: string }): Line[] {
  const { category, subcategory } = input;
  const lines = input.items
    .filter((i) => Number.isFinite(i.amount) && i.amount > 0)
    .map((i) => {
      const raw = i.name.trim() || 'Artículo sin nombre';
      return { raw, pretty: prettifyRaw(raw), category, subcategory, amount: round2(i.amount) };
    });
  if (lines.length) return lines;
  const total = input.writtenTotal;
  if (total === undefined || !Number.isFinite(total) || total <= 0) return [];
  const description = input.description.trim() || 'Ticket en papel';
  return [{ raw: description, pretty: description, category, subcategory, amount: round2(total) }];
}
