import { describe, expect, it } from 'vitest';
import { DEMO_SCAN, seedTickets } from '@/data/seed';
import { parseCfeQr } from '@/domain/cfe';
import { checkAgainstQr, mainCategory, summarize, ticketTotals } from '@/domain/totals';
import type { Ticket } from '@/domain/types';

function demoTicket(): Ticket {
  const r = parseCfeQr(DEMO_SCAN.qr);
  if (!r.ok) throw new Error(r.error);
  return { id: 'x', source: 'qr', store: 'X', date: r.header.date, payment: 'Débito', lines: DEMO_SCAN.lines, discounts: DEMO_SCAN.discounts, cfe: r.header, sync: { state: 'subido' }, createdAt: '' };
}

describe('ticketTotals', () => {
  it('resta los descuentos (incluida la Ley 19.210)', () => {
    expect(ticketTotals(demoTicket())).toEqual({ gross: 1055, discounts: 8.6, net: 1046.4 });
  });
  it('las notas de crédito van en negativo', () => {
    const t = demoTicket();
    t.cfe = { ...t.cfe!, cfeType: 102 };
    expect(ticketTotals(t).net).toBe(-1046.4);
  });
});

describe('checkAgainstQr', () => {
  it('cuadra con el total del QR', () => expect(checkAgainstQr(demoTicket()).status).toBe('ok'));
  it('detecta una línea mal leída', () => {
    const t = demoTicket();
    t.lines = t.lines.map((l, i) => (i === 0 ? { ...l, amount: l.amount + 10 } : l));
    expect(checkAgainstQr(t)).toEqual({ status: 'mismatch', diff: 10 });
  });
  it('sin QR no hay chequeo', () => {
    const t = demoTicket();
    delete t.cfe;
    expect(checkAgainstQr(t).status).toBe('no-qr');
  });
});

describe('mainCategory', () => {
  it('es la categoría donde más se gastó, no la de la primera línea', () => {
    const t = demoTicket();
    t.lines = [
      { raw: 'A', pretty: 'A', category: 'Salud', subcategory: 'Farmacia', amount: 100 },
      { raw: 'B', pretty: 'B', category: 'Hogar', subcategory: 'Bazar', amount: 80 },
      { raw: 'C', pretty: 'C', category: 'Hogar', subcategory: 'Bazar', amount: 80 },
    ];
    expect(mainCategory(t)).toBe('Hogar');
  });
  it('sin líneas es Otros', () => {
    const t = demoTicket();
    t.lines = [];
    expect(mainCategory(t)).toBe('Otros');
  });
});

describe('summarize', () => {
  it('el total del período es la suma de los netos de cada ticket, y ordena las categorías por gasto', () => {
    const otro: Ticket = {
      ...demoTicket(),
      id: 'y',
      discounts: [{ label: 'Beneficio banco 20%', kind: 'banco', amount: 40 }],
      lines: [{ raw: 'NAFTA', pretty: 'Nafta', category: 'Transporte', subcategory: 'Combustible', amount: 2000 }],
    };
    delete otro.cfe;
    const tickets = [demoTicket(), otro];
    const s = summarize(tickets);
    expect(s.net).toBeCloseTo(tickets.reduce((acc, t) => acc + ticketTotals(t).net, 0), 2);
    expect(s.categories[0].category).toBe('Transporte');
    expect(s.byDiscountKind.ley19210).toBeCloseTo(8.6, 2);
    expect(s.byDiscountKind.banco).toBe(40);
  });
  it('los tickets con QR del seed cuadran con su QR', () => {
    for (const t of seedTickets('2026-10-08')) expect(['ok', 'no-qr']).toContain(checkAgainstQr(t).status);
  });
});
