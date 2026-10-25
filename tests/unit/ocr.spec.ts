import { describe, expect, it } from 'vitest';
import { parseOcrLines, type OcrLine } from '@/domain/ocr';

/** Un renglón de OCR a la altura `top`, con 30 px de alto. */
const at = (text: string, top: number, left: number): OcrLine => ({ text, box: { left, top, right: left + 60, bottom: top + 30 } });

describe('parseOcrLines', () => {
  it('junta el nombre y el monto que el OCR leyó por separado si están a la misma altura', () => {
    const r = parseOcrLines([at('PERA', 100, 10), at('103', 96, 200), at('PAPA', 160, 12), at('144', 163, 205)]);
    expect(r.items).toEqual([
      { written: 'PERA', name: 'PERA', amount: 103 },
      { written: 'PAPA', name: 'PAPA', amount: 144 },
    ]);
  });

  it('el orden de los renglones sale de la posición, no del orden en que los devuelve el OCR', () => {
    const r = parseOcrLines([at('144', 163, 205), at('PERA', 100, 10), at('PAPA', 160, 12), at('103', 96, 200)]);
    expect(r.items.map((i) => i.written)).toEqual(['PERA', 'PAPA']);
  });

  it('también entiende el nombre y el monto en un mismo renglón, con montos uruguayos', () => {
    const r = parseOcrLines([at('BON 75', 100, 10), at('Queso dambo $ 1.046,40', 140, 10)]);
    expect(r.items).toEqual([
      { written: 'BON', name: 'BON', amount: 75 },
      { written: 'Queso dambo', name: 'Queso dambo', amount: 1046.4 },
    ]);
  });

  it('el renglón que dice "total" es el total, no un artículo', () => {
    const r = parseOcrLines([at('TOM 100', 100, 10), at('Total: $ 1.439', 140, 10)]);
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(1439);
  });

  it('un número solo abajo de todo, mayor que los demás, es el total escrito', () => {
    const r = parseOcrLines([at('PERA', 100, 10), at('103', 100, 200), at('PAPA', 140, 10), at('144', 140, 200), at('1439', 220, 100)]);
    expect(r.items.map((i) => i.amount)).toEqual([103, 144]);
    expect(r.total).toBe(1439);
  });

  it('si el OCR separa los dígitos del total ("14 39"), los junta', () => {
    const r = parseOcrLines([at('PERA 103', 100, 10), at('14 39', 220, 100)]);
    expect(r.total).toBe(1439);
  });

  it('un nombre sin monto seguido de un monto solo, un poco más abajo, es un mismo renglón', () => {
    const r = parseOcrLines([at('TOM', 300, 10), at('100', 340, 200), at('AJO 49', 400, 10)]);
    expect(r.items).toEqual([
      { written: 'TOM', name: 'TOM', amount: 100 },
      { written: 'AJO', name: 'AJO', amount: 49 },
    ]);
  });

  it('un monto suelto en el medio queda como artículo sin nombre, para completarlo a mano', () => {
    const r = parseOcrLines([at('PERA 103', 100, 10), at('75', 140, 200), at('PAPA 144', 180, 10)]);
    expect(r.items.map((i) => [i.written, i.amount])).toEqual([['PERA', 103], ['', 75], ['PAPA', 144]]);
    expect(r.total).toBe(0);
  });

  it('descarta el texto sin montos, como el nombre del puesto arriba', () => {
    const r = parseOcrLines([at('Verduras Mario', 40, 10), at('PERA 103', 100, 10)]);
    expect(r.items).toHaveLength(1);
  });

  it('caso real (Redmi, papel escrito a mano): no junta un nombre y un número que están lejos', () => {
    // Lo único que el OCR de ML Kit encontró en un papel con "Tom 45 / AJI 120 / PAPA 200 / 365".
    const r = parseOcrLines([
      { text: 'ATL', box: { left: 456, top: 1131, right: 852, bottom: 1287 } },
      { text: '376', box: { left: 1109, top: 1949, right: 1580, bottom: 2221 } },
    ]);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(376);
  });

  it('sin texto no hay nada', () => {
    expect(parseOcrLines([])).toEqual({ store: '', items: [], total: 0 });
  });
});
