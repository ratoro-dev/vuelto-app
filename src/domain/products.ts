
/** Minúsculas y sin tildes, para comparar textos. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Abreviaturas frecuentes en tickets uruguayos → palabra completa.
 * Es el punto de partida del diccionario; crece con cada ticket real que se lee mal.
 */
const ABBREVIATIONS: Record<string, string> = {
  'c/palo': 'con palo',
  's/palo': 'sin palo',
  'descr.': 'descremada',
  'ent.': 'entera',
  'min.': 'mineral',
  'surt.': 'surtidos',
  'gall.': 'galletas',
  'triguen': 'trigueñas',
  'past.': 'pasta',
  'refr.': 'refresco',
  'mant.': 'manteca',
  'dce.': 'dulce',
  'q.': 'queso',
  'jab.': 'jabón',
  'det.': 'detergente',
};

const UNIT = /^(\d+(?:[.,]\d+)?)(kg|g|gr|l|lt|ml|cc|u|un)$/i;

/**
 * Convierte el texto crudo del ticket en un nombre legible.
 * "YERBA C/PALO 1KG" → "Yerba con palo 1 kg".
 * Es una heurística: en la app real lo complementa la IA que lee las líneas.
 */
export function prettifyRaw(raw: string): string {
  const words = raw
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (ABBREVIATIONS[lower]) return ABBREVIATIONS[lower];
      const u = lower.match(UNIT);
      if (u) {
        const unit = u[2] === 'gr' ? 'g' : u[2] === 'lt' ? 'L' : u[2] === 'l' ? 'L' : u[2] === 'un' || u[2] === 'u' ? 'u.' : u[2];
        return `${u[1].replace('.', ',')} ${unit}`;
      }
      if (/^x\d+$/i.test(w)) return `×${w.slice(1)}`;
      return lower;
    })
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
