import { describe, expect, it } from 'vitest';
import { cfeKey, cfeLabel, formatRut, isValidRut, parseCfeQr, rutCheckDigit } from '@/domain/cfe';
import { demoRut } from '@/data/seed';

const RUT = demoRut('21765432001');
const QR = `https://www.efactura.dgi.gub.uy/consultaQR/cfe?${RUT},101,A,0001203556,1046.40,30/09/2026,AbC123=`;

describe('parseCfeQr', () => {
  it('lee los datos del e-Ticket', () => {
    const r = parseCfeQr(QR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.header).toMatchObject({ rut: RUT, cfeType: 101, serie: 'A', number: '1203556', total: 1046.4, date: '2026-09-30', securityCode: 'AbC123=' });
    expect(r.warnings).toEqual([]);
  });

  it('acepta fechas aaaammdd y aaaa-mm-dd', () => {
    for (const d of ['20260930', '2026-09-30']) {
      const r = parseCfeQr(QR.replace('30/09/2026', d));
      expect(r.ok && r.header.date).toBe('2026-09-30');
    }
  });

  it('rechaza QR que no son de DGI', () => {
    expect(parseCfeQr('https://example.com/?1,2,3,4,5,6').ok).toBe(false);
    expect(parseCfeQr('hola').ok).toBe(false);
  });

  it('rechaza datos incompletos o mal formados', () => {
    expect(parseCfeQr('https://www.efactura.dgi.gub.uy/consultaQR/cfe?123,101').ok).toBe(false);
    expect(parseCfeQr(QR.replace('1046.40', 'mil')).ok).toBe(false);
    expect(parseCfeQr(QR.replace('30/09/2026', '31/13/2026')).ok).toBe(false);
  });

  it('avisa (sin rechazar) un RUT con dígito verificador incorrecto', () => {
    const bad = RUT.slice(0, 11) + String((Number(RUT[11]) + 1) % 10);
    const r = parseCfeQr(QR.replace(RUT, bad));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.length).toBe(1);
  });
});

describe('RUT', () => {
  it('calcula y valida el dígito verificador', () => {
    expect(isValidRut(RUT)).toBe(true);
    expect(rutCheckDigit(RUT.slice(0, 11))).toBe(Number(RUT[11]));
    expect(isValidRut('123')).toBe(false);
  });
  it('formatea', () => expect(formatRut('217654320018')).toBe('21 765432 0018'));
});

describe('etiquetas y claves', () => {
  it('cfeLabel y cfeKey', () => {
    const h = { rut: RUT, cfeType: 101, serie: 'A', number: '1203556' };
    expect(cfeLabel(h)).toBe('e-Ticket A 1.203.556');
    expect(cfeKey(h)).toBe(`${RUT}-101-A-1203556`);
  });
});
