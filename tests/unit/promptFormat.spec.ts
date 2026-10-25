import { describe, expect, it } from 'vitest';
import { PAPER_FORMAT_INSTRUCTIONS, parsePaperFormat } from '@/domain/promptFormat';

describe('parsePaperFormat', () => {
  it('lee un artículo por renglón y el total', () => {
    const r = parsePaperFormat('ARTICULO | BON | Boniato | 75\nARTICULO | PLAT | Plátano | 99\nTOTAL | 174');
    expect(r).toEqual({
      store: '',
      items: [
        { written: 'BON', name: 'Boniato', amount: 75 },
        { written: 'PLAT', name: 'Plátano', amount: 99 },
      ],
      total: 174,
    });
  });

  it('tolera lo que suelen agregar los modelos: viñetas, bloques de código, minúsculas y montos con $', () => {
    const r = parsePaperFormat('```\n- articulo|Tom| Tomate |$ 45\n* ARTÍCULO | Queso | Queso dambo | 1.046,40\n```\nTotal: | $ 1.091,40');
    expect(r.items).toEqual([
      { written: 'Tom', name: 'Tomate', amount: 45 },
      { written: 'Queso', name: 'Queso dambo', amount: 1046.4 },
    ]);
    expect(r.total).toBe(1091.4);
  });

  it('si el modelo omite lo escrito, usa el producto', () => {
    expect(parsePaperFormat('ARTICULO | Boniato | 75').items).toEqual([{ written: 'Boniato', name: 'Boniato', amount: 75 }]);
  });

  it('ignora lo que no sigue el formato y un renglón cortado al final de la respuesta', () => {
    const r = parsePaperFormat('Acá está el ticket:\nARTICULO | PAPA | Papa | 200\nARTICULO | AJI | Aj');
    expect(r.items).toEqual([{ written: 'PAPA', name: 'Papa', amount: 200 }]);
    expect(r.total).toBe(0);
  });

  it('las instrucciones del formato y el lector usan las mismas palabras clave', () => {
    expect(PAPER_FORMAT_INSTRUCTIONS).toContain('ARTICULO |');
    expect(PAPER_FORMAT_INSTRUCTIONS).toContain('TOTAL |');
  });
});
