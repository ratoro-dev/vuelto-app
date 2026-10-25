import { shiftDay, todayIso, weekday } from './dates';
import { parseAmount } from './money';
import { normalize } from './products';
import { spokenToDigits } from './spokenNumbers';
import type { Category, IsoDate, PaymentMethod } from './types';

/** Lo que se entiende de una frase como las del bot de WhatsApp: "450 en la feria, efectivo". */
export interface QuickEntry {
  amount?: number;
  store: string;
  category: Category;
  subcategory: string;
  /** Solo si la frase lo dice; si no, la pantalla usa el último medio de pago. */
  payment?: PaymentMethod;
  /** Por qué conviene revisarlo antes de darlo por bueno. */
  review?: string;
  /** Solo si la frase lo dice: "ayer", "anteayer", "el viernes". */
  date?: IsoDate;
}

/** Cada monto de una frase con varios gastos: "168 de cebolla". */
export interface QuickItem {
  amount: number;
  /** Qué se compró o en qué se gastó ("Cebolla", "Ómnibus"). Puede quedar vacío. */
  name: string;
  category: Category;
  subcategory: string;
  /** Dónde, si se dijo junto al artículo: "tomate en la feria". */
  place?: string;
  /** El medio de pago dicho junto a este monto. */
  payment?: PaymentMethod;
  /** En una compra (`together`), este va como gasto aparte: el ómnibus o el almuerzo no son artículos del súper. */
  apart?: boolean;
}

/** Una frase con varios montos: toda la compra o varios gastos de una vez. */
export interface QuickEntries {
  items: QuickItem[];
  /** Si parece una sola compra con varios artículos (true) o gastos distintos (false). */
  together: boolean;
  /** Nombre para la compra, si es una sola: el lugar dicho o lo que tienen en común los artículos. */
  store: string;
  /** El medio de pago dicho para todo ("…, todo con débito"). */
  payment?: PaymentMethod;
  /** Solo si la frase lo dice: "ayer", "anteayer", "el viernes". */
  date?: IsoDate;
}

const PAYMENT_WORD: Record<string, PaymentMethod> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  tarjeta: 'Crédito',
  transferencia: 'Transferencia',
  transferi: 'Transferencia',
};
/** Palabras que acompañan al medio de pago ("con tarjeta", "en débito automático") y no son del comercio. */
const BEFORE_PAYMENT = new Set(['con', 'en', 'por']);
const AFTER_PAYMENT = new Set(['automatico', 'automatica']);
/** Se sacan solo de los bordes: "en la feria" → "feria", pero "almacén la esquina" queda entero. */
const EDGE_WORDS = new Set(['en', 'la', 'el', 'los', 'las', 'de', 'del', 'con', 'por', 'para', 'al', 'a', 'y', 'un', 'una', 'todo', 'pesos', 'besos']);
/** Verbos de relleno de cuando se habla: se sacan estén donde estén. */
const FILLER = new Set(['gaste', 'paste', 'pague', 'compre', 'gastamos', 'pagamos', 'compramos', 'pesos', 'besos', 'ya', 'bueno', 'eh', 'bien', 'listo', 'dale', 'entonces', 'ok', 'okay', 'okey', 'total']);
/**
 * Cómo escribe el dictado palabras que no conoce: "STM" (la tarjeta del ómnibus) llega como "Steam", "Sting" o
 * "este". Solo se cambian si son todo el nombre del artículo: "960 en Steam" es la STM, "este pan" no.
 */
const MISHEARD: Record<string, string> = { steam: 'STM', sting: 'STM', stem: 'STM', este: 'STM', esteem: 'STM', 's t m': 'STM', 'ese te eme': 'STM' };
/** Cuando se corrige hablando: lo que sigue reemplaza al artículo anterior ("960 de queso, o sea, 690"). */
const CORRECTIONS = [
  ['corrige', 'eso'], ['corregi', 'eso'], ['corregir', 'eso'], ['corrijo'], ['o', 'sea'], ['perdon'], ['disculpa'], ['disculpe'],
  ['mejor', 'dicho'], ['quise', 'decir'], ['me', 'equivoque'], ['me', 'confundi'], ['en', 'realidad'], ['digo'],
];
const LOWER_INSIDE = new Set(['de', 'del', 'y']);
const DAYS_AGO: Record<string, number> = { hoy: 0, ayer: 1, anoche: 1, anteayer: 2, antier: 2 };
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * - lugar: dónde se compra ("feria", "súper"); junto a un producto dice dónde fue la compra.
 * - producto: lo que se compra en un lugar ("cebolla", "yerba"); varios productos son una sola compra.
 * - gasto: un gasto en sí mismo ("almuerzo", "ómnibus"); va aparte de los demás.
 */
