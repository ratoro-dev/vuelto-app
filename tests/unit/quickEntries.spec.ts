import { describe, expect, it } from 'vitest';
import { parseQuickEntries, parseQuickEntry } from '@/domain/quickEntry';

const summary = (text: string) => {
  const r = parseQuickEntries(text);
  return { ...r, items: r.items.map((i) => `${i.name} ${i.amount} ${i.subcategory}${i.place ? ` @${i.place}` : ''}${i.payment ? ` (${i.payment})` : ''}`) };
};

describe('parseQuickEntries', () => {
  it('toda la compra dictada sin comas, como llega del iPhone', () => {
    expect(summary('Gasté 168 en cebolla 290 en yerba y 120 en pan')).toEqual({
      items: ['Cebolla 168 Verdulería', 'Yerba 290 Almacén', 'Pan 120 Panadería'],
      together: true,
      store: 'Supermercado',
    });
  });

  it('el lugar dicho al principio es el de toda la compra', () => {
    expect(summary('en la feria gasté 168 de cebolla, 120 de tomate y 90 de papa con débito')).toMatchObject({
      items: ['Cebolla 168 Verdulería @Feria', 'Tomate 120 Verdulería', 'Papa 90 Verdulería (Débito)'],
      together: true,
      store: 'Feria',
      payment: 'Débito',
    });
  });

  it('montos en palabras', () => {
    expect(summary('cuatrocientos cincuenta en la feria y mil doscientos en el súper')).toEqual({
      items: ['Feria 450 Verdulería', 'Súper 1200 Almacén'],
      together: false,
      store: 'Supermercado',
    });
  });

  it('gastos en lugares distintos van separados, cada uno con su medio de pago', () => {
    expect(summary('450 en la feria, 1200 en el súper con débito y 52 de ómnibus')).toMatchObject({
      items: ['Feria 450 Verdulería', 'Súper 1200 Almacén (Débito)', 'Ómnibus 52 Ómnibus'],
      together: false,
    });
    expect(summary('almuerzo 390 y 52 de ómnibus').together).toBe(false);
  });

  it('primero el artículo y después el monto', () => {
    expect(summary('cebolla 168 tomate 120 papa 90 efectivo')).toEqual({
      items: ['Cebolla 168 Verdulería', 'Tomate 120 Verdulería', 'Papa 90 Verdulería'],
      together: true,
      store: 'Verdulería',
      payment: 'Efectivo',
    });
  });

  it('"y" dentro del nombre de un artículo', () => {
    expect(summary('pan y leche 180, yerba 290').items).toEqual(['Pan y Leche 180 Lácteos y huevos', 'Yerba 290 Almacén']);
    expect(summary('168 de pan y leche, 290 de yerba').items).toEqual(['Pan y Leche 168 Lácteos y huevos', 'Yerba 290 Almacén']);
  });

  it('el medio de pago al final vale para todo', () => {
    expect(parseQuickEntries('168 de cebolla, 120 de tomate, todo con débito')).toMatchObject({ payment: 'Débito', together: true });
  });

  it('el lugar al final, separado por coma, es el de toda la compra', () => {
    expect(summary('168 de cebolla y 120 de tomate, en la feria')).toMatchObject({ together: true, store: 'Feria' });
  });

  it('con un solo monto es lo mismo que parseQuickEntry', () => {
    const one = parseQuickEntries('1.342 almacén la esquina débito');
    const single = parseQuickEntry('1.342 almacén la esquina débito');
    expect(one.items).toEqual([{ amount: 1342, name: single.store, category: single.category, subcategory: single.subcategory, payment: 'Débito' }]);
    expect(parseQuickEntries('pan y leche').items).toEqual([]);
  });
});

describe('cuándo fue', () => {
  // Jueves 8 de octubre de 2026
  const today = '2026-10-08';

  it('dictado real: "Ayer gasté 160 en palta 80 en agua y 100 en refresco"', () => {
    const r = parseQuickEntries('Ayer gasté 160 en palta 80 en agua y 100 en refresco', today);
    expect(r).toMatchObject({ together: true, store: 'Supermercado', date: '2026-10-07' });
    expect(r.items.map((i) => `${i.name} ${i.amount} ${i.subcategory}`)).toEqual(['Palta 160 Verdulería', 'Agua 80 Bebidas', 'Refresco 100 Bebidas']);
  });

  it('los tramos del dictado juntados después de cada pausa', () => {
    // Como llegan del iPhone: cada tramo empieza con mayúscula
    const r = parseQuickEntries('Ayer gasté 180 en palta 200 en agua Y 300 En refresco', today);
    expect(r).toMatchObject({ together: true, date: '2026-10-07' });
    expect(r.items.map((i) => `${i.name} ${i.amount} ${i.subcategory}`)).toEqual(['Palta 180 Verdulería', 'Agua 200 Bebidas', 'Refresco 300 Bebidas']);
  });

  it('anteayer, antes de ayer y el día de la semana', () => {
    expect(parseQuickEntry('anteayer 450 feria', today)).toMatchObject({ date: '2026-10-06', store: 'Feria' });
    expect(parseQuickEntry('antes de ayer almuerzo 390', today)).toMatchObject({ date: '2026-10-06', store: 'Almuerzo' });
    expect(parseQuickEntry('el viernes 1200 en el súper', today)).toMatchObject({ date: '2026-10-02', store: 'Súper' });
    expect(parseQuickEntry('el jueves 52 de ómnibus', today)).toMatchObject({ date: '2026-10-01' });
    expect(parseQuickEntry('450 feria', today).date).toBeUndefined();
  });

  it('el agua de la canilla es OSE; el agua sola es una bebida', () => {
    expect(parseQuickEntry('1.500 ose débito automático')).toMatchObject({ category: 'Servicios', subcategory: 'Agua' });
    expect(parseQuickEntry('factura del agua 1500')).toMatchObject({ category: 'Servicios', subcategory: 'Agua' });
    expect(parseQuickEntry('agua 80')).toMatchObject({ category: 'Supermercado', subcategory: 'Bebidas' });
  });
});

