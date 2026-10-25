import { daysInMonth, monthKey, shiftMonth } from './dates';
import { formatPesos, formatUsd, round2 } from './money';
import type { IsoDate } from './types';

export type Currency = 'UYU' | 'USD';

/** Un aporte (positivo) o un retiro (negativo) de una meta de ahorro. */
export interface Movement {
  date: IsoDate;
  amount: number;
  note?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  currency: Currency;
  target: number;
  /** Aporte mensual que la persona se propuso. */
  monthly: number;
  movements: Movement[];
  /** Dónde está la plata: "Caja de ahorro". */
  where?: string;
  /** Solo el fondo de emergencia: cuántos meses de gastos fijos quiere cubrir y de cuánto es cada mes. */
  emergency?: { monthlyFixed: number; months: number };
  /** Para cuándo la quiere: '2027-10'. */
  deadline?: string;
  /** Avisar el día 1 de cada mes que toca el aporte. */
  remind?: boolean;
}

export interface GoalProgress {
  saved: number;
  /** Entre 0 y 1. */
  share: number;
  remaining: number;
  /** Meses que faltan al ritmo del aporte mensual (0 si ya se cumplió). */
  monthsLeft?: number;
  /** Mes en que se completa: '2027-10'. */
  etaMonth?: string;
}

export function goalSaved(goal: SavingsGoal): number {
  return round2(goal.movements.reduce((s, m) => s + m.amount, 0));
}

export function goalProgress(goal: SavingsGoal, today: IsoDate): GoalProgress {
  const saved = goalSaved(goal);
  const remaining = round2(Math.max(0, goal.target - saved));
  const progress: GoalProgress = { saved, share: goal.target ? Math.min(1, saved / goal.target) : 0, remaining };
  if (remaining === 0) progress.monthsLeft = 0;
  else if (goal.monthly > 0) {
    progress.monthsLeft = Math.ceil(remaining / goal.monthly);
    progress.etaMonth = shiftMonth(monthKey(today), progress.monthsLeft);
  }
  return progress;
}

/** Meses entre dos claves de mes: de '2026-10' a '2027-10' son 12. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Cuánto aportar por mes para llegar a tiempo: lo que falta repartido en los meses hasta la fecha elegida
 * (de octubre 2026 a octubre 2027 son 12 aportes), redondeado para arriba al peso.
 */
export function monthlyToReach(input: { target: number; saved: number; today: IsoDate; deadline: string }): { monthly: number; months: number; remaining: number } {
  const remaining = round2(Math.max(0, input.target - input.saved));
  const months = Math.max(1, monthsBetween(monthKey(input.today), input.deadline));
  return { monthly: remaining ? Math.ceil(remaining / months) : 0, months, remaining };
}

/** El aviso del aporte de una meta de ahorro. */
export interface GoalReminder {
  id: number;
  goalId: string;
  /** Fecha y hora local del aviso: '2026-11-01T10:00'. */
  at: string;
  title: string;
  body: string;
}

function goalReminderId(goalId: string, month: string): number {
  let h = 11;
  for (const c of `meta|${goalId}|${month}`) h = (h * 31 + c.charCodeAt(0)) % 2_000_000_000;
  return h + 1;
}

/**
 * Los avisos del aporte, el día 1 de este mes (si todavía no pasó la hora) y de los dos siguientes, para las metas
 * que lo piden y todavía no se cumplieron. `nowTime` es la hora actual 'HH:MM'.
 */
export function goalReminderPlan(goals: SavingsGoal[], today: IsoDate, nowTime: string, hour = '10:00'): GoalReminder[] {
  const out: GoalReminder[] = [];
  const month = monthKey(today);
  for (const goal of goals) {
    if (!goal.remind || goalProgress(goal, today).remaining === 0) continue;
    for (const m of [month, shiftMonth(month, 1), shiftMonth(month, 2)]) {
      const day = `${m}-01`;
      if (day < today || (day === today && nowTime >= hour)) continue;
      out.push({
        id: goalReminderId(goal.id, m),
        goalId: goal.id,
        at: `${day}T${hour}`,
        title: `Aporte a ${goal.name}`,
        body: goal.monthly > 0 ? `Este mes te toca ${formatGoalMoney(goal.currency, goal.monthly)}.` : 'Sumale algo a tu meta este mes.',
      });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

function formatGoalMoney(currency: Currency, n: number): string {
  return currency === 'USD' ? formatUsd(n) : formatPesos(n);
}

/** "Cubre 1,2 meses de tus gastos fijos". */
export function emergencyCoverage(goal: SavingsGoal): { monthsCovered: number; months: number; monthlyFixed: number } | undefined {
  if (!goal.emergency) return undefined;
  const { monthlyFixed, months } = goal.emergency;
  return { monthsCovered: monthlyFixed ? Math.round((goalSaved(goal) / monthlyFixed) * 10) / 10 : 0, months, monthlyFixed };
}

export type DebtKind = 'tarjeta' | 'prestamo' | 'me-deben';

export interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  /** Lo que falta pagar (o, en me-deben, lo que te deben). */
  balance: number;
  dueDate?: IsoDate;
  /** Pago mínimo de la tarjeta. */
  minimum?: number;
  installments?: { paid: number; total: number; amount: number };
  /** Día del mes en que vence la cuota (préstamos). */
  dueDay?: number;
  /** Desde cuándo te deben. */
  since?: IsoDate;
}

export function debtsSummary(debts: Debt[]): { owed: number; owedToMe: number } {
  const sum = (ds: Debt[]) => round2(ds.reduce((s, d) => s + d.balance, 0));
  return { owed: sum(debts.filter((d) => d.kind !== 'me-deben')), owedToMe: sum(debts.filter((d) => d.kind === 'me-deben')) };
}

/** Registra un pago: baja el saldo (nunca por debajo de cero) y, en un préstamo, suma las cuotas que cubre. */
export function payDebt(debt: Debt, amount: number): Debt {
  const next: Debt = { ...debt, balance: round2(Math.max(0, debt.balance - amount)) };
  if (debt.installments && debt.installments.amount > 0) {
    const covered = Math.floor(round2(amount / debt.installments.amount));
    next.installments = { ...debt.installments, paid: Math.min(debt.installments.total, debt.installments.paid + covered) };
  }
  return next;
}

/** Cuándo es el próximo pago: la fecha de la tarjeta o el día de la cuota de este mes (o del que viene). */
export function nextDebtPayment(debt: Debt, today: IsoDate): IsoDate | undefined {
  if (debt.dueDate) return debt.dueDate;
  if (!debt.dueDay) return undefined;
  const month = today.slice(0, 7);
  const thisMonth = `${month}-${String(Math.min(debt.dueDay, daysInMonth(month))).padStart(2, '0')}`;
  if (thisMonth >= today) return thisMonth;
  const next = shiftMonth(month, 1);
  return `${next}-${String(Math.min(debt.dueDay, daysInMonth(next))).padStart(2, '0')}`;
}
