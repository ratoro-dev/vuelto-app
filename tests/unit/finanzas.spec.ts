import { describe, expect, it } from 'vitest';
import { billsForMonth, dueReminders, findBillPayment, type Bill } from '@/domain/bills';
import { seedBills, seedBudget, seedDebts, seedTickets } from '@/data/seed';
import { budgetStatus, monthProjection } from '@/domain/budget';
import { daysBetween } from '@/domain/dates';
import { debtsSummary, emergencyCoverage, goalProgress, nextDebtPayment, payDebt, type Debt, type SavingsGoal } from '@/domain/goals';
import { futureValue, portfolioValue, simulateGoal } from '@/domain/investment';
import type { Category, Line, Ticket } from '@/domain/types';

function gasto(date: string, lines: [Category, number][], extra: Partial<Ticket> = {}): Ticket {
  const ls: Line[] = lines.map(([category, amount]) => ({ raw: category, pretty: category, category, subcategory: 'Varios', amount }));
  return { id: `${date}-${Math.random()}`, source: 'texto', store: 'X', date, payment: 'Efectivo', lines: ls, discounts: [], sync: { state: 'subido' }, createdAt: '', ...extra };
}

describe('budgetStatus', () => {
  const budget = { total: 45000, categories: { Supermercado: 15000, 'Delivery y salidas': 6000 } as Partial<Record<Category, number>> };
  const tickets = [
    gasto('2026-10-02', [['Supermercado', 12400]]),
    gasto('2026-10-03', [['Delivery y salidas', 7150]]),
    gasto('2026-10-05', [['Transporte', 5200]]),
    gasto('2026-09-20', [['Supermercado', 99999]]),
  ];

  it('suma lo gastado en el mes y calcula lo que queda', () => {
    const s = budgetStatus(tickets, budget, '2026-10');
    expect(s).toMatchObject({ spent: 24750, total: 45000, remaining: 20250 });
    expect(s.usedShare).toBeCloseTo(0.55, 2);
  });

  it('ordena las categorías por gasto y marca las que se pasaron del límite', () => {
    const s = budgetStatus(tickets, budget, '2026-10');
    expect(s.categories.map((c) => [c.category, c.spent, c.limit, c.over])).toEqual([
      ['Supermercado', 12400, 15000, 0],
      ['Delivery y salidas', 7150, 6000, 1150],
      ['Transporte', 5200, undefined, 0],
    ]);
  });

  it('reparte los descuentos del ticket entre sus categorías, así la suma cierra con lo pagado', () => {
    const t = gasto('2026-10-04', [['Supermercado', 100], ['Hogar', 100]], { discounts: [{ label: 'Ley 19.210', kind: 'ley19210', amount: 20 }] });
    const s = budgetStatus([t], budget, '2026-10');
    expect(s.spent).toBe(180);
    // Delivery tiene límite y no tuvo gastos: aparece igual, en cero.
    expect(s.categories.map((c) => [c.category, c.spent])).toEqual([['Supermercado', 90], ['Hogar', 90], ['Delivery y salidas', 0]]);
  });

  it('compara con el mes anterior hasta el mismo día', () => {
    const s = budgetStatus(
      [gasto('2026-09-03', [['Otros', 1000]]), gasto('2026-09-25', [['Otros', 5000]]), gasto('2026-10-02', [['Otros', 920]])],
      budget,
      '2026-10',
      '2026-10-06',
    );
    expect(s.vsPrevious).toBeCloseTo(-0.08, 5);
  });
});

describe('metas de ahorro', () => {
  const fondo: SavingsGoal = {
    id: 'fondo',
    name: 'Fondo de emergencia',
    currency: 'UYU',
    target: 60000,
    monthly: 3500,
    movements: [
      { date: '2026-06-01', amount: 13000 },
      { date: '2026-09-01', amount: 3500 },
      { date: '2026-09-18', amount: -2000, note: 'Arreglo del auto' },
      { date: '2026-10-01', amount: 3500 },
    ],
    emergency: { monthlyFixed: 15000, months: 4 },
  };

  it('el avance sale de los aportes menos los retiros, y dice cuándo se completa', () => {
    expect(goalProgress(fondo, '2026-10-08')).toEqual({ saved: 18000, share: 0.3, remaining: 42000, monthsLeft: 12, etaMonth: '2027-10' });
  });

  it('el fondo de emergencia dice cuántos meses de gastos fijos cubre', () => {
    expect(emergencyCoverage(fondo)).toEqual({ monthsCovered: 1.2, months: 4, monthlyFixed: 15000 });
  });

  it('una meta cumplida no tiene fecha', () => {
    const lista = { ...fondo, target: 10000 };
    expect(goalProgress(lista, '2026-10-08')).toMatchObject({ share: 1, remaining: 0, monthsLeft: 0 });
  });
});

