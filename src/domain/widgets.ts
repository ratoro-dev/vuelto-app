import { billsForMonth, type Bill } from './bills';
import { budgetStatus, type Budget } from './budget';
import { daysBetween, dueLabel, monthKey, monthName, weekday } from './dates';
import { formatPesos, round2 } from './money';
import { isIncome, ticketTotals } from './totals';
import type { IsoDate, Ticket } from './types';

/**
 * Lo que muestran los widgets, la pantalla bloqueada y Siri ("¿cuánto me queda?"). La app lo arma con los
 * textos ya formateados y lo deja en el contenedor compartido (App Group): el widget no recalcula nada.
 */
export interface WidgetSnapshot {
  /** 'octubre' */
  month: string;
  available: number;
  availableText: string;
  spentText: string;
  budgetText: string;
  /** Fracción del presupuesto usada, entre 0 y 1 (los widgets no muestran más de 1). */
  usedShare: number;
  /** "72% de octubre usado" */
  usedText: string;
  over: boolean;
  todayText: string;
  today: { name: string; amountText: string }[];
  /** Gastos que todavía no subieron a la cuenta o hay que revisar. */
  pendingCount: number;
  /** `shortText`: "Tarjeta vence el viernes", para la pantalla bloqueada. */
  nextBill?: { name: string; amountText: string; dueText: string; shortText: string; soon: boolean };
  /** Cuándo se armó, para que el widget pueda decir "actualizado hace…". */
  updatedAt: string;
}

export function widgetSnapshot(input: {
  tickets: Ticket[];
  budget: Budget;
  bills: Bill[];
  pendingCount: number;
  today: IsoDate;
  now: Date;
}): WidgetSnapshot {
  const { tickets, budget, bills, today } = input;
  const month = monthKey(today);
  const status = budgetStatus(tickets, budget, month, today, bills);
  const todays = tickets
    .filter((t) => t.date === today && t.lines.length && !isIncome(t))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const todayTotal = round2(todays.reduce((sum, t) => sum + ticketTotals(t).net, 0));
  const next = billsForMonth(bills, month, tickets, today).upcoming.find((b) => b.daysLeft >= 0);

  const snapshot: WidgetSnapshot = {
    month: monthName(month),
    available: status.remaining,
    availableText: formatPesos(status.remaining),
    spentText: formatPesos(status.spent),
    budgetText: formatPesos(status.total),
    usedShare: Math.min(1, Math.max(0, status.usedShare)),
    usedText: `${Math.round(status.usedShare * 100)}% de ${monthName(month)} usado`,
    over: status.remaining < 0,
    todayText: formatPesos(todayTotal),
    today: todays.slice(0, 3).map((t) => ({ name: t.store, amountText: formatPesos(Math.abs(ticketTotals(t).net)) })),
    pendingCount: input.pendingCount,
    updatedAt: input.now.toISOString(),
  };
  if (next) {
    snapshot.nextBill = {
      name: next.bill.name,
      amountText: `${next.estimated ? '≈ ' : ''}${formatPesos(next.amount)}`,
      dueText: dueLabel(next.dueDate, today),
      shortText: `${next.bill.name.split(' de ')[0]} vence ${whenDue(next.dueDate, today)}`,
      soon: next.daysLeft <= 2,
    };
  }
  return snapshot;
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "hoy", "mañana", "el viernes" (esta semana) o "el 20". */
function whenDue(due: IsoDate, today: IsoDate): string {
  const left = daysBetween(today, due);
  if (left === 0) return 'hoy';
  if (left === 1) return 'mañana';
  if (left > 1 && left < 7) return `el ${DAY_NAMES[weekday(due)]}`;
  return `el ${Number(due.slice(8, 10))}`;
}
