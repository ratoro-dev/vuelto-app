import { describe, expect, it } from 'vitest';
import {
  cartTotal, draftSubtitle, frequentExpenses, keypadAmount, keypadDisplay, keypadDraft, keypadSubcategory, KEYPAD_CATEGORIES,
  paperDrafts, type PaperRow, phraseDrafts, pressKey, splitDuplicates, splitPurchase,
} from '@/domain/carga';
import { normalizePaperReading } from '@/domain/paper';
import { parsePaperFormat } from '@/domain/promptFormat';
import { parseQuickEntries, productCategory } from '@/domain/quickEntry';
import { ticketTotals } from '@/domain/totals';
import type { CfeHeader, Ticket } from '@/domain/types';

const TODAY = '2026-10-09';
let seq = 0;
const newId = () => `t${++seq}`;

function typed(keys: string[]): string {
  return keys.reduce((text, k) => pressKey(text, k), '');
}

describe('teclado numérico', () => {
  it('escribe el monto con coma decimal y hasta dos decimales', () => {
    expect(typed(['1', '2', '0'])).toBe('120');
    expect(typed(['1', '2', ',', '5', '0', '9'])).toBe('12,50');
    expect(typed([',', '5'])).toBe('0,5');
    expect(typed(['1', ',', ','])).toBe('1,');
  });

  it('no deja ceros adelante y borra de a una cifra', () => {
    expect(typed(['0', '0', '7'])).toBe('7');
    expect(typed(['4', '5', '0', 'del'])).toBe('45');
    expect(typed(['del'])).toBe('');
  });

  it('muestra los miles con punto y lee el monto', () => {
    expect(keypadDisplay('')).toBe('0');
    expect(keypadDisplay('12345,5')).toBe('12.345,5');
    expect(keypadAmount('12345,5')).toBe(12345.5);
    expect(keypadAmount('120,')).toBe(120);
    expect(keypadAmount('')).toBe(0);
  });
});

describe('gastos del teclado', () => {
  it('un gasto en pesos con descripción', () => {
    const d = keypadDraft({ amount: 120, currency: 'UYU', description: 'café', category: 'Delivery y salidas', subcategory: 'Bar y café', payment: 'Efectivo', date: TODAY }, 'a');
    expect(d.title).toBe('Café');
    expect(d.ticket.source).toBe('texto');
    expect(ticketTotals(d.ticket).net).toBe(120);
    expect(draftSubtitle(d)).toBe('Salidas · Efectivo');
  });

  it('sin descripción se llama como la categoría', () => {
    const d = keypadDraft({ amount: 52, currency: 'UYU', description: ' ', category: 'Transporte', subcategory: 'Ómnibus', payment: 'Efectivo', date: TODAY }, 'a');
    expect(d.title).toBe('Transporte');
  });

  it('en dólares: el presupuesto lo cuenta en pesos y se guarda el monto original', () => {
    const d = keypadDraft({ amount: 20, currency: 'USD', description: 'Netflix', category: 'Servicios', subcategory: 'Internet y celular', payment: 'Crédito', date: TODAY }, 'a', 40);
    expect(ticketTotals(d.ticket).net).toBe(800);
    expect(d.ticket.usd).toEqual({ amount: 20, rate: 40 });
  });

  it('la celda de Salidas toma la subcategoría entendida de la descripción', () => {
    const salidas = KEYPAD_CATEGORIES.find((c) => c.label === 'Salidas')!;
    expect(keypadSubcategory(salidas, { category: 'Delivery y salidas', subcategory: 'Bar y café' })).toBe('Bar y café');
    expect(keypadSubcategory(salidas, { category: 'Delivery y salidas', subcategory: 'Delivery' })).toBe('Restorán');
    expect(keypadSubcategory(salidas)).toBe('Restorán');
  });
});