describe('deudas', () => {
  const deudas: Debt[] = [
    { id: 'tarjeta', name: 'Tarjeta de crédito', kind: 'tarjeta', balance: 24300, dueDate: '2026-10-09', minimum: 4860 },
    { id: 'prestamo', name: 'Préstamo', kind: 'prestamo', balance: 19200, installments: { paid: 6, total: 12, amount: 3200 } },
    { id: 'amigo', name: 'Te debe un amigo', kind: 'me-deben', balance: 2000, since: '2026-09-28' },
  ];

  it('separa lo que debés de lo que te deben', () => {
    expect(debtsSummary(deudas)).toEqual({ owed: 43500, owedToMe: 2000 });
  });

  it('pagar una cuota del préstamo baja el saldo y suma la cuota', () => {
    expect(payDebt(deudas[1], 3200)).toMatchObject({ balance: 16000, installments: { paid: 7, total: 12, amount: 3200 } });
  });

  it('el saldo nunca queda negativo', () => {
    expect(payDebt(deudas[0], 30000).balance).toBe(0);
  });
});

describe('facturas', () => {
  const bills: Bill[] = [
    { id: 'tarjeta', name: 'Tarjeta de crédito', amount: 4860, dueDay: 9, note: 'pago mínimo', keywords: ['tarjeta'], paid: {} },
    { id: 'luz', name: 'Luz', amount: 2150, dueDay: 12, autopay: true, keywords: ['ute', 'luz'], paid: {} },
    { id: 'internet', name: 'Internet y celular', amount: 1890, dueDay: 15, keywords: ['antel'], paid: {} },
    { id: 'gc', name: 'Gastos comunes', amount: 4540, dueDay: 20, keywords: ['gastos comunes'], paid: {} },
    { id: 'alquiler', name: 'Alquiler', amount: 18200, dueDay: 1, keywords: ['alquiler'], paid: { '2026-10': { date: '2026-10-01', method: 'Transferencia' } } },
  ];

  it('suma los gastos fijos del mes, lo pagado y lo que falta', () => {
    const r = billsForMonth(bills, '2026-10', [], '2026-10-06');
    expect(r).toMatchObject({ total: 31640, paid: 18200, pending: 13440 });
    expect(r.upcoming.map((b) => [b.bill.id, b.dueDate, b.daysLeft])).toEqual([
      ['tarjeta', '2026-10-09', 3],
      ['luz', '2026-10-12', 6],
      ['internet', '2026-10-15', 9],
      ['gc', '2026-10-20', 14],
    ]);
    expect(r.done.map((b) => b.bill.id)).toEqual(['alquiler']);
  });

  it('se marca sola si registraste el pago (mismo concepto y monto parecido)', () => {
    const pagoUte = { ...gasto('2026-10-11', [['Servicios', 2150]]), store: 'UTE' };
    expect(findBillPayment(bills[1], [pagoUte], '2026-10')?.id).toBe(pagoUte.id);
    expect(billsForMonth(bills, '2026-10', [pagoUte], '2026-10-11').paid).toBe(18200 + 2150);
    const otroMonto = { ...pagoUte, lines: [{ ...pagoUte.lines[0], amount: 900 }] };
    expect(findBillPayment(bills[1], [otroMonto], '2026-10')).toBeUndefined();
  });

  it('avisa dos días antes de cada vencimiento sin pagar', () => {
    expect(dueReminders(bills, [], '2026-10-07').map((b) => b.bill.id)).toEqual(['tarjeta']);
    expect(dueReminders(bills, [], '2026-10-10').map((b) => b.bill.id)).toEqual(['luz']);
  });

  it('cuenta días entre fechas locales', () => {
    expect(daysBetween('2026-10-06', '2026-10-09')).toBe(3);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
  });
});