type Kind = 'lugar' | 'producto' | 'gasto';

/** Palabras comunes en Uruguay → categoría y subcategoría. La primera que coincide gana. */
const KEYWORDS: [string[], Category, string, Kind][] = [
  // La factura del agua; "agua" sola es la botella (Bebidas)
  [['ose', 'factura del agua', 'cuenta del agua'], 'Servicios', 'Agua', 'gasto'],
  [['feria', 'verduleria', 'fruteria'], 'Supermercado', 'Verdulería', 'lugar'],
  // Productos sueltos, como se dicen al dictar: "gasté 168 en cebolla"
  [['verdura', 'verduras', 'fruta', 'frutas', 'cebolla', 'cebollas', 'papa', 'papas', 'boniato', 'boniatos', 'tomate', 'tomates', 'lechuga', 'zanahoria', 'zanahorias', 'zapallo', 'zapallito', 'zapallitos', 'morron', 'morrones', 'ajo', 'acelga', 'espinaca', 'manzana', 'manzanas', 'banana', 'bananas', 'naranja', 'naranjas', 'mandarina', 'mandarinas', 'limon', 'limones', 'frutilla', 'frutillas', 'pera', 'peras', 'uva', 'uvas', 'palta', 'paltas', 'choclo', 'choclos', 'pepino', 'pepinos', 'berenjena', 'berenjenas', 'brocoli', 'coliflor', 'durazno', 'duraznos', 'ciruela', 'ciruelas', 'kiwi', 'anana', 'sandia', 'melon', 'calabacin', 'puerro', 'perejil', 'albahaca', 'chirimoya', 'chirimoyas', 'mango', 'mangos', 'maracuya', 'pomelo', 'pomelos', 'higo', 'higos', 'frambuesa', 'frambuesas', 'arandano', 'arandanos', 'cereza', 'cerezas', 'coco', 'damasco', 'damascos', 'membrillo', 'pelon', 'pelones', 'kaki', 'caqui', 'guayaba', 'mamon', 'quinoto', 'quinotos', 'rucula', 'cebollin', 'verdeo', 'remolacha', 'remolachas', 'nabo', 'apio', 'jengibre', 'champinon', 'champinones', 'hongos', 'pimiento', 'pimientos', 'chaucha', 'chauchas', 'arveja', 'arvejas', 'radicheta', 'repollo', 'batata', 'batatas', 'mandioca', 'zuccini', 'kiwis', 'melones', 'sandias', 'anana', 'aguacate'], 'Supermercado', 'Verdulería', 'producto'],
  [['agua', 'agua mineral', 'refresco', 'refrescos', 'gaseosa', 'gaseosas', 'coca', 'jugo', 'jugos', 'vino', 'soda'], 'Supermercado', 'Bebidas', 'producto'],
  [['leche', 'queso', 'yogur', 'manteca', 'huevo', 'huevos', 'dulce de leche'], 'Supermercado', 'Lácteos y huevos', 'producto'],
  [['detergente', 'lavandina', 'jabon en polvo', 'suavizante'], 'Supermercado', 'Limpieza', 'producto'],
  [['shampoo', 'champu', 'desodorante', 'pasta de dientes', 'papel higienico'], 'Supermercado', 'Higiene', 'producto'],
  [['almacen', 'autoservicio', 'mercadito', 'super', 'supermercado', 'disco', 'devoto', 'geant', 'tata', 'tienda inglesa', 'macro'], 'Supermercado', 'Almacén', 'lugar'],
  [['mercaderia', 'mercaderias', 'surtido', 'yerba', 'fideos', 'arroz', 'aceite', 'azucar', 'harina', 'galletitas'], 'Supermercado', 'Almacén', 'producto'],
  [['carniceria'], 'Supermercado', 'Carnes', 'lugar'],
  [['carne', 'pollo', 'asado', 'chorizo', 'chorizos', 'carne picada'], 'Supermercado', 'Carnes', 'producto'],
  [['panaderia'], 'Supermercado', 'Panadería', 'lugar'],
  [['pan', 'bizcochos', 'flautas'], 'Supermercado', 'Panadería', 'producto'],
  [['delivery', 'pedidosya', 'pedidos ya', 'rappi'], 'Delivery y salidas', 'Delivery', 'gasto'],
  [['almuerzo', 'cena', 'chivito', 'pizza', 'milanesa'], 'Delivery y salidas', 'Almuerzo', 'gasto'],
  [['bar', 'cafe', 'cerveza', 'merienda'], 'Delivery y salidas', 'Bar y café', 'gasto'],
  [['restoran', 'restaurante', 'parrilla'], 'Delivery y salidas', 'Restorán', 'gasto'],
  [['omnibus', 'bondi', 'stm', 'boleto'], 'Transporte', 'Ómnibus', 'gasto'],
  [['nafta', 'combustible', 'ancap', 'gasoil'], 'Transporte', 'Combustible', 'gasto'],
  [['taxi', 'uber', 'cabify'], 'Transporte', 'Taxi y apps', 'gasto'],
  [['peaje'], 'Transporte', 'Peajes', 'gasto'],
  [['estacionamiento', 'parking'], 'Transporte', 'Estacionamiento', 'gasto'],
  [['luz', 'ute'], 'Servicios', 'Luz', 'gasto'],
  [['internet', 'celular', 'antel', 'movistar', 'claro'], 'Servicios', 'Internet y celular', 'gasto'],
  [['gastos comunes'], 'Servicios', 'Gastos comunes', 'gasto'],
  [['alquiler'], 'Servicios', 'Alquiler', 'gasto'],
  [['farmacia'], 'Salud', 'Farmacia', 'lugar'],
  [['remedio', 'remedios'], 'Salud', 'Farmacia', 'producto'],
  [['mutualista', 'medico', 'emergencia movil'], 'Salud', 'Mutualista', 'gasto'],
  [['ferreteria'], 'Hogar', 'Ferretería', 'lugar'],
  [['bazar'], 'Hogar', 'Bazar', 'lugar'],
];

