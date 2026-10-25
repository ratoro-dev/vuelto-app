import { parseAmount } from './money';
import { normalize } from './products';

/** Del 1 al 29: en español se dicen en una sola palabra. */
const SMALL: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};
/** "Luca" es mil pesos en Uruguay: "dos lucas de nafta". */
const THOUSAND = new Set(['mil', 'luca', 'lucas']);

type Kind = 'small' | 'tens' | 'hundreds' | 'thousand' | 'digits';

function kindOf(word: string): Kind | undefined {
  if (word in SMALL) return 'small';
  if (word in TENS) return 'tens';
  if (word in HUNDREDS) return 'hundreds';
  if (THOUSAND.has(word)) return 'thousand';
  if (/^\d+([.,]\d+)?$/.test(word)) return 'digits';
  return undefined;
}

const clean = (raw: string) => normalize(raw).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

/**
 * Pasa a cifras los montos que el dictado devuelve en palabras: "mil doscientos en el súper" →
 * "1200 en el súper", "dos lucas y media de nafta" → "2500 de nafta". Los números chicos sueltos
 * ("dos empanadas") quedan como están, porque casi nunca son el monto.
 */
export function spokenToDigits(text: string): string {
  const words = text.trim().split(/\s+/);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const run = readNumber(words, i);
    if (run) {
      // Conserva la puntuación pegada a la última palabra ("doscientos," → "1200,")
      const tail = words[run.end - 1].match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
      out.push(`${run.value}${tail}`);
      i = run.end;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }
  return joinPrices(out).join(' ');
}

const digitValue = (word: string): number | undefined => {
  const w = clean(word);
  if (/^[1-9]$/.test(w)) return Number(w);
  return SMALL[w] !== undefined && SMALL[w] < 10 ? SMALL[w] : undefined;
};

/**
 * Precios dichos a la uruguaya: "cuatro ochenta" es 480 y "tres cincuenta" es 350. El dictado los escribe
 * "cuatro 80" o "3 50". También limpia el "4 480" que deja cuando corrige un número mientras se habla.
 */
function joinPrices(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const hundreds = digitValue(words[i]);
    const next = words[i + 1];
    const rest = next !== undefined && /^\d+[,.]?$/.test(next) ? next.replace(/[,.]$/, '') : undefined;
    if (hundreds !== undefined && rest !== undefined && !/[,.]$/.test(words[i])) {
      const tail = next.slice(rest.length);
      // "cuatro 80" → 480
      if (rest.length === 2 && Number(rest) >= 10) {
        out.push(`${hundreds * 100 + Number(rest)}${tail}`);
        i += 1;
        continue;
      }
      // "4 480" → 480: la cifra suelta es el comienzo del mismo número
      if (rest.length >= 3 && rest.startsWith(String(hundreds))) continue;
    }
    out.push(words[i]);
  }
  return out;
}

/** Lee un número dicho a partir de `start`. Devuelve dónde termina, o nada si ahí no empieza un monto. */
function readNumber(words: string[], start: number): { value: number; end: number } | undefined {
  let total = 0;
  let current = 0;
  let i = start;
  let last: Kind | 'y' | undefined;
  let hasThousand = false;
  let wordsUsed = 0;

  while (i < words.length) {
    const w = clean(words[i]);
    const kind = kindOf(w);
    if (kind === 'digits') {
      // Una cifra solo entra si es la primera y la sigue "mil"/"lucas": "2 lucas"
      if (i !== start || !THOUSAND.has(clean(words[i + 1] ?? ''))) break;
      current = parseAmount(w);
    } else if (kind === 'small') {
      if (last === 'small' || last === 'tens') break;
      current += SMALL[w];
    } else if (kind === 'tens') {
      if (last === 'small' || last === 'tens') break;
      current += TENS[w];
    } else if (kind === 'hundreds') {
      if (last === 'small' || last === 'tens' || last === 'hundreds') break;
      current += HUNDREDS[w];
    } else if (kind === 'thousand') {
      if (hasThousand) break;
      total += (current || 1) * 1000;
      current = 0;
      hasThousand = true;
    } else if (w === 'y') {
      const next = clean(words[i + 1] ?? '');
      // "cincuenta y dos"
      if (last === 'tens' && SMALL[next] !== undefined && SMALL[next] < 10) {
        last = 'y';
        i += 1;
        continue;
      }
      // "luca y media", "dos mil y medio"
      if (last === 'thousand' && (next === 'media' || next === 'medio')) {
        total += 500;
        i += 2;
        wordsUsed += 2;
        last = 'small';
        continue;
      }
      break;
    } else {
      break;
    }
    last = kind;
    wordsUsed += 1;
    i += 1;
  }

  const value = total + current;
  if (!wordsUsed || !value) return undefined;
  // Una cifra sola ya está en cifras; un número chico suelto no es un monto.
  if (wordsUsed === 1 && kindOf(clean(words[start])) === 'digits') return undefined;
  if (!hasThousand && value < 10) return undefined;
  return { value, end: i };
}
