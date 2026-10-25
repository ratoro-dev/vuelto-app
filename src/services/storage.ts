import { Preferences } from '@capacitor/preferences';

/** Claves de lo que Rumbo guarda en el teléfono. Cambiar la forma de un dato = nueva versión de su clave. */
export const KEYS = {
  gastos: 'rumbo.gastos.v1',
  puestos: 'rumbo.puestos.v1',
  finanzas: 'rumbo.finanzas.v1',
  sync: 'rumbo.sync.v1',
  servidor: 'rumbo.servidor-simulado.v1',
  /** Movimientos borrados en el teléfono que el servidor todavía no borró. */
  borrados: 'rumbo.borrados.v1',
} as const;

/**
 * Un valor JSON guardado en el teléfono (Capacitor Preferences). Alcanza para la base local y la cola de
 * pendientes del MVP; con muchas fotos conviene pasar a SQLite o archivos (ver services/photo.ts).
 */
export function stored<T>(key: string) {
  return {
    async load(): Promise<T | null> {
      const { value } = await Preferences.get({ key });
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    },
    async save(value: T): Promise<void> {
      await Preferences.set({ key, value: JSON.stringify(value) });
    },
    async clear(): Promise<void> {
      await Preferences.remove({ key });
    },
  };
}
