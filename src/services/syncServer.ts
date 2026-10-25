import { seedServer } from '@/data/seed';
import type { Deletion, RemoteExpense, RemoteExpenseInput } from '@/domain/sync';
import { KEYS, stored } from './storage';

/**
 * El servidor del bot de WhatsApp, visto desde la app. Cuando el bot exista, una implementación HTTP
 * de esta interfaz reemplaza a la simulada y el resto de la app queda igual.
 */
export interface SyncServer {
  /** Sube gastos nuevos o corregidos. Devuelve cómo quedaron en el servidor, con su id; un clientId repetido se actualiza, no se duplica. */
  push(items: RemoteExpenseInput[]): Promise<RemoteExpense[]>;
  /** Todo lo de la cuenta: lo subido por la app y lo registrado por WhatsApp. */
  pull(): Promise<RemoteExpense[]>;
  /** Borra movimientos de la cuenta, por id del servidor o por el id con que los subió la app. Lo que no existe se ignora. */
  remove(items: Deletion[]): Promise<void>;
}

export class OfflineError extends Error {
  constructor() {
    super('Sin conexión');
  }
}

const serverData = stored<RemoteExpense[]>(KEYS.servidor);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Servidor simulado: guarda "su" base en el teléfono, tarda como uno real y falla sin conexión.
 * `connected` decide si hay señal (la real o la simulada desde la pantalla Sincronizar).
 */
export function simulatedServer(connected: () => Promise<boolean>): SyncServer {
  async function load(): Promise<RemoteExpense[]> {
    const data = await serverData.load();
    if (data) return data;
    const initial = seedServer();
    await serverData.save(initial);
    return initial;
  }

  async function guard() {
    await wait(700);
    if (!(await connected())) throw new OfflineError();
  }

  return {
    async push(items) {
      await guard();
      const data = await load();
      const result = items.map((item, i) => {
        const existing = data.findIndex((r) => r.clientId === item.clientId);
        if (existing >= 0) {
          // Un gasto corregido en el teléfono reemplaza la versión anterior
          data[existing] = { ...item, id: data[existing].id };
          return data[existing];
        }
        const created: RemoteExpense = { ...item, id: `r-${Date.now().toString(36)}-${i}` };
        data.push(created);
        return created;
      });
      await serverData.save(data);
      return result;
    },
    async pull() {
      await guard();
      return load();
    },
    async remove(items) {
      await guard();
      const data = await load();
      const gone = (r: RemoteExpense) => items.some((d) => d.remoteId === r.id || (r.clientId !== undefined && d.clientId === r.clientId));
      await serverData.save(data.filter((r) => !gone(r)));
    },
  };
}

/** Borra la base del servidor simulado (al volver a los datos de ejemplo). */
export async function resetSimulatedServer(): Promise<void> {
  await serverData.clear();
}
