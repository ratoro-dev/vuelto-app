import { describe, expect, it } from 'vitest';
import { applyVendorRules, learnFromTicket, normalizeWritten, vendorKey, vendorRulesContext } from '@/domain/vendors';

const DATE = '2026-10-05T12:00:00.000Z';

describe('vendorKey y normalizeWritten', () => {
  it('el puesto se reconoce sin importar mayúsculas, tildes ni espacios', () => {
    expect(vendorKey('  Puesto de  Mário ')).toBe('puesto de mario');
  });
  it('lo escrito se compara sin puntos ni mayúsculas', () => {
    expect(normalizeWritten(' Plat. ')).toBe('plat');
    expect(normalizeWritten('Mo.Ro')).toBe('moro');
  });
  it('el modelo a veces copia el precio pegado al producto: se ignora para que la regla coincida', () => {
    expect(normalizeWritten('Tom 45')).toBe('tom');
    expect(normalizeWritten("AJÍ' 1.046,40")).toBe('aji');
    expect(normalizeWritten('Leche 1L')).toBe('leche 1l');
  });
});

describe('learnFromTicket', () => {
  // Lo que leyó el modelo del papel de la feria y lo que la persona guardó después de corregir.
  const read = [
    { written: 'BON', name: 'Pan', amount: 75 },
    { written: 'PAPA', name: 'Bol', amount: 79 },
    { written: 'TOM', name: 'Tomate', amount: 100 },
    { written: 'CE', name: 'Sal', amount: 90 },
  ];
  const saved = [
    { name: 'boniato', amount: 75 },
    { name: 'Papa', amount: 79 },
    { name: 'Tomate', amount: 100 },
    { name: 'Cebolla', amount: 15 },
    { name: 'Pera', amount: 103 },
  ];

  it('aprende qué significa cada abreviatura del puesto, emparejando por monto', () => {
    const rules = learnFromTicket(undefined, { vendorName: 'Puesto de Mario', read, saved, at: DATE });
    expect(rules.name).toBe('Puesto de Mario');
    expect(rules.key).toBe('puesto de mario');
    expect(rules.abbreviations).toEqual({ bon: 'Boniato', papa: 'Papa', tom: 'Tomate' });
    expect(rules.tickets).toBe(1);
  });

  it('no aprende de un renglón que no puede emparejar con seguridad', () => {
    const rules = learnFromTicket(undefined, { vendorName: 'Puesto de Mario', read, saved, at: DATE });
    expect(rules.abbreviations.ce).toBeUndefined();
  });

  it('si corrigió el monto pero el producto coincide, igual aprende la abreviatura', () => {
    const rules = learnFromTicket(undefined, {
      vendorName: 'Puesto de Mario',
      read: [{ written: 'PLAT', name: 'Plátano', amount: 90 }],
      saved: [{ name: 'Plátano', amount: 99 }],
      at: DATE,
    });
    expect(rules.abbreviations).toEqual({ plat: 'Plátano' });
  });

  it('anota los productos que vende el puesto con su último precio, también los que cargó a mano', () => {
    const rules = learnFromTicket(undefined, { vendorName: 'Puesto de Mario', read, saved, at: DATE });
    expect(Object.values(rules.products)).toContainEqual({ name: 'Pera', price: 103 });
    expect(Object.values(rules.products)).toHaveLength(5);
  });

  it('suma a lo que ya sabía y la corrección más nueva gana', () => {
    const first = learnFromTicket(undefined, { vendorName: 'Puesto de Mario', read, saved, at: DATE });
    const second = learnFromTicket(first, {
      vendorName: 'puesto de mario',
      read: [{ written: 'BON', name: 'Pan', amount: 80 }, { written: 'CE', name: 'Ce', amount: 15 }],
      saved: [{ name: 'Boniato', amount: 80 }, { name: 'Cebolla', amount: 15 }],
      at: '2026-10-12T12:00:00.000Z',
    });
    expect(second.tickets).toBe(2);
    expect(second.name).toBe('Puesto de Mario');
    expect(second.abbreviations).toEqual({ bon: 'Boniato', papa: 'Papa', tom: 'Tomate', ce: 'Cebolla' });
    expect(second.products.boniato).toEqual({ name: 'Boniato', price: 80 });
    expect(second.updatedAt).toBe('2026-10-12T12:00:00.000Z');
  });
});

describe('applyVendorRules', () => {
  const rules = learnFromTicket(undefined, {
    vendorName: 'Puesto de Mario',
    read: [{ written: 'BON', name: 'Pan', amount: 75 }],
    saved: [{ name: 'Boniato', amount: 75 }],
    at: DATE,
  });

  it('usa lo aprendido cuando lo escrito coincide, aunque el modelo lo haya interpretado mal', () => {
    const r = applyVendorRules(rules, [{ written: 'Bon.', name: 'Pan', amount: 80 }, { written: 'XYZ', name: 'Algo', amount: 10 }]);
    expect(r.items).toEqual([{ written: 'Bon.', name: 'Boniato', amount: 80 }, { written: 'XYZ', name: 'Algo', amount: 10 }]);
    expect(r.applied).toBe(1);
  });

  it('sin reglas deja la lectura como está', () => {
    expect(applyVendorRules(undefined, [{ name: 'Pan', amount: 80 }])).toEqual({ items: [{ name: 'Pan', amount: 80 }], applied: 0 });
  });
});

describe('vendorRulesContext', () => {
  it('arma el contexto que se le pasa al modelo con las abreviaturas y los productos del puesto', () => {
    const rules = learnFromTicket(undefined, {
      vendorName: 'Puesto de Mario',
      read: [{ written: 'BON', name: 'Pan', amount: 75 }],
      saved: [{ name: 'Boniato', amount: 75 }, { name: 'Pera', amount: 103 }],
      at: DATE,
    });
    const text = vendorRulesContext(rules);
    expect(text).toContain('«BON» es Boniato');
    expect(text).toContain('Boniato, Pera');
  });
  it('un puesto sin reglas no agrega nada', () => expect(vendorRulesContext(undefined)).toBe(''));
});