describe('inversión', () => {
  it('valor actual, lo aportado y la ganancia', () => {
    const p = portfolioValue({ holdings: [{ id: 'a', name: 'Fondo indexado', valueUsd: 2900 }, { id: 'b', name: 'Letras', valueUsd: 1200 }, { id: 'c', name: 'Cripto', valueUsd: 720 }], contributedUsd: 4500 });
    expect(p).toMatchObject({ value: 4820, contributed: 4500, gain: 320 });
    expect(p.gainShare).toBeCloseTo(0.0711, 3);
  });

  it('simula aportes mensuales con un rendimiento anual', () => {
    expect(futureValue({ initial: 3100, monthly: 200, years: 5, annualRate: 0.05 })).toBeGreaterThan(17550);
    expect(futureValue({ initial: 3100, monthly: 200, years: 5, annualRate: 0.05 })).toBeLessThan(17650);
    expect(futureValue({ initial: 0, monthly: 100, years: 1, annualRate: 0 })).toBe(1200);
  });

  it('dice cuánto faltaría para la meta con esos supuestos', () => {
    const r = simulateGoal({ id: 'apto', name: 'Entrada del apartamento', targetUsd: 20000, savedUsd: 3100, byYear: 2031 }, { monthlyUsd: 200, years: 5, annualRate: 0.05 });
    expect(Math.round(r.projected / 100) * 100).toBe(17600);
    expect(Math.round(r.shortfall / 100) * 100).toBe(2400);
  });
});

describe('proyección y alertas del rediseño', () => {
  const today = '2026-10-08';

  it('proyección a fin de mes del día a día: lo gastado + lo del mes pasado desde hoy, sin las facturas', () => {
    // 32.550 gastados + 5.700 del mes pasado después del día 8; las facturas van aparte del presupuesto
    expect(monthProjection(seedTickets(today), seedBills(), '2026-10', today)).toBe(38250);
  });

  it('las facturas no salen del presupuesto: pagarlas no cambia lo gastado ni la proyección', () => {
    const bills = seedBills();
    const tickets = seedTickets(today);
    const pagoInternet: Ticket = gasto('2026-10-08', [['Servicios', 1890]], { store: 'Antel', id: 'pago-antel' });
    const withPayment = [...tickets, pagoInternet];
    // Registrado como gasto (por voz, foto o QR): se reconoce como el pago y no cuenta
    expect(budgetStatus(withPayment, seedBudget(), '2026-10', today, bills).spent).toBe(32550);
    expect(monthProjection(withPayment, bills, '2026-10', today)).toBe(38250);
    // Marcada con el círculo: tampoco
    const paidByHand = bills.map((b) => (b.id === 'internet' ? { ...b, paid: { '2026-10': { date: today } } } : b));
    expect(monthProjection(tickets, paidByHand, '2026-10', today)).toBe(38250);
    // Sin facturas cargadas, ese gasto es uno más del día a día
    expect(budgetStatus(withPayment, seedBudget(), '2026-10', today).spent).toBe(34440);
  });

  it('sin mes pasado usa el ritmo de este mes', () => {
    const tickets = seedTickets(today).filter((t) => t.date.startsWith('2026-10'));
    const projected = monthProjection(tickets, [], '2026-10', today);
    expect(projected).toBeCloseTo((32550 / 8) * 31, 0);
  });

  it('una categoría que usó el 80 % del límite está en riesgo', () => {
    const s = budgetStatus(seedTickets(today), seedBudget(), '2026-10', today);
    expect(s.categories.find((c) => c.category === 'Supermercado')).toMatchObject({ atRisk: true, over: 0 });
    expect(s.categories.find((c) => c.category === 'Delivery y salidas')).toMatchObject({ atRisk: false, over: 1150 });
    expect(s.categories.find((c) => c.category === 'Transporte')?.atRisk).toBe(false);
  });

  it('próximo pago de una deuda: la fecha de la tarjeta o el día de la cuota', () => {
    const [tarjeta, prestamo] = seedDebts(today);
    expect(nextDebtPayment(tarjeta, today)).toBe('2026-10-09');
    expect(nextDebtPayment(prestamo, today)).toBe('2026-10-20');
    expect(nextDebtPayment(prestamo, '2026-10-25')).toBe('2026-11-20');
  });
});