interface Token {
  raw: string;
  word: string;
  used: boolean;
  /** Coma, punto y coma o punto: separa gastos en una frase con varios. */
  comma?: boolean;
  /** Este monto viene después de una corrección y reemplaza al artículo anterior. */
  replaces?: boolean;
}

/** Parte la frase en palabras, con los montos dichos en palabras ya pasados a cifras. */
function tokenize(text: string): Token[] {
  // La coma y el punto separan solo seguidos de espacio: en "1.046,40" son parte del número.
  return spokenToDigits(text)
    .split(/(\s+|;|[,.!?](?=\s|$))/)
    .flatMap((t): Token[] => {
      if (/^[,;.!?]$/.test(t)) return [{ raw: t, word: t, used: false, comma: true }];
      const raw = t.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}]+$/gu, '');
      return raw ? [{ raw, word: normalize(raw).replace(/[^a-z0-9]/g, ''), used: false }] : [];
    });
}

/**
 * Busca cuándo fue ("ayer", "anteayer", "antes de ayer", "el viernes"), marca esas palabras como usadas
 * y devuelve la fecha. "El viernes" es el último viernes antes de hoy.
 */
function takeDate(tokens: Token[], today: IsoDate): IsoDate | undefined {
  let date: IsoDate | undefined;
  tokens.forEach((t, i) => {
    if (t.used || date) return;
    if (t.word in DAYS_AGO) {
      date = shiftDay(today, -DAYS_AGO[t.word]);
      t.used = true;
      // "antes de ayer"
      if (t.word === 'ayer' && tokens[i - 1]?.word === 'de' && tokens[i - 2]?.word === 'antes') {
        date = shiftDay(today, -2);
        tokens[i - 1].used = true;
        tokens[i - 2].used = true;
      }
      return;
    }
    const day = WEEKDAYS.indexOf(t.word);
    if (day >= 0 && tokens[i - 1]?.word === 'el') {
      date = shiftDay(today, -(((weekday(today) - day + 6) % 7) + 1));
      t.used = true;
      tokens[i - 1].used = true;
    }
  });
  return date;
}