describe('frases a la carga', () => {
  it('varios gastos dictados: uno por monto, con el medio de pago de cada uno', () => {
    const phrase = 'un café de 120, almuerzo 390 con débito y 52 de ómnibus';
    const drafts = phraseDrafts(phrase, parseQuickEntries(phrase, TODAY), { source: 'voz', payment: 'Efectivo', date: TODAY, newId });
    expect(drafts.map((d) => [d.title, ticketTotals(d.ticket).net, d.ticket.payment])).toEqual([
      ['Café', 120, 'Efectivo'],
      ['Almuerzo', 390, 'Débito'],
      ['Ómnibus', 52, 'Efectivo'],
    ]);
    expect(drafts.every((d) => d.ticket.source === 'voz' && d.ticket.phrase === phrase)).toBe(true);
  });

  it('una compra con varios productos es un gasto con una línea por producto', () => {
    const phrase = 'en la feria gasté 168 de cebolla, 120 de tomate y 90 de papa';
    const [d, ...rest] = phraseDrafts(phrase, parseQuickEntries(phrase, TODAY), { source: 'voz', payment: 'Efectivo', date: TODAY, newId });
    expect(rest).toHaveLength(0);
    expect(d.title).toBe('Feria');
    expect(d.ticket.lines.map((l) => l.pretty)).toEqual(['Cebolla', 'Tomate', 'Papa']);
    expect(draftSubtitle(d)).toBe('Supermercado · 3 productos · Efectivo');
    const split = splitPurchase(d, newId);
    expect(split.map((x) => [x.title, ticketTotals(x.ticket).net])).toEqual([['Cebolla', 168], ['Tomate', 120], ['Papa', 90]]);
  });

  it('"ayer" en la frase cambia la fecha', () => {
    const phrase = 'ayer 450 en la feria';
    const [d] = phraseDrafts(phrase, parseQuickEntries(phrase, TODAY), { source: 'texto', payment: 'Efectivo', date: TODAY, newId });
    expect(d.ticket.date).toBe('2026-10-08');
  });
});

describe('la carga', () => {
  const omnibus = keypadDraft({ amount: 52, currency: 'UYU', description: 'Ómnibus', category: 'Transporte', subcategory: 'Ómnibus', payment: 'Efectivo', date: TODAY }, 'a');
  const feria = keypadDraft({ amount: 450, currency: 'UYU', description: 'Feria', category: 'Supermercado', subcategory: 'Verdulería', payment: 'Efectivo', date: TODAY }, 'b');
  const usd = keypadDraft({ amount: 20, currency: 'USD', description: 'Netflix', category: 'Servicios', subcategory: 'Internet y celular', payment: 'Crédito', date: TODAY }, 'c');

  it('suma en pesos y aparte en dólares', () => {
    expect(cartTotal([])).toBe('$ 0');
    expect(cartTotal([omnibus, feria])).toBe('$ 502');
    expect(cartTotal([omnibus, usd])).toBe('$ 52 + USD 20');
    expect(cartTotal([usd])).toBe('USD 20');
  });

  it('lo dicho otra vez con el mismo nombre y monto no se agrega solo', () => {
    const again = { ...omnibus, id: 'z' };
    const cafe = keypadDraft({ amount: 120, currency: 'UYU', description: 'Café', category: 'Delivery y salidas', subcategory: 'Bar y café', payment: 'Efectivo', date: TODAY }, 'y');
    const { added, duplicates } = splitDuplicates([cafe, again], [feria, omnibus]);
    expect(added.map((d) => d.title)).toEqual(['Café']);
    expect(duplicates.map((d) => d.title)).toEqual(['Ómnibus']);
  });
});

describe('frequentExpenses', () => {
  const t = (id: string, store: string, amount: number, date: string, extra: Partial<Ticket> = {}): Ticket => ({
    id, source: 'whatsapp', store, date, payment: 'Efectivo', discounts: [],
    lines: [{ raw: store, pretty: store, category: 'Transporte', subcategory: 'Ómnibus', amount }],
    sync: { state: 'subido' }, createdAt: `${date}T10:00:00.000Z`, ...extra,
  });

  it('los que más se repiten primero; después los más recientes', () => {
    const tickets = [
      t('1', 'Ómnibus', 52, '2026-10-01'), t('2', 'Ómnibus', 52, '2026-10-05'), t('3', 'ómnibus', 52, '2026-10-08'),
      t('4', 'Café', 120, '2026-10-02'), t('5', 'Café', 120, '2026-10-07'),
      t('6', 'Kiosco', 500, '2026-10-09'),
      t('7', 'Súper', 2300, '2026-10-09', { source: 'qr' }),
      t('8', 'Ómnibus', 64, '2026-10-09', { review: 'No se leyó el monto' }),
    ];
    expect(frequentExpenses(tickets).map((f) => `${f.title} ${f.amount}`)).toEqual(['ómnibus 52', 'Café 120', 'Kiosco 500']);
  });
});

