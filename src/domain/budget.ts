import { billPaymentIds, type Bill } from './bills';
import { daysInMonth, monthKey, shiftMonth } from './dates';
import { round2 } from './money';
import { expensesOnly, ticketTotals } from './totals';
import type { Category, IsoDate, Ticket } from './types';

/** Presupuesto del mes: un total y, si la persona quiere, un límite por categoría. */
export interface Budget {
  total: number;
  categories: Partial<Record<Category, number>>;
}

export interface CategoryBudget {
  category: Category;
  spent: number;
  limit?: number;
  /** Cuánto se pasó del límite (0 si no se pasó o no tiene límite). */
  over: number;
  /** Usó el 80 % del límite o más sin pasarse: "en riesgo". */
  atRisk: boolean;
}

export interface BudgetStatus {
  month: string;
  spent: number;
  total: number;
  remaining: number;
  /** Fracción del total usada (puede pasar de 1). */
  usedShare: number;
  /** Ordenadas por gasto; incluye las que tienen límite aunque no tengan gastos. */
  categories: CategoryBudget[];
  /** Cambio contra el mes anterior hasta el mismo día: -0.08 = "8% menos que septiembre". */
  vsPrevious?: number;
}

/**
 * Gasto por categoría con los descuentos del ticket repartidos en proporción a sus líneas,
 * para que la suma de las categorías sea exactamente lo pagado.
 */
function spentByCategory(tickets: Ticket[]): Map<Category, number> {
  const out = new Map<Category, number>();
  for (const t of tickets) {
    const { gross, net } = ticketTotals(t);
    const factor = gross ? net / gross : 0;
    const sign = Math.sign(gross) || 1;
    for (const l of t.lines) out.set(l.category, (out.get(l.category) ?? 0) + sign * l.amount * Math.abs(factor));
  }
  return out;
}

function spentUntilDay(tickets: Ticket[], month: string, day: number): number {
  return round2(
    tickets.filter((t) => monthKey(t.date) === month && Number(t.date.slice(8, 10)) <= day).reduce((s, t) => s + ticketTotals(t).net, 0),
  );
}

/**
 * El presupuesto cubre el gasto del día a día: quedan afuera los ingresos y el pago de las facturas (los gastos
 * fijos se siguen aparte, en Facturas), aunque ese pago se haya registrado como gasto.
 */
function dayToDay(all: Ticket[], bills: Bill[], months: string[]): Ticket[] {
  const expenses = expensesOnly(all).filter((t) => !t.billId);
  if (!bills.length) return expenses;
  const payments = billPaymentIds(bills, expenses, months);
  return payments.size ? expenses.filter((t) => !payments.has(t.id)) : expenses;
}

export function budgetStatus(all: Ticket[], budget: Budget, month: string, today?: IsoDate, bills: Bill[] = []): BudgetStatus {
  const tickets = dayToDay(all, bills, [month, shiftMonth(month, -1)]);
  const monthTickets = tickets.filter((t) => monthKey(t.date) === month);
  const byCat = spentByCategory(monthTickets);
  for (const c of Object.keys(budget.categories) as Category[]) if (!byCat.has(c)) byCat.set(c, 0);

  const categories = [...byCat.entries()]
    .map(([category, raw]) => {
      const spent = round2(raw);
      const limit = budget.categories[category];
      const over = limit !== undefined ? round2(Math.max(0, spent - limit)) : 0;
      return { category, spent, limit, over, atRisk: limit !== undefined && limit > 0 && over === 0 && spent >= limit * 0.8 };
    })
    .sort((a, b) => b.spent - a.spent);

  const spent = round2(monthTickets.reduce((s, t) => s + ticketTotals(t).net, 0));
  const status: BudgetStatus = {
    month,
    spent,
    total: budget.total,
    remaining: round2(budget.total - spent),
    usedShare: budget.total ? spent / budget.total : 0,
    categories,
  };

  if (today && monthKey(today) === month) {
    const day = Number(today.slice(8, 10));
    const prev = spentUntilDay(tickets, shiftMonth(month, -1), day);
    if (prev > 0) status.vsPrevious = (spentUntilDay(tickets, month, day) - prev) / prev;
  }
  return status;
}

/**
 * Proyección a fin de mes del gasto del día a día: lo gastado, más lo que se gastó el mes pasado desde este mismo
 * día hasta fin de mes, redondeado al peso. Sin datos del mes pasado se usa el ritmo diario de este mes. Las facturas no entran:
 * van aparte del presupuesto, así que pagarlas no la mueve.
 */
export function monthProjection(all: Ticket[], bills: Bill[], month: string, today: IsoDate): number {
  const day = Number(today.slice(8, 10));
  const prev = shiftMonth(month, -1);
  const tickets = dayToDay(all, bills, [month, prev]);
  const spent = round2(tickets.filter((t) => monthKey(t.date) === month).reduce((s, t) => s + ticketTotals(t).net, 0));
  const prevTickets = tickets.filter((t) => monthKey(t.date) === prev);
  const rest = prevTickets.length
    ? prevTickets.filter((t) => Number(t.date.slice(8, 10)) > day).reduce((s, t) => s + ticketTotals(t).net, 0)
    : day > 0
      ? (spent / day) * (daysInMonth(month) - day)
      : 0;
  // Es una estimación: en pesos enteros
  return Math.round(spent + rest);
}