describe('correcciones y puntuación del dictado', () => {
  const names = (text: string) => parseQuickEntries(text, '2026-10-08').items.map((i) => `${i.name} ${i.amount}`);

  it('"o sea", "perdón" y "corregí eso" reemplazan al artículo anterior', () => {
    expect(names('200 de palta, 960 de queso, o sea, 690 de queso')).toEqual(['Palta 200', 'Queso 690']);
    expect(names('200 de palta y 300 de tomate, perdón, 350 de tomate')).toEqual(['Palta 200', 'Tomate 350']);
    expect(names('Ya, corrige eso, o sea, 960 de queso')).toEqual(['Queso 960']);
  });

  it('una corrección sin el nombre corrige el monto del anterior', () => {
    expect(names('200 de palta, 960 de queso, digo, 690')).toEqual(['Palta 200', 'Queso 690']);
  });

  it('el mismo artículo dicho de nuevo reemplaza al anterior, aunque no sea el último', () => {
    expect(names('200 de palta y 300 de tomate, perdón, 250 de palta')).toEqual(['Palta 250', 'Tomate 300']);
    expect(names('52 de ómnibus y 52 de ómnibus')).toEqual(['Ómnibus 52', 'Ómnibus 52']);
  });

  it('dictado real: corrige dos veces y repite toda la compra al final', () => {
    const r = parseQuickEntries(
      'Ayer gasté 180 en palta, dos 80 en cebolla. Disculpa, cuatro 80 en cebolla. O sea, cuatro 80 en total en cebolla. 180 en palta y cuatro 80 en cebolla.',
      '2026-10-08',
    );
    expect(r.items.map((i) => `${i.name} ${i.amount}`)).toEqual(['Palta 180', 'Cebolla 480']);
    expect(r).toMatchObject({ together: true, store: 'Verdulería', date: '2026-10-07' });
  });

  it('una corrección que deja un solo monto es un gasto simple', () => {
    expect(parseQuickEntry('450 en la feria, perdón, 540 en la feria')).toMatchObject({ amount: 540, store: 'Feria' });
  });

  it('el punto separa artículos como la coma, pero no rompe los montos', () => {
    expect(names('Ayer gasté 200 en palta. 300 de tomate.')).toEqual(['Palta 200', 'Tomate 300']);
    expect(parseQuickEntry('1.046,40 en el súper.')).toMatchObject({ amount: 1046.4, store: 'Súper' });
  });
});

describe('compra con gastos aparte', () => {
  it('dictado real: los productos son una compra y la STM va aparte', () => {
    const r = parseQuickEntries('Paste de 160 en cebolla, dos 80 en palta y 1440 en Steam.', '2026-10-08');
    expect(r.items.map((i) => `${i.name} ${i.amount}${i.apart ? ' (aparte)' : ''}`)).toEqual(['Cebolla 160', 'Palta 280', 'STM 1440 (aparte)']);
    expect(r).toMatchObject({ together: true, store: 'Verdulería' });
  });

  it('con un solo producto y un gasto, van separados', () => {
    expect(parseQuickEntries('168 de cebolla y 52 de ómnibus').together).toBe(false);
  });
});

describe('dictados reales en el Apple Watch', () => {
  it('"Gasté 150 en mercadería." es almacén', () => {
    expect(parseQuickEntry('Gasté 150 en mercadería.')).toMatchObject({ amount: 150, store: 'Mercadería', category: 'Supermercado', subcategory: 'Almacén' });
  });

  it('"Gasté 200 en la feria y 150 en el súper." son dos gastos', () => {
    const r = parseQuickEntries('Gasté 200 en la feria y 150 en el súper.');
    expect(r.together).toBe(false);
    expect(r.items.map((i) => `${i.name} ${i.amount} ${i.subcategory}`)).toEqual(['Feria 200 Verdulería', 'Súper 150 Almacén']);
  });
});