describe('ticket con foto', () => {
  const row = (key: number, name: string, amount: number, extra: Partial<PaperRow> = {}): PaperRow => ({ key, name, amount, ...productCategory(name), ...extra });
  const rows = [row(1, 'Pan flauta x2', 80), row(2, 'Leche 1 L', 42), row(3, 'Queso dambo 300 g', 210), row(4, 'Pilas AA x4', 190)];

  it('categoriza los productos leídos por su nombre, sin las cantidades', () => {
    expect(productCategory('Pan flauta x2')).toEqual({ category: 'Supermercado', subcategory: 'Panadería' });
    expect(productCategory('Queso dambo 300 g')).toEqual({ category: 'Supermercado', subcategory: 'Lácteos y huevos' });
    expect(productCategory('Pilas AA x4')).toEqual({ category: 'Otros', subcategory: 'Varios' });
  });

  it('por categoría: un gasto por cada una, con la foto', () => {
    const drafts = paperDrafts({ store: 'Panadería del Barrio', date: TODAY, payment: 'Efectivo', rows, writtenTotal: 522, photoUri: 'data:x', byCategory: true, newId });
    expect(drafts.map((d) => [d.title, draftSubtitle(d), ticketTotals(d.ticket).net])).toEqual([
      ['Panadería del Barrio', 'Supermercado · 3 productos · Efectivo', 332],
      ['Panadería del Barrio', 'Otros · Efectivo', 190],
    ]);
    expect(drafts.every((d) => d.ticket.source === 'papel' && d.ticket.photoUri === 'data:x' && d.ticket.writtenTotal === undefined)).toBe(true);
  });

  it('un gasto: todas las líneas juntas y el total escrito para controlar la suma', () => {
    const [d, ...rest] = paperDrafts({ store: 'Panadería del Barrio', date: TODAY, payment: 'Efectivo', rows, writtenTotal: 522, byCategory: false, newId });
    expect(rest).toHaveLength(0);
    expect(ticketTotals(d.ticket).net).toBe(522);
    expect(d.ticket.writtenTotal).toBe(522);
    expect(d.ticket.lines.map((l) => l.raw)).toEqual(['Pan flauta x2', 'Leche 1 L', 'Queso dambo 300 g', 'Pilas AA x4']);
  });

  it('sin productos queda el total escrito', () => {
    const [d] = paperDrafts({ store: '', date: TODAY, payment: 'Efectivo', rows: [], writtenTotal: 300, byCategory: true, newId });
    expect(d.title).toBe('Ticket en papel');
    expect(ticketTotals(d.ticket).net).toBe(300);
  });

  it('con QR es un solo gasto y lo que sobra del total queda como descuento', () => {
    const header: CfeHeader = { rut: '211234560018', cfeType: 101, serie: 'A', number: '123456', total: 515.4, date: '2026-10-06', url: 'https://x' };
    const drafts = paperDrafts({ store: 'Almacén La Esquina', date: TODAY, payment: 'Débito', rows, qr: header, byCategory: true, newId });
    expect(drafts).toHaveLength(1);
    const [d] = drafts;
    expect(d.ticket.source).toBe('qr');
    expect(d.ticket.date).toBe('2026-10-06');
    expect(d.ticket.discounts).toEqual([{ label: 'Descuentos del ticket', kind: 'otro', amount: 6.6 }]);
    expect(ticketTotals(d.ticket).net).toBe(515.4);
  });
});

describe('montos dudosos', () => {
  it('Gemini marca con ? el monto que no lee bien', () => {
    const reading = normalizePaperReading(parsePaperFormat('ARTICULO | QSO DAMBO | Queso dambo | 210?\nARTICULO | PAN | Pan | 80\nTOTAL | 290'));
    expect(reading.items).toEqual([
      { written: 'QSO DAMBO', name: 'Queso dambo', amount: 210, doubtful: true },
      { written: 'PAN', name: 'Pan', amount: 80 },
    ]);
    expect(reading.writtenTotal).toBe(290);
  });
});