/** Marca las frases de corrección como usadas y el monto que sigue a cada una como reemplazo del anterior. */
function takeCorrections(tokens: Token[]): void {
  const words = tokens.filter((t) => !t.comma);
  let pending = false;
  for (let i = 0; i < words.length; i++) {
    const marker = CORRECTIONS.find((m) => m.every((w, k) => words[i + k]?.word === w));
    if (marker) {
      marker.forEach((_, k) => (words[i + k].used = true));
      pending = true;
      i += marker.length - 1;
    } else if (pending && isAmount(words[i])) {
      words[i].replaces = true;
      pending = false;
    }
  }
}

const isAmount = (t: Token) => /^\$?\d[\d.,]*$/.test(t.raw) && Number.isFinite(parseAmount(t.raw));

/** Busca el medio de pago, lo marca como usado junto con sus palabras ("con", "de", "automático") y lo devuelve. */
function takePayment(tokens: Token[]): PaymentMethod | undefined {
  let payment: PaymentMethod | undefined;
  tokens.forEach((t, i) => {
    if (t.used || payment) return;
    let method = PAYMENT_WORD[t.word];
    if (!method) return;
    let last = i;
    // "tarjeta de débito" / "tarjeta de crédito"
    if (t.word === 'tarjeta' && tokens[i + 1]?.word === 'de' && PAYMENT_WORD[tokens[i + 2]?.word ?? ''] && tokens[i + 2].word !== 'tarjeta') {
      method = PAYMENT_WORD[tokens[i + 2].word];
      last = i + 2;
    }
    payment = method;
    for (let k = i; k <= last; k++) tokens[k].used = true;
    if (BEFORE_PAYMENT.has(tokens[i - 1]?.word ?? '')) tokens[i - 1].used = true;
    if (AFTER_PAYMENT.has(tokens[last + 1]?.word ?? '')) tokens[last + 1].used = true;
  });
  return payment;
}

/** Las palabras que quedan, sin relleno ni las de los bordes. */
function meaningful(tokens: Token[]): Token[] {
  const words = tokens.filter((t) => !t.used && !t.comma && !FILLER.has(t.word));
  while (words.length && EDGE_WORDS.has(words[0].word)) words.shift();
  while (words.length && EDGE_WORDS.has(words[words.length - 1].word)) words.pop();
  return words;
}

const capitalize = (raw: string) => raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();

function nameOf(words: Token[]): string {
  const fixed = MISHEARD[words.map((t) => t.word).join(' ')];
  if (fixed) return fixed;
  return words.map((t, i) => (i > 0 && LOWER_INSIDE.has(t.word) ? t.raw.toLowerCase() : capitalize(t.raw))).join(' ');
}

function guess(words: string[]): { category: Category; subcategory: string; kind?: Kind } {
  const fixed = MISHEARD[words.join(' ')];
  if (fixed) words = [normalize(fixed)];
  const joined = ` ${words.join(' ')} `;
  for (const [keys, category, subcategory, kind] of KEYWORDS) {
    if (keys.some((k) => (k.includes(' ') ? joined.includes(` ${k} `) : words.includes(k)))) return { category, subcategory, kind };
  }
  return { category: 'Otros', subcategory: 'Varios' };
}

const kindOf = (word: string) => KEYWORDS.find(([keys]) => keys.includes(word))?.[3];

/**
 * Categoría de un producto leído de un ticket, por su nombre: "Queso dambo 300 g" → Lácteos y huevos.
 * Las cantidades ("x2", "300 g") no cuentan.
 */
export function productCategory(name: string): { category: Category; subcategory: string } {
  const words = tokenize(name)
    .filter((t) => !t.comma && t.word && !/\d/.test(t.word))
    .map((t) => t.word);
  const { category, subcategory } = guess(words);
  return { category, subcategory };
}

/**
 * Entiende una frase de gasto escrita o dictada, sin internet: monto, comercio, categoría y medio de pago.
 * Es la versión local de lo que hace el bot; al sincronizar, el servidor puede mejorarla.
 */
