import { describe, expect, it } from 'vitest';
import { shiftMonth } from '@/domain/dates';
import { formatUYU, parseAmount } from '@/domain/money';
import { prettifyRaw } from '@/domain/products';

describe('money', () => {
  it('formatea pesos uruguayos', () => {
    expect(formatUYU(1046.4)).toBe('$ 1.046,40');
    expect(formatUYU(-11.36)).toBe('−$ 11,36');
    expect(formatUYU(0)).toBe('$ 0,00');
  });
  it('lee montos escritos a mano', () => {
    expect(parseAmount('1.046,40')).toBe(1046.4);
    expect(parseAmount('1046,4')).toBe(1046.4);
    expect(parseAmount('1046.40')).toBe(1046.4);
    expect(parseAmount('1.046')).toBe(1046);
    expect(parseAmount('$ 250')).toBe(250);
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('')).toBeNaN();
  });
});

describe('products', () => {
  it('hace legible el texto del ticket', () => {
    expect(prettifyRaw('YERBA C/PALO 1KG')).toBe('Yerba con palo 1 kg');
    expect(prettifyRaw('LECHE DESCR. 1L X3')).toBe('Leche descremada 1 L ×3');
  });
});

describe('dates', () => {
  it('cambia de mes cruzando años', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('formatos de Rumbo', () => {
  it('pesos sin centésimos cuando el monto es entero', async () => {
    const { formatPesos, formatUsd } = await import('@/domain/money');
    expect(formatPesos(12450)).toBe('$ 12.450');
    expect(formatPesos(1046.4)).toBe('$ 1.046,40');
    expect(formatPesos(-450)).toBe('− $ 450');
    expect(formatPesos(2000, { sign: true })).toBe('+ $ 2.000');
    expect(formatUsd(4820)).toBe('USD 4.820');
    expect(formatUsd(-2000)).toBe('− USD 2.000');
  });

  it('fechas relativas a hoy', async () => {
    const { dueLabel, relativeDay, weekdayShort } = await import('@/domain/dates');
    expect(relativeDay('2026-10-08', '2026-10-08')).toBe('Hoy');
    expect(relativeDay('2026-10-07', '2026-10-08')).toBe('Ayer');
    expect(relativeDay('2026-10-02', '2026-10-08')).toBe('vie 2 oct');
    expect(weekdayShort('2026-10-09')).toBe('Vie');
    expect(dueLabel('2026-10-09', '2026-10-06')).toBe('Vie 9 · en 3 días');
    expect(dueLabel('2026-10-09', '2026-10-08')).toBe('Vie 9 · mañana');
    expect(dueLabel('2026-10-09', '2026-10-09')).toBe('Vie 9 · hoy');
    expect(dueLabel('2026-10-09', '2026-10-11')).toBe('Vie 9 · venció hace 2 días');
  });
});
