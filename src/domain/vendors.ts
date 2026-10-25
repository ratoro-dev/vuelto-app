import { round2 } from './money';
import type { PaperItem, ReadItem } from './paper';
import { normalize, prettifyRaw } from './products';

/**
 * Lo que Rumbo aprendió de un puesto (feria, almacén sin QR) a partir de los tickets que la persona
 * corrigió y guardó: cómo escribe cada producto y qué suele vender. Es la "clave" para leer la letra
 * de ese puesto la próxima vez. Queda solo en el teléfono.
 */
export interface VendorRules {
  /** Nombre normalizado, para reconocer el puesto aunque se escriba distinto. */
  key: string;
  name: string;
  /** Lo escrito en el papel (normalizado) → producto: { bon: 'Boniato' }. */
  abbreviations: Record<string, string>;
  /** Productos del puesto con el último monto pagado, por nombre normalizado. */
  products: Record<string, { name: string; price: number }>;
  /** Tickets confirmados de los que aprendió. */
  tickets: number;
  updatedAt: string;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** "  Puesto de  Mário " → "puesto de mario". */
export function vendorKey(name: string): string {
  return collapse(normalize(name));
}

/**
 * Para comparar lo escrito: sin tildes, mayúsculas ni signos, y sin el precio que el modelo
 * a veces copia pegado al producto. "Mo.Ro" → "moro", "Tom 45" → "tom", "Leche 1L" → "leche 1l".
 */
export function normalizeWritten(text: string): string {
  const withoutPrice = text.trim().replace(/(\s+\$?\s*\d[\d.,]*)+$/, '');
  return collapse(normalize(withoutPrice).replace(/[^a-z0-9 ]/g, ''));
}

/**
 * Suma lo aprendido de un ticket confirmado. Cada renglón guardado se empareja con lo que leyó el modelo
 * por monto o, si la persona corrigió el monto, por producto. Si no hay emparejamiento seguro, no se
 * aprende la abreviatura: mejor no saber que aprender algo mal.
 */
export function learnFromTicket(
  prev: VendorRules | undefined,
  input: { vendorName: string; read: ReadItem[]; saved: PaperItem[]; at: string },
): VendorRules {
  const abbreviations = { ...prev?.abbreviations };
  const products = { ...prev?.products };
  const used = new Set<number>();
  const free = (i: number) => !used.has(i);

  for (const s of input.saved) {
    const name = prettifyRaw(s.name.trim());
    if (!name || !(s.amount > 0)) continue;
    products[vendorKey(name)] = { name, price: round2(s.amount) };

    let idx = input.read.findIndex((r, i) => free(i) && Math.abs(r.amount - s.amount) < 0.005);
    if (idx < 0) idx = input.read.findIndex((r, i) => free(i) && vendorKey(r.name) === vendorKey(name));
    if (idx < 0) continue;
    used.add(idx);
    const written = normalizeWritten(input.read[idx].written ?? '');
    if (written) abbreviations[written] = name;
  }

  return {
    key: vendorKey(input.vendorName),
    name: prev?.name ?? collapse(input.vendorName),
    abbreviations,
    products,
    tickets: (prev?.tickets ?? 0) + 1,
    updatedAt: input.at,
  };
}

/** Reemplaza la interpretación del modelo por lo aprendido cuando lo escrito coincide con una abreviatura conocida. */
export function applyVendorRules(rules: VendorRules | undefined, items: ReadItem[]): { items: ReadItem[]; applied: number } {
  if (!rules) return { items, applied: 0 };
  let applied = 0;
  const out = items.map((item) => {
    const learned = item.written ? rules.abbreviations[normalizeWritten(item.written)] : undefined;
    if (!learned) return item;
    applied++;
    return { ...item, name: learned };
  });
  return { items: out, applied };
}

/** Lo aprendido, en palabras, para dárselo al modelo antes de leer un ticket de este puesto. */
export function vendorRulesContext(rules: VendorRules | undefined): string {
  if (!rules) return '';
  const abbr = Object.entries(rules.abbreviations).slice(-60).map(([w, name]) => `«${w.toUpperCase()}» es ${name}`);
  const products = Object.values(rules.products).slice(-60).map((p) => p.name);
  const parts: string[] = [];
  if (abbr.length) parts.push(`Así escriben en este puesto, según tickets que la persona ya corrigió: ${abbr.join('; ')}.`);
  if (products.length) parts.push(`Productos que suele vender: ${products.join(', ')}.`);
  return parts.join('\n');
}