export function parseQuickEntry(text: string, today: IsoDate = todayIso()): QuickEntry {
  const tokens = tokenize(text).filter((t) => !t.comma);
  // Con varios montos que terminan en uno solo ("450 en la feria, perdón, 540"), manda la lectura de varios
  if (tokens.filter(isAmount).length > 1) {
    const many = parseQuickEntries(text, today);
    if (many.items.length === 1) {
      const [it] = many.items;
      const one: QuickEntry = { amount: it.amount, store: it.place ?? it.name, category: it.category, subcategory: it.subcategory };
      const payment = it.payment ?? many.payment;
      if (payment) one.payment = payment;
      if (many.date) one.date = many.date;
      return one;
    }
  }
  const date = takeDate(tokens, today);
  takeCorrections(tokens);

  let amount: number | undefined;
  for (const t of tokens) {
    if (t.raw === '$') t.used = true;
    else if (amount === undefined && isAmount(t)) {
      amount = parseAmount(t.raw);
      t.used = true;
    }
  }
  const payment = takePayment(tokens);
  const words = meaningful(tokens);
  const { category, subcategory } = guess(words.map((t) => t.word));

  const entry: QuickEntry = { store: nameOf(words), category, subcategory };
  if (amount !== undefined) entry.amount = amount;
  if (payment) entry.payment = payment;
  if (date) entry.date = date;
  if (amount === undefined || amount <= 0) entry.review = 'No encontramos el monto';
  return entry;
}

/**
 * Entiende una frase con varios montos: "en la feria gasté 168 de cebolla, 120 de tomate y 90 de papa"
 * o "450 en la feria, 1200 en el súper y 52 de ómnibus". Con un solo monto devuelve un solo artículo.
 */
export function parseQuickEntries(text: string, today: IsoDate = todayIso()): QuickEntries {
  const tokens = tokenize(text).filter((t) => t.raw !== '$');
  if (tokens.filter(isAmount).length <= 1) {
    const e = parseQuickEntry(text, today);
    const item: QuickItem = { amount: e.amount ?? 0, name: e.store, category: e.category, subcategory: e.subcategory };
    if (e.payment) item.payment = e.payment;
    return { items: e.amount ? [item] : [], together: false, store: e.store, ...(e.payment ? { payment: e.payment } : {}), ...(e.date ? { date: e.date } : {}) };
  }
  const date = takeDate(tokens, today);
  takeCorrections(tokens);

  // Trozos separados por coma o por "y": "168 de cebolla, 120 de tomate y 90 de papa"
  const chunks: Token[][] = [[]];
  for (const t of tokens) {
    if (t.comma) chunks.push([]);
    else if (t.word === 'y') chunks.push([t]);
    else chunks[chunks.length - 1].push(t);
  }

  // ¿Se dice primero el monto ("168 de cebolla") o primero el artículo ("cebolla 168")?
  const first = tokens.findIndex(isAmount);
  const before = meaningful(tokens.slice(0, first).map((t) => ({ ...t }))).filter((t) => !PAYMENT_WORD[t.word] && kindOf(t.word) !== 'lugar');
  const amountFirst = before.length === 0;

  let payment: PaymentMethod | undefined;
  let place: string | undefined;
  const groups: Token[][] = [];
  let pending: Token[] = [];
  chunks.forEach((chunk, i) => {
    if (chunk.some(isAmount)) {
      groups.push(...splitByAmounts([...pending, ...chunk], amountFirst));
      pending = [];
      return;
    }
    // Un trozo sin monto es el medio de pago o el lugar de todo, o parte del nombre de un artículo
    payment = takePayment(chunk) ?? payment;
    const words = meaningful(chunk);
    const where = words.find((t) => kindOf(t.word) === 'lugar');
    if (where && words.every((t) => t === where || EDGE_WORDS.has(t.word))) place = capitalize(where.raw);
    // "168 de pan y leche, 290 de yerba": la leche va con el pan
    else if (groups.length && (amountFirst || i === chunks.length - 1)) groups[groups.length - 1].push(...chunk);
    // "pan y leche 180": el pan va con lo que sigue
    else pending.push(...chunk);
  });
  if (pending.length && groups.length) groups[groups.length - 1].push(...pending);
  // "cebolla 168 tomate 120 papa 90 efectivo": el medio de pago del final es de todo
  if (!amountFirst && groups.length) {
    const last = groups[groups.length - 1];
    payment = takePayment(last.slice(last.findIndex(isAmount) + 1)) ?? payment;
  }

  const items: ReturnType<typeof itemFrom>[] = [];
  for (const item of groups.map((g) => itemFrom(g))) {
    // El mismo artículo dicho otra vez (corrigiendo o repitiendo la compra): vale la última mención
    const same = item.kind !== 'gasto' && item.name ? items.findIndex((it) => normalize(it.name) === normalize(item.name)) : -1;
    if (same >= 0) items[same] = item;
    // "960 de queso, o sea, 690": reemplaza al anterior y, si no dice qué es, es lo mismo que el anterior
    else if (item.replaces && items.length) {
      const last = items[items.length - 1];
      items[items.length - 1] = item.name ? item : { ...last, amount: item.amount, ...(item.payment ? { payment: item.payment } : {}) };
    } else items.push(item);
  }
  // Los gastos en sí mismos (ómnibus, almuerzo) van aparte; el resto puede ser una sola compra
  const inPurchase = items.filter((it) => it.kind !== 'gasto');
  // Un lugar dicho una vez ("en la feria gasté 168 de cebolla, 120 de tomate…") es el de toda la compra
  const places = new Set(inPurchase.flatMap((it) => (it.place ? [it.place] : [])));
  if (!place && places.size === 1 && inPurchase.every((it) => it.kind !== 'lugar')) place = [...places][0];
  const kinds = inPurchase.map((it) => it.kind);
  const together = inPurchase.length >= 2 && (!!place || (kinds.some((k) => k === 'producto') && kinds.every((k) => k !== 'lugar')));
  // En una sola compra se paga una vez: el medio de pago dicho en cualquier artículo es el de todo
  const itemPayments = new Set(inPurchase.flatMap((it) => (it.payment ? [it.payment] : [])));
  if (together && !payment && itemPayments.size === 1) payment = [...itemPayments][0];

  return {
    items: items.map(({ kind, replaces: _replaces, ...it }) => (together && kind === 'gasto' ? { ...it, apart: true } : it)),
    together,
    store: place ?? commonName(inPurchase.length ? inPurchase : items),
    ...(payment ? { payment } : {}),
    ...(date ? { date } : {}),
  };
}

