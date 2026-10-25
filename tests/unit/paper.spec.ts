import { describe, expect, it } from 'vitest';
import { buildPaperLines, normalizePaperReading } from '@/domain/paper';
import { checkAgainstWrittenTotal, findSimilarTicket } from '@/domain/totals';
import type { Line, Ticket } from '@/domain/types';

const base = { description: 'Feria del sábado', category: 'Supermercado' as const, subcategory: 'Verdulería' };

function paperTicket(lines: Line[], writtenTotal?: number): Ticket {
  return { id: 'p', source: 'papel', store: 'Feria', date: '2026-10-03', payment: 'Efectivo', lines, discounts: [], writtenTotal, sync: { state: 'pendiente' }, createdAt: '' };
}

describe('buildPaperLines', () => {
  it('cada artículo es una línea con nombre legible, categoría y subcategoría', () => {
    const lines = buildPaperLines({ ...base, items: [{ name: 'tomate 1kg', amount: 80 }, { name: 'papa 2KG', amount: 70 }] });
    expect(lines).toEqual([
      { raw: 'tomate 1kg', pretty: 'Tomate 1 kg', category: 'Supermercado', subcategory: 'Verdulería', amount: 80 },
      { raw: 'papa 2KG', pretty: 'Papa 2 kg', category: 'Supermercado', subcategory: 'Verdulería', amount: 70 },
    ]);
  });

  it('descarta artículos sin monto y nombra los que no tienen nombre', () => {
    const lines = buildPaperLines({ ...base, items: [{ name: '', amount: 40 }, { name: 'zapallo', amount: 0 }, { name: 'perejil', amount: NaN }] });
    expect(lines.map((l) => [l.pretty, l.amount])).toEqual([['Artículo sin nombre', 40]]);
  });

  it('sin artículos, una sola línea por el total escrito', () => {
    const lines = buildPaperLines({ ...base, items: [], writtenTotal: 150 });
    expect(lines).toEqual([{ raw: 'Feria del sábado', pretty: 'Feria del sábado', category: 'Supermercado', subcategory: 'Verdulería', amount: 150 }]);
  });

  it('sin artículos ni total no hay nada que guardar', () => {
    expect(buildPaperLines({ ...base, items: [] })).toEqual([]);
  });
});

describe('normalizePaperReading', () => {
  it('limpia lo que devuelve el modelo: total 0 es "sin total", montos inválidos afuera, redondeo a centésimos', () => {
    const r = normalizePaperReading({
      store: '  Puesto de Mario ',
      items: [{ name: ' Tomate 1kg ', amount: 80 }, { name: 'Papa', amount: 70.004 }, { name: 'ilegible', amount: 0 }, { name: '', amount: 45 }, { name: 'perejil', amount: NaN }],
      total: 0,
    });
    expect(r).toEqual({ store: 'Puesto de Mario', items: [{ name: 'Tomate 1kg', amount: 80 }, { name: 'Papa', amount: 70 }, { name: '', amount: 45 }], writtenTotal: undefined });
  });
  it('sin comercio no inventa uno', () => {
    expect(normalizePaperReading({ store: ' ', items: [], total: 215 })).toEqual({ store: undefined, items: [], writtenTotal: 215 });
  });
});

describe('checkAgainstWrittenTotal', () => {
  const lines = buildPaperLines({ ...base, items: [{ name: 'tomate', amount: 80 }, { name: 'papa', amount: 70 }] });

  it('cuadra con el total escrito', () => expect(checkAgainstWrittenTotal(paperTicket(lines, 150)).status).toBe('ok'));
  it('avisa la diferencia si no cuadra', () => expect(checkAgainstWrittenTotal(paperTicket(lines, 160))).toEqual({ status: 'mismatch', diff: -10 }));
  it('sin total escrito no hay control', () => expect(checkAgainstWrittenTotal(paperTicket(lines)).status).toBe('no-total'));
  it('sin líneas no hay control', () => expect(checkAgainstWrittenTotal(paperTicket([], 150)).status).toBe('no-lines'));
});

describe('findSimilarTicket', () => {
  const existing = paperTicket(buildPaperLines({ ...base, items: [], writtenTotal: 150 }));

  it('encuentra un gasto del mismo día por el mismo monto', () => {
    expect(findSimilarTicket([existing], { date: '2026-10-03', amount: 150 })?.id).toBe('p');
  });
  it('otro día u otro monto no es parecido', () => {
    expect(findSimilarTicket([existing], { date: '2026-10-04', amount: 150 })).toBeUndefined();
    expect(findSimilarTicket([existing], { date: '2026-10-03', amount: 151 })).toBeUndefined();
  });
});
