import { describe, expect, it } from 'vitest';
import { parseQuickEntry } from '@/domain/quickEntry';

describe('parseQuickEntry', () => {
  it('entiende la frase corta como en WhatsApp', () => {
    expect(parseQuickEntry('450 feria efectivo')).toEqual({
      amount: 450,
      store: 'Feria',
      category: 'Supermercado',
      subcategory: 'Verdulería',
      payment: 'Efectivo',
    });
  });

  it('y la frase dicha por voz, con palabras de más', () => {
    expect(parseQuickEntry('450 en la feria, efectivo')).toEqual(parseQuickEntry('450 feria efectivo'));
  });

  it('el monto puede ir al final y el medio de pago puede faltar', () => {
    expect(parseQuickEntry('almuerzo 390')).toEqual({ amount: 390, store: 'Almuerzo', category: 'Delivery y salidas', subcategory: 'Almuerzo' });
  });

  it('conserva el nombre del comercio con sus palabras del medio', () => {
    const r = parseQuickEntry('1.342 almacén la esquina débito');
    expect(r).toMatchObject({ amount: 1342, store: 'Almacén La Esquina', category: 'Supermercado', subcategory: 'Almacén', payment: 'Débito' });
  });

  it('"tarjeta" sola es crédito; "con" y "en" no forman parte del comercio', () => {
    expect(parseQuickEntry('uber 230 con tarjeta')).toMatchObject({ amount: 230, store: 'Uber', category: 'Transporte', subcategory: 'Taxi y apps', payment: 'Crédito' });
    expect(parseQuickEntry('2.150 luz en débito automático')).toMatchObject({ amount: 2150, store: 'Luz', category: 'Servicios', subcategory: 'Luz', payment: 'Débito' });
  });

  it('reconoce montos con decimales y signo de pesos', () => {
    expect(parseQuickEntry('$ 1.046,40 super').amount).toBe(1046.4);
    expect(parseQuickEntry('450,50 feria').amount).toBe(450.5);
  });

  it('lo que no reconoce va a Otros, sin inventar', () => {
    expect(parseQuickEntry('regalo cumple 800')).toMatchObject({ amount: 800, store: 'Regalo Cumple', category: 'Otros', subcategory: 'Varios' });
  });

  it('sin monto queda marcado para revisar', () => {
    const r = parseQuickEntry('farmacia');
    expect(r.amount).toBeUndefined();
    expect(r.review).toBe('No encontramos el monto');
    expect(r).toMatchObject({ store: 'Farmacia', category: 'Salud', subcategory: 'Farmacia' });
  });

  it('una frase vacía no rompe nada', () => {
    expect(parseQuickEntry('   ')).toMatchObject({ store: '', category: 'Otros', review: 'No encontramos el monto' });
  });
});