/**
 * Un trozo con varios montos y sin comas, como suele llegar el dictado: "168 en cebolla 290 en yerba".
 * Cada monto va con lo que lo sigue o con lo que lo precede, según cómo se dijo la frase.
 */
function splitByAmounts(chunk: Token[], amountFirst: boolean): Token[][] {
  const at = chunk.flatMap((t, i) => (isAmount(t) ? [i] : []));
  if (at.length === 1) return [chunk];
  if (amountFirst) {
    // Lo de antes del primer monto ("en la feria gasté") va con el primero
    return at.map((start, k) => chunk.slice(k === 0 ? 0 : start, at[k + 1] ?? chunk.length));
  }
  return at.map((end, k) => chunk.slice(k === 0 ? 0 : at[k - 1] + 1, k === at.length - 1 ? chunk.length : end + 1));
}

function itemFrom(group: Token[]): QuickItem & { kind?: Kind; replaces?: boolean } {
  const tokens = group.map((t) => ({ ...t }));
  const amountToken = tokens.find(isAmount);
  if (amountToken) amountToken.used = true;
  const payment = takePayment(tokens);
  let words = meaningful(tokens);
  // Un lugar junto a un producto dice dónde fue, no qué se compró: "tomate en la feria"
  const where = words.find((t) => kindOf(t.word) === 'lugar');
  let place: string | undefined;
  if (where && words.some((t) => kindOf(t.word) === 'producto')) {
    place = capitalize(where.raw);
    where.used = true;
    words = meaningful(words);
  } else if (where && words.length > 1 && words[words.length - 1] !== where) {
    // "feria gasté 168 de cebolla" sin producto conocido: el lugar va adelante del artículo
    place = capitalize(where.raw);
    where.used = true;
    words = meaningful(words);
  }
  const { category, subcategory, kind } = guess(words.map((t) => t.word));
  const item: QuickItem & { kind?: Kind; replaces?: boolean } = { amount: amountToken ? parseAmount(amountToken.raw) : 0, name: nameOf(words), category, subcategory };
  if (kind) item.kind = kind;
  if (amountToken?.replaces) item.replaces = true;
  if (place) item.place = place;
  if (payment) item.payment = payment;
  return item;
}

/** Cómo llamar a una compra sin lugar dicho: lo que tienen en común sus artículos. */
function commonName(items: QuickItem[]): string {
  const subs = new Set(items.map((it) => it.subcategory));
  if (subs.size === 1 && !subs.has('Varios')) return [...subs][0];
  const cats = new Set(items.map((it) => it.category));
  if (cats.size === 1 && !cats.has('Otros')) return [...cats][0];
  return 'Compra';
}
