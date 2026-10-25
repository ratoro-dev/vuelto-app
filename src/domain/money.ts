/** Pesos por dólar para pasar a pesos un gasto en dólares, hasta que el servidor del bot dé la cotización del día. */
export const USD_RATE = 40;

/** Redondea a centésimos evitando errores de coma flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formatea pesos uruguayos: 1046.4 → "$ 1.046,40". */
export function formatUYU(n: number, opts: { sign?: boolean } = {}): string {
  const v = round2(n);
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}$ ${grouped},${dec}`;
}

/**
 * Lee un monto escrito por una persona en Uruguay: "1.046,40", "1046,4", "1046.40", "$ 250".
 * Devuelve NaN si no se puede interpretar.
 */
export function parseAmount(input: string): number {
  let s = String(input).replace(/[$\s]/g, '').trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastComma > lastDot) {
    // coma decimal, puntos de miles
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1 && lastComma > -1) {
    // punto decimal, comas de miles
    s = s.replace(/,/g, '');
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.046" sin decimales: punto de miles
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return round2(Number(s));
}

function grouped(n: number): string {
  const [int, dec] = Math.abs(round2(n)).toFixed(2).split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === '00' ? g : `${g},${dec}`;
}

/**
 * Montos como los muestra Rumbo: sin centésimos cuando el monto es entero.
 * 12450 → "$ 12.450" · 1046.4 → "$ 1.046,40" · -450 → "− $ 450".
 */
export function formatPesos(n: number, opts: { sign?: boolean } = {}): string {
  const v = round2(n);
  const sign = v < 0 ? '− ' : opts.sign && v > 0 ? '+ ' : '';
  return `${sign}$ ${grouped(v)}`;
}

/** 4820 → "USD 4.820". */
export function formatUsd(n: number, opts: { sign?: boolean } = {}): string {
  const v = round2(n);
  const sign = v < 0 ? '− ' : opts.sign && v > 0 ? '+ ' : '';
  return `${sign}USD ${grouped(v)}`;
}
