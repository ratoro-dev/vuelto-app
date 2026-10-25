import { round2 } from './money';
import { CREDIT_NOTE_TYPES } from './cfe';
import type { Category, Discount, Ticket } from './types';

export interface TicketTotals {
  /** Suma de líneas antes de descuentos. */
  gross: number;
  /** Suma de descuentos (positivo). */
  discounts: number;
  /** Lo que se pagó: gross − discounts (negativo en notas de crédito). */
  net: number;
}

/** Diferencia aceptada entre la suma calculada y el total del QR, por redondeos del comercio. */
export const QR_TOLERANCE = 0.5;

/** Un ingreso no es un gasto: queda afuera del presupuesto, la proyección y las facturas. */
export function isIncome(t: Pick<Ticket, 'kind'>): boolean {
  return t.kind === 'ingreso';
}

/** Solo los gastos, para todo lo que suma lo gastado. */
export function expensesOnly<T extends Pick<Ticket, 'kind'>>(tickets: T[]): T[] {
  return tickets.some(isIncome) ? tickets.filter((t) => !isIncome(t)) : tickets;
}

export function isCreditNote(t: Pick<Ticket, 'cfe'>): boolean {
  return !!t.cfe && CREDIT_NOTE_TYPES.has(t.cfe.cfeType);
}

/**
 * Totales de un ticket. Los descuentos SIEMPRE se restan: numo mostraba la línea
 * "DESC. LEY 19210" sin restarla y sus totales no cerraban.
 */
export function ticketTotals(t: Pick<Ticket, 'lines' | 'discounts' | 'cfe'>): TicketTotals {
  const gross = round2(t.lines.reduce((s, l) => s + l.amount, 0));
  const discounts = round2(t.discounts.reduce((s, d) => s + d.amount, 0));
  const sign = isCreditNote(t) ? -1 : 1;
  return { gross: sign * gross, discounts: sign * discounts, net: round2(sign * (gross - discounts)) };
}

/** Categoría donde más se gastó en el ticket; da el ícono y el color de la fila. */
export function mainCategory(t: Pick<Ticket, 'lines'>): Category {
  const byCat = new Map<Category, number>();
  for (const l of t.lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.amount);
  let best: Category = 'Otros';
  let max = -Infinity;
  for (const [c, amount] of byCat) {
    if (amount > max) [best, max] = [c, amount];
  }
  return best;
}

export type QrCheck = { status: 'ok' } | { status: 'mismatch'; diff: number } | { status: 'no-qr' } | { status: 'no-lines' };

/** Compara la suma de líneas menos descuentos contra el total del QR. */
export function checkAgainstQr(t: Ticket): QrCheck {
  if (!t.cfe) return { status: 'no-qr' };
  return compareWithTotal(t, t.cfe.total);
}

export type WrittenTotalCheck = { status: 'ok' } | { status: 'mismatch'; diff: number } | { status: 'no-total' } | { status: 'no-lines' };

/** Lo mismo para un ticket de papel: la suma de los artículos contra el total escrito a mano. */
export function checkAgainstWrittenTotal(t: Ticket): WrittenTotalCheck {
  if (t.writtenTotal === undefined) return { status: 'no-total' };
  return compareWithTotal(t, t.writtenTotal);
}

function compareWithTotal(t: Ticket, total: number): { status: 'ok' } | { status: 'mismatch'; diff: number } | { status: 'no-lines' } {
  if (t.lines.length === 0) return { status: 'no-lines' };
  const diff = round2(Math.abs(ticketTotals(t).net) - total);
  return Math.abs(diff) <= QR_TOLERANCE ? { status: 'ok' } : { status: 'mismatch', diff };
}

/**
 * Un gasto del mismo día por el mismo monto. Sin QR no hay RUT ni número para detectar duplicados,
 * así que esto solo sirve para preguntar antes de guardar, nunca para descartar.
 */
export function findSimilarTicket(tickets: Ticket[], candidate: { date: string; amount: number }): Ticket | undefined {
  return tickets.find((t) => t.date === candidate.date && Math.abs(ticketTotals(t).net - candidate.amount) < 0.005);
}

export interface CategoryTotal {
  category: Category;
  amount: number;
  share: number;
  subcategories: { name: string; amount: number }[];
}

export interface PeriodSummary {
  count: number;
  gross: number;
  discounts: number;
  net: number;
  byDiscountKind: Record<Discount['kind'], number>;
  categories: CategoryTotal[];
}

export function summarize(all: Ticket[]): PeriodSummary {
  const tickets = expensesOnly(all);
  const byDiscountKind: PeriodSummary['byDiscountKind'] = { ley19210: 0, banco: 0, comercio: 0, otro: 0 };
  const cats = new Map<Category, { amount: number; subs: Map<string, number> }>();
  let gross = 0;
  let discounts = 0;
  for (const t of tickets) {
    const sign = isCreditNote(t) ? -1 : 1;
    for (const l of t.lines) {
      gross += sign * l.amount;
      const c = cats.get(l.category) ?? { amount: 0, subs: new Map() };
      c.amount += sign * l.amount;
      c.subs.set(l.subcategory, (c.subs.get(l.subcategory) ?? 0) + sign * l.amount);
      cats.set(l.category, c);
    }
    for (const d of t.discounts) {
      discounts += sign * d.amount;
      byDiscountKind[d.kind] += sign * d.amount;
    }
  }
  const categories = [...cats.entries()]
    .map(([category, c]) => ({
      category,
      amount: round2(c.amount),
      share: gross ? c.amount / gross : 0,
      subcategories: [...c.subs.entries()].map(([name, amount]) => ({ name, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);
  for (const k of Object.keys(byDiscountKind) as Discount['kind'][]) byDiscountKind[k] = round2(byDiscountKind[k]);
  return { count: tickets.length, gross: round2(gross), discounts: round2(discounts), net: round2(gross - discounts), byDiscountKind, categories };
}
