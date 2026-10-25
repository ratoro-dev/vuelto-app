import type { CfeHeader, IsoDate } from './types';

/**
 * Tipos de CFE (Comprobante Fiscal Electrónico) más comunes en tickets de consumidor final.
 * Fuente: codificación de tipos de CFE de DGI. Ampliar si aparecen otros en tickets reales.
 */
export const CFE_TYPES: Record<number, string> = {
  101: 'e-Ticket',
  102: 'Nota de crédito de e-Ticket',
  103: 'Nota de débito de e-Ticket',
  111: 'e-Factura',
  112: 'Nota de crédito de e-Factura',
  113: 'Nota de débito de e-Factura',
  121: 'e-Factura de exportación',
  131: 'e-Ticket venta por cuenta ajena',
  141: 'e-Factura venta por cuenta ajena',
  151: 'e-Boleta de entrada',
  181: 'e-Remito',
  182: 'e-Resguardo',
};

/** Notas de crédito: el monto vuelve al bolsillo, se registra en negativo. */
export const CREDIT_NOTE_TYPES = new Set([102, 112]);

export function cfeTypeName(type: number): string {
  return CFE_TYPES[type] ?? `CFE tipo ${type}`;
}

export type CfeParseResult =
  | { ok: true; header: CfeHeader; warnings: string[] }
  | { ok: false; error: string };

/**
 * Lee el contenido del QR impreso en un CFE.
 *
 * Formato esperado (representación impresa de DGI):
 *   https://www.efactura.dgi.gub.uy/consultaQR/cfe?RUT,TIPO,SERIE,NUMERO,TOTAL,FECHA,CODIGO
 *
 * FECHA suele venir como dd/mm/aaaa; también se aceptan aaaa-mm-dd y aaaammdd.
 * TODO: confirmar el orden y los formatos con tickets reales de varias cadenas
 * antes de salir a producción.
 */
export function parseCfeQr(content: string): CfeParseResult {
  const text = content.trim();
  const qIdx = text.indexOf('?');
  if (qIdx < 0 || !/dgi\.gub\.uy/i.test(text.slice(0, qIdx))) {
    return { ok: false, error: 'El QR no es de un comprobante de DGI.' };
  }
  const query = decodeURIComponent(text.slice(qIdx + 1));
  const parts = query.split(',').map((p) => p.trim());
  if (parts.length < 6) {
    return { ok: false, error: 'Al QR le faltan datos del comprobante.' };
  }
  const [rutRaw, typeRaw, serieRaw, numberRaw, totalRaw, dateRaw, ...rest] = parts;
  const warnings: string[] = [];

  const rut = rutRaw.replace(/\D/g, '');
  if (rut.length !== 12) return { ok: false, error: 'El RUT del QR no tiene 12 dígitos.' };
  if (!isValidRut(rut)) warnings.push('El dígito verificador del RUT no coincide.');

  const cfeType = Number(typeRaw);
  if (!Number.isInteger(cfeType)) return { ok: false, error: 'Tipo de comprobante inválido.' };
  if (!CFE_TYPES[cfeType]) warnings.push(`Tipo de CFE ${cfeType} no reconocido.`);

  const serie = serieRaw.toUpperCase();
  const number = numberRaw.replace(/^0+(?=\d)/, '');
  if (!/^[A-Z]{1,2}$/.test(serie) || !/^\d+$/.test(number)) {
    return { ok: false, error: 'Serie o número de comprobante inválidos.' };
  }

  const total = Number(totalRaw);
  if (!Number.isFinite(total)) return { ok: false, error: 'El total del QR no es un número.' };

  const date = parseCfeDate(dateRaw);
  if (!date) return { ok: false, error: 'La fecha del QR no se pudo leer.' };

  return {
    ok: true,
    warnings,
    header: { rut, cfeType, serie, number, total, date, securityCode: rest.join(',') || undefined, url: text },
  };
}

function parseCfeDate(raw: string): IsoDate | null {
  let y: number, m: number, d: number;
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = raw.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const RUT_WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Dígito verificador de un RUT uruguayo a partir de sus primeros 11 dígitos. -1 si no tiene dígito válido. */
export function rutCheckDigit(first11: string): number {
  const sum = RUT_WEIGHTS.reduce((acc, w, i) => acc + w * Number(first11[i]), 0);
  const dv = 11 - (sum % 11);
  if (dv === 11) return 0;
  if (dv === 10) return -1;
  return dv;
}

export function isValidRut(rut: string): boolean {
  if (!/^\d{12}$/.test(rut)) return false;
  return rutCheckDigit(rut.slice(0, 11)) === Number(rut[11]);
}

/** "211234560018" → "21 123456 0018" */
export function formatRut(rut: string): string {
  return rut.length === 12 ? `${rut.slice(0, 2)} ${rut.slice(2, 8)} ${rut.slice(8)}` : rut;
}

/** Clave para no guardar dos veces el mismo comprobante. */
export function cfeKey(h: Pick<CfeHeader, 'rut' | 'cfeType' | 'serie' | 'number'>): string {
  return `${h.rut}-${h.cfeType}-${h.serie}-${h.number}`;
}

/** "e-Ticket A 1.203.556" */
export function cfeLabel(h: Pick<CfeHeader, 'cfeType' | 'serie' | 'number'>): string {
  const n = h.number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cfeTypeName(h.cfeType)} ${h.serie} ${n}`;
}
