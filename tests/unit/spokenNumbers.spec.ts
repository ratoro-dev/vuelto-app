import { describe, expect, it } from 'vitest';
import { parseQuickEntries, parseQuickEntry } from '@/domain/quickEntry';
import { spokenToDigits } from '@/domain/spokenNumbers';

describe('spokenToDigits', () => {
  it('pasa a cifras los montos dichos en palabras', () => {
    expect(spokenToDigits('cuatrocientos cincuenta en la feria')).toBe('450 en la feria');
    expect(spokenToDigits('mil doscientos en el súper')).toBe('1200 en el súper');
    expect(spokenToDigits('dos mil quinientos de nafta')).toBe('2500 de nafta');
    expect(spokenToDigits('ciento veinte el kiosco')).toBe('120 el kiosco');
    expect(spokenToDigits('cincuenta y dos de ómnibus')).toBe('52 de ómnibus');
    expect(spokenToDigits('veinte mil de alquiler')).toBe('20000 de alquiler');
    expect(spokenToDigits('cien pesos de pan')).toBe('100 pesos de pan');
  });

  it('entiende las lucas', () => {
    expect(spokenToDigits('dos lucas de nafta')).toBe('2000 de nafta');
    expect(spokenToDigits('una luca y media en la farmacia')).toBe('1500 en la farmacia');
    expect(spokenToDigits('2 lucas en el almacén')).toBe('2000 en el almacén');
    expect(spokenToDigits('mil en la carnicería')).toBe('1000 en la carnicería');
  });

  it('no toca las cifras ni los números chicos sueltos', () => {
    expect(spokenToDigits('450 feria efectivo')).toBe('450 feria efectivo');
    expect(spokenToDigits('dos empanadas 240')).toBe('dos empanadas 240');
    expect(spokenToDigits('un café 120')).toBe('un café 120');
    expect(spokenToDigits('pan y leche 180')).toBe('pan y leche 180');
  });

  it('conserva la coma pegada al número', () => {
    expect(spokenToDigits('trescientos, almuerzo')).toBe('300, almuerzo');
  });
});

describe('frases dictadas', () => {
  it('el monto en palabras llega al gasto', () => {
    expect(parseQuickEntry('cuatrocientos cincuenta en la feria, efectivo')).toEqual(parseQuickEntry('450 feria efectivo'));
    expect(parseQuickEntry('dos lucas de nafta con débito')).toMatchObject({ amount: 2000, store: 'Nafta', category: 'Transporte', subcategory: 'Combustible', payment: 'Débito' });
  });

  it('un número chico antes del monto no se confunde con el monto', () => {
    expect(parseQuickEntry('dos empanadas 240')).toMatchObject({ amount: 240 });
  });
});

describe('frases dictadas en el iPhone', () => {
  it('"Gasté 168 en cebolla" es verdulería', () => {
    // Dictado real, sin conexión (es-US dentro del teléfono)
    expect(parseQuickEntry('Gasté 168 en cebolla')).toEqual({
      amount: 168,
      store: 'Cebolla',
      category: 'Supermercado',
      subcategory: 'Verdulería',
    });
  });

  it('reconoce productos de almacén, lácteos, limpieza e higiene', () => {
    expect(parseQuickEntry('yerba 290')).toMatchObject({ category: 'Supermercado', subcategory: 'Almacén' });
    expect(parseQuickEntry('leche y huevos 210')).toMatchObject({ category: 'Supermercado', subcategory: 'Lácteos y huevos' });
    expect(parseQuickEntry('lavandina 95')).toMatchObject({ subcategory: 'Limpieza' });
    expect(parseQuickEntry('papel higiénico 180')).toMatchObject({ subcategory: 'Higiene' });
  });
});

describe('precios a la uruguaya', () => {
  it('"cuatro ochenta" es 480', () => {
    expect(spokenToDigits('cuatro 80 en palta')).toBe('480 en palta');
    expect(spokenToDigits('tres cincuenta de pan')).toBe('350 de pan');
    expect(spokenToDigits('2 50 de queso')).toBe('250 de queso');
  });

  it('limpia la cifra suelta que deja el dictado al corregirse ("4 480")', () => {
    expect(spokenToDigits('4 480 en palta')).toBe('480 en palta');
    expect(spokenToDigits('9 960 en STM')).toBe('960 en STM');
  });

  it('no junta lo que no es un precio', () => {
    expect(spokenToDigits('dos empanadas 240')).toBe('dos empanadas 240');
    expect(spokenToDigits('compré 2 kilos 120')).toBe('compré 2 kilos 120');
    expect(spokenToDigits('cuatro 80. dos 50')).toBe('480. 250');
  });
});

describe('dictado real con el modelo nuevo (es_MX)', () => {
  it('STM mal escuchada, precios a la uruguaya y repeticiones', () => {
    const r = parseQuickEntries('Bien, ayer gasté 960 en Steam. cuatro 80 en palta.', '2026-10-08');
    expect(r.items.map((i) => `${i.name} ${i.amount} ${i.category} · ${i.subcategory}`)).toEqual([
      'STM 960 Transporte · Ómnibus',
      'Palta 480 Supermercado · Verdulería',
    ]);
    expect(r).toMatchObject({ together: false, date: '2026-10-07' });
  });
});

describe('dictado real: compra con una corrección hablada', () => {
  it('"Ok, ayer gasté 4 480 en palta. 2.0 en yogur. Y. O sea, dos 80 en yogur. Y tres 360 en agua."', () => {
    const r = parseQuickEntries('Ok, ayer gasté 4 480 en palta. 2.0 en yogur. Y. O sea, dos 80 en yogur. Y tres 360 en agua.', '2026-10-08');
    expect(r.items.map((i) => `${i.name} ${i.amount} ${i.subcategory}`)).toEqual(['Palta 480 Verdulería', 'Yogur 280 Lácteos y huevos', 'Agua 360 Bebidas']);
    expect(r).toMatchObject({ together: true, store: 'Supermercado', date: '2026-10-07' });
  });
});

describe('dictado real en el Galaxy S24', () => {
  it('"pesos" llega como "besos"', () => {
    expect(parseQuickEntry('380 besos de palta')).toMatchObject({ amount: 380, store: 'Palta', subcategory: 'Verdulería' });
  });
});

describe('compra dictada en el Galaxy S24 (sigue escuchando después de las pausas)', () => {
  it('"380 de palta 400 pesos de agua y 280 de chirimoya"', () => {
    const r = parseQuickEntries('380 de palta 400 pesos de agua y 280 de chirimoya');
    expect(r.items.map((i) => `${i.name} ${i.amount} ${i.subcategory}`)).toEqual(['Palta 380 Verdulería', 'Agua 400 Bebidas', 'Chirimoya 280 Verdulería']);
    expect(r).toMatchObject({ together: true, store: 'Supermercado' });
  });
});
