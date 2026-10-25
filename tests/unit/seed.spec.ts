import { describe, expect, it } from 'vitest';
import { seedBills, seedBudget, seedDebts, seedGoals, seedPortfolio, seedTickets } from '@/data/seed';
import { billsForMonth } from '@/domain/bills';
import { budgetStatus } from '@/domain/budget';
import { debtsSummary, goalProgress } from '@/domain/goals';
import { portfolioValue } from '@/domain/investment';

describe('datos de ejemplo de Rumbo', () => {
  const today = '2026-10-08';
  const tickets = seedTickets(today);

  it('el presupuesto de octubre da los números de la propuesta', () => {
    const s = budgetStatus(tickets, seedBudget(), '2026-10', today);
    expect(s).toMatchObject({ spent: 32550, total: 45000, remaining: 12450 });
    expect(s.categories.map((c) => [c.category, c.spent])).toEqual([
      ['Supermercado', 12400],
      ['Delivery y salidas', 7150],
      ['Transporte', 5200],
      ['Salud', 4550],
      ['Otros', 3250],
    ]);
    expect(s.categories[1].over).toBe(1150);
    expect(s.vsPrevious).toBeCloseTo(-0.08, 2);
  });

  it('hoy hay 3 pendientes de subir y uno para revisar', () => {
    const hoy = tickets.filter((t) => t.date === today);
    expect(hoy.filter((t) => t.sync.state === 'pendiente' && !t.review).map((t) => t.store)).toEqual(['Feria', 'Almacén La Esquina', 'Almuerzo']);
    expect(hoy.filter((t) => t.review).map((t) => t.store)).toEqual(['Farmacia']);
  });

  it('facturas, metas, deudas e inversión cuadran', () => {
    expect(billsForMonth(seedBills(), '2026-10', tickets, '2026-10-06')).toMatchObject({ total: 31640, paid: 18200, pending: 13440 });
    expect(goalProgress(seedGoals(today)[0], today)).toMatchObject({ saved: 18000, share: 0.3, etaMonth: '2027-10' });
    expect(goalProgress(seedGoals(today)[1], today)).toMatchObject({ saved: 550, monthsLeft: 3 });
    expect(debtsSummary(seedDebts(today))).toEqual({ owed: 43500, owedToMe: 2000 });
    expect(portfolioValue(seedPortfolio())).toMatchObject({ value: 4820, gain: 320 });
  });
});
