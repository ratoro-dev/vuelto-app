import { describe, expect, it } from 'vitest';
import { billAmount, billPaymentTicket, billsForMonth, type Bill } from '@/domain/bills';
import { budgetStatus } from '@/domain/budget';
import { goalReminderPlan, monthlyToReach, monthsBetween, type SavingsGoal } from '@/domain/goals';
import { futureValue, monthlyNeeded } from '@/domain/investment';
import { mergeRemote, toRemote } from '@/domain/sync';
import { summarize } from '@/domain/totals';
import type { Category, Ticket } from '@/domain/types';

function mov(date: string, category: Category, amount: number, extra: Partial<Ticket> = {}): Ticket {
  return {
    id: `${date}-${amount}`, source: 'texto', store: 'X', date, payment: 'Efectivo', discounts: [],
    lines: [{ raw: 'X', pretty: 'X', category, subcategory: 'Varios', amount }],
    sync: { state: 'pendiente' }, createdAt: `${date}T10:00:00.000Z`, ...extra,
  };
}

describe('ingresos', () => {
  const tickets = [mov('2026-10-02', 'Supermercado', 1200), mov('2026-10-03', 'Otros', 5000, { kind: 'ingreso', store: 'Reintegro' })];

  it('no cuentan como gasto en el presupuesto ni en el resumen', () => {
    expect(budgetStatus(tickets, { total: 45000, categories: {} }, '2026-10').spent).toBe(1200);
    expect(summarize(tickets).net).toBe(1200);
  });

  it('suben y bajan del servidor marcados como ingreso, con la nota', () => {
    const remote = toRemote({ ...tickets[1], note: 'De la mutualista' });
    expect(remote).toMatchObject({ kind: 'ingreso', note: 'De la mutualista', amount: 5000 });
    const [merged] = mergeRemote([], [{ ...remote, id: 'r1', clientId: undefined }], '2026-10-09T12:00:00.000Z');
    expect(merged).toMatchObject({ kind: 'ingreso', note: 'De la mutualista' });
  });
});

describe('nueva meta de ahorro', () => {
  it('cuenta los aportes hasta el mes elegido', () => {
    expect(monthsBetween('2026-10', '2027-10')).toBe(12);
    expect(monthsBetween('2026-10', '2026-12')).toBe(2);
  });

  it('reparte lo que falta en esos meses, redondeando para arriba', () => {
    expect(monthlyToReach({ target: 60000, saved: 18000, today: '2026-10-09', deadline: '2027-10' })).toEqual({ monthly: 3500, months: 12, remaining: 42000 });
    expect(monthlyToReach({ target: 10000, saved: 0, today: '2026-10-09', deadline: '2027-01' })).toEqual({ monthly: 3334, months: 3, remaining: 10000 });
    // Un mes elegido que ya pasó cuenta como un solo aporte
    expect(monthlyToReach({ target: 1000, saved: 0, today: '2026-10-09', deadline: '2026-10' }).months).toBe(1);
  });

  it('avisa el día 1 de los próximos meses, solo en las metas que lo piden y no se cumplieron', () => {
    const base: SavingsGoal = { id: 'auto', name: 'Auto', currency: 'UYU', target: 100000, monthly: 5000, movements: [], remind: true };
    const done: SavingsGoal = { ...base, id: 'lista', movements: [{ date: '2026-09-01', amount: 100000 }] };
    const quiet: SavingsGoal = { ...base, id: 'sin-aviso', remind: false };
    const plan = goalReminderPlan([base, done, quiet], '2026-10-09', '12:00');
    expect(plan.map((r) => r.at)).toEqual(['2026-11-01T10:00', '2026-12-01T10:00']);
    expect(plan[0]).toMatchObject({ goalId: 'auto', title: 'Aporte a Auto', body: 'Este mes te toca $ 5.000.' });
    // El día 1 antes de las 10 también avisa ese mismo día
    expect(goalReminderPlan([base], '2026-11-01', '08:30')[0].at).toBe('2026-11-01T10:00');
  });
});

