import { describe, expect, it } from 'vitest';
import { deletionsFor, mergeRemote, pendingToUpload, toRemote, type RemoteExpense } from '@/domain/sync';
import type { Ticket } from '@/domain/types';

const NOW = '2026-10-08T12:00:00.000Z';

function local(id: string, extra: Partial<Ticket> = {}): Ticket {
  return {
    id,
    source: 'voz',
    store: 'Feria',
    date: '2026-10-08',
    payment: 'Efectivo',
    lines: [{ raw: 'Feria', pretty: 'Feria', category: 'Supermercado', subcategory: 'Verdulería', amount: 450 }],
    discounts: [],
    phrase: '450 en la feria, efectivo',
    sync: { state: 'pendiente' },
    createdAt: '2026-10-08T11:20:00.000Z',
    ...extra,
  };
}

const remoteBase: RemoteExpense = {
  id: 'r1',
  source: 'whatsapp',
  store: 'Ómnibus',
  amount: 52,
  category: 'Transporte',
  subcategory: 'Ómnibus',
  payment: 'Efectivo',
  date: '2026-10-08',
  createdAt: '2026-10-08T08:05:00.000Z',
};

describe('sincronización', () => {
  it('sube solo lo pendiente que no hay que revisar', () => {
    const tickets = [local('a'), local('b', { review: 'No se leyó el monto' }), local('c', { sync: { state: 'subido', remoteId: 'r9' } })];
    expect(pendingToUpload(tickets).map((t) => t.id)).toEqual(['a']);
  });

  it('lo que se sube lleva el id local, para que el servidor no lo duplique si se reintenta', () => {
    expect(toRemote(local('a'))).toEqual({
      clientId: 'a',
      source: 'voz',
      store: 'Feria',
      amount: 450,
      category: 'Supermercado',
      subcategory: 'Verdulería',
      payment: 'Efectivo',
      date: '2026-10-08',
      createdAt: '2026-10-08T11:20:00.000Z',
      phrase: '450 en la feria, efectivo',
    });
  });

  it('lo que vuelve del servidor con nuestro id marca el gasto local como subido', () => {
    const merged = mergeRemote([local('a')], [{ ...toRemote(local('a')), id: 'r2' }], NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0].sync).toEqual({ state: 'subido', remoteId: 'r2', syncedAt: NOW });
  });

  it('lo registrado por WhatsApp entra al historial una sola vez', () => {
    const once = mergeRemote([local('a')], [remoteBase], NOW);
    expect(once).toHaveLength(2);
    expect(once[1]).toMatchObject({ source: 'whatsapp', store: 'Ómnibus', date: '2026-10-08', sync: { state: 'subido', remoteId: 'r1' } });
    expect(once[1].lines[0]).toMatchObject({ category: 'Transporte', subcategory: 'Ómnibus', amount: 52 });
    expect(mergeRemote(once, [remoteBase], NOW)).toHaveLength(2);
  });

  it('un gasto ya subido y corregido vuelve a quedar subido cuando el servidor tiene la corrección', () => {
    const edited = local('a', { store: 'Feria del barrio', sync: { state: 'pendiente', remoteId: 'r2' } });
    const old = { ...toRemote(local('a')), id: 'r2' };
    // El servidor todavía tiene lo de antes: sigue pendiente para volver a subirse
    expect(mergeRemote([edited], [old], NOW)[0].sync.state).toBe('pendiente');
    // Después de subir la corrección
    const updated = { ...toRemote(edited), id: 'r2' };
    expect(mergeRemote([edited], [updated], NOW)[0].sync).toEqual({ state: 'subido', remoteId: 'r2', syncedAt: NOW });
  });

  it('lo borrado en el teléfono no vuelve del servidor, ni lo de WhatsApp ni lo que subió la app', () => {
    const whatsapp = mergeRemote([], [remoteBase], NOW)[0];
    const uploaded = local('a', { sync: { state: 'subido', remoteId: 'r2' } });
    const neverSynced = local('b');
    const deletions = deletionsFor([whatsapp, uploaded, neverSynced]);
    expect(deletions).toEqual([{ clientId: 'w-r1', remoteId: 'r1' }, { clientId: 'a', remoteId: 'r2' }, { clientId: 'b' }]);
    // El servidor todavía tiene los tres (el último se subió justo antes de borrarlo)
    const server = [remoteBase, { ...remoteBase, id: 'r2', clientId: 'a' }, { ...remoteBase, id: 'r3', clientId: 'b' }];
    expect(mergeRemote([], server, NOW, deletions)).toEqual([]);
  });

  it('un ticket con QR registrado en el bot y en la app no se duplica', () => {
    const cfe = { rut: '211234560018', cfeType: 101, serie: 'A', number: '1203556', total: 1342, date: '2026-10-06', url: 'u' };
    const merged = mergeRemote(
      [local('q', { source: 'qr', cfe })],
      [{ ...remoteBase, id: 'r3', source: 'qr', amount: 1342, cfe: { rut: cfe.rut, cfeType: 101, serie: 'A', number: '1203556' } }],
      NOW,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].sync).toMatchObject({ state: 'subido', remoteId: 'r3' });
  });
});
