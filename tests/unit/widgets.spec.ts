import { describe, expect, it } from 'vitest';
import { seedBills, seedBudget, seedTickets } from '@/data/seed';
import { billReminderPlan } from '@/domain/bills';
import { deepLinkRoute } from '@/domain/deepLinks';
import { widgetSnapshot } from '@/domain/widgets';

// Jueves 8 de octubre de 2026
const today = '2026-10-08';

describe('widgetSnapshot', () => {
  it('lo que muestran los widgets sale del presupuesto, los gastos de hoy y la próxima factura', () => {
    const s = widgetSnapshot({
      tickets: seedTickets(today),
      budget: seedBudget(),
      bills: seedBills(),
      pendingCount: 3,
      today,
      now: new Date('2026-10-08T15:00:00Z'),
    });
    expect(s).toMatchObject({
      month: 'octubre',
      availableText: '$ 12.450',
      spentText: '$ 32.550',
      budgetText: '$ 45.000',
      over: false,
      pendingCount: 3,
      usedText: '72% de octubre usado',
      nextBill: { name: 'Tarjeta de crédito', amountText: '$ 4.860', dueText: 'Vie 9 · mañana', shortText: 'Tarjeta vence mañana', soon: true },
    });
    // Los montos de "últimos gastos" van sin signo, como en la propuesta
    expect(s.today[0].amountText.startsWith('$')).toBe(true);
    expect(s.usedShare).toBeCloseTo(32550 / 45000);
    expect(s.today).toHaveLength(3);
    expect(s.updatedAt).toBe('2026-10-08T15:00:00.000Z');
  });
});

describe('deepLinkRoute', () => {
  it('lleva cada link a su pantalla', () => {
    expect(deepLinkRoute('rumbo://registrar?modo=voz&escuchar=1')).toBe('/tabs/registrar?modo=voz&escuchar=1');
    expect(deepLinkRoute('rumbo://registrar?modo=qr')).toBe('/tabs/registrar?modo=qr');
    expect(deepLinkRoute('rumbo://registrar?modo=qr&escuchar=1')).toBe('/tabs/registrar?modo=qr');
    expect(deepLinkRoute('rumbo://registrar?modo=cualquiera')).toBe('/tabs/registrar');
    expect(deepLinkRoute('rumbo://facturas')).toBe('/tabs/inicio/facturas');
    expect(deepLinkRoute('rumbo://presupuesto')).toBe('/tabs/presupuesto');
    expect(deepLinkRoute('rumbo://inicio')).toBe('/tabs/inicio');
    expect(deepLinkRoute('rumbo://movimientos')).toBe('/tabs/movimientos');
    expect(deepLinkRoute('rumbo://sync')).toBe('/tabs/movimientos/sync');
    expect(deepLinkRoute('rumbo://otra-cosa')).toBe('/tabs/inicio');
  });

  it('ignora los links que no son de Rumbo', () => {
    expect(deepLinkRoute('https://rumbo.uy/registrar')).toBeUndefined();
    expect(deepLinkRoute('no es un link')).toBeUndefined();
  });
});

describe('billReminderPlan', () => {
  it('avisa 2 días antes las facturas sin pagar ni débito automático, de este mes y el que viene', () => {
    const plan = billReminderPlan(seedBills(), seedTickets(today), today, '09:00');
    const october = plan.filter((r) => r.month === '2026-10').map((r) => `${r.title} ${r.at}`);
    // La tarjeta vence mañana: el día del aviso ya pasó, así que avisa hoy a las 10
    expect(october).toEqual(['Tarjeta de crédito 2026-10-08T10:00', 'Internet y celular 2026-10-13T10:00', 'Gastos comunes 2026-10-18T10:00']);
    // La luz tiene débito automático y el alquiler ya está pago
    expect(plan.some((r) => r.title === 'Luz')).toBe(false);
    expect(plan.some((r) => r.month === '2026-11' && r.title === 'Alquiler')).toBe(true);
    expect(plan[0].body).toBe('Vence mañana (vie 9) · $ 4.860 · pago mínimo');
  });

  it('si la hora del aviso de hoy ya pasó, no lo programa', () => {
    const plan = billReminderPlan(seedBills(), seedTickets(today), today, '18:30');
    expect(plan.some((r) => r.at.startsWith(today))).toBe(false);
  });

  it('los ids no cambian entre aperturas y no se repiten', () => {
    const a = billReminderPlan(seedBills(), seedTickets(today), today, '09:00');
    const b = billReminderPlan(seedBills(), seedTickets(today), today, '09:00');
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
  });
});