describe('nueva meta de inversión', () => {
  it('el aporte que hace llegar a la meta, con el rendimiento elegido', () => {
    const needed = monthlyNeeded({ initial: 3100, target: 20000, years: 5, annualRate: 0.05 });
    expect(futureValue({ initial: 3100, monthly: needed, years: 5, annualRate: 0.05 })).toBeGreaterThanOrEqual(20000);
    expect(futureValue({ initial: 3100, monthly: needed - 1, years: 5, annualRate: 0.05 })).toBeLessThan(20000);
    expect(monthlyNeeded({ initial: 0, target: 1200, years: 1, annualRate: 0 })).toBe(100);
    expect(monthlyNeeded({ initial: 30000, target: 20000, years: 5, annualRate: 0.05 })).toBe(0);
  });
});

describe('facturas que cambian cada mes', () => {
  const luz: Bill = { id: 'luz', name: 'Luz', amount: 2150, variable: true, dueDay: 12, keywords: ['ute', 'luz'], paid: {} };

  it('sin el monto del mes es un estimado; con el monto cargado, ese', () => {
    const [s] = billsForMonth([luz], '2026-10', [], '2026-10-09').upcoming;
    expect(s).toMatchObject({ amount: 2150, estimated: true });
    const conMonto = { ...luz, amounts: { '2026-10': 2380 } };
    expect(billAmount(conMonto, '2026-10')).toBe(2380);
    expect(billAmount(conMonto, '2026-11')).toBe(2150);
    expect(billsForMonth([conMonto], '2026-10', [], '2026-10-09')).toMatchObject({ total: 2380, pending: 2380 });
  });

  it('el pago registrado se reconoce aunque el monto cambie bastante, y cuenta lo pagado de verdad', () => {
    const pago = mov('2026-10-10', 'Servicios', 2900, { store: 'UTE' });
    const state = billsForMonth([luz], '2026-10', [pago], '2026-10-11');
    expect(state.done[0]).toMatchObject({ amount: 2900, estimated: false, paid: { ticketId: pago.id } });
    expect(state.paid).toBe(2900);
    // Una factura fija solo se reconoce con un monto parecido (±5 %)
    const fija = { ...luz, variable: false };
    expect(billsForMonth([fija], '2026-10', [pago], '2026-10-11').done).toHaveLength(0);
  });
});

describe('gastos fijos', () => {
  const internet: Bill = { id: 'internet', name: 'Internet y celular', amount: 1890, dueDay: 15, keywords: ['antel', 'internet'], paid: {} };
  const alquiler: Bill = { id: 'alquiler', name: 'Alquiler', amount: 18200, dueDay: 1, keywords: ['alquiler'], paid: {} };

  it('marcar una factura pagada anota el gasto, con la categoría de la factura', () => {
    const t = billPaymentTicket(internet, { amount: 1890, date: '2026-10-09', payment: 'Transferencia' });
    expect(t).toMatchObject({ store: 'Internet y celular', billId: 'internet', payment: 'Transferencia' });
    expect(t.lines[0]).toMatchObject({ category: 'Servicios', subcategory: 'Internet y celular', amount: 1890 });
    expect(billPaymentTicket(alquiler, { amount: 18200, date: '2026-10-01', payment: 'Transferencia' }).lines[0]).toMatchObject({ category: 'Servicios', subcategory: 'Alquiler' });
  });

  it('el gasto anotado deja la factura pagada y no sale del presupuesto', () => {
    const pago = { ...billPaymentTicket(alquiler, { amount: 18200, date: '2026-10-01', payment: 'Transferencia' }), id: 'p1', sync: { state: 'pendiente' as const }, createdAt: '' };
    const tickets = [mov('2026-10-02', 'Supermercado', 1200), pago];
    expect(billsForMonth([alquiler, internet], '2026-10', tickets, '2026-10-09')).toMatchObject({ total: 20090, paid: 18200, pending: 1890 });
    // Aunque la factura se borre después, el gasto sigue siendo un gasto fijo
    expect(budgetStatus(tickets, { total: 45000, categories: {} }, '2026-10').spent).toBe(1200);
  });
});
