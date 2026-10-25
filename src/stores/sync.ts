import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { toRemote } from '@/domain/sync';
import { isConnected, onConnectionChange } from '@/services/network';
import { KEYS, stored } from '@/services/storage';
import { OfflineError, resetSimulatedServer, simulatedServer } from '@/services/syncServer';
import { useGastosStore } from './gastos';

interface SyncData {
  lastSyncAt?: string;
  /** Prueba: hace de cuenta que no hay señal aunque la haya. */
  simulateOffline: boolean;
}

const db = stored<SyncData>(KEYS.sync);

/**
 * Sincronización con la cuenta del bot: sube lo pendiente y trae lo registrado por WhatsApp.
 * Corre sola al abrir la app, al guardar un gasto con señal y cada vez que vuelve la señal.
 */
export const useSyncStore = defineStore('sync', () => {
  const connected = ref(true);
  const simulateOffline = ref(false);
  const syncing = ref(false);
  const lastSyncAt = ref<string>();
  const lastError = ref('');
  const started = ref(false);
  /** Alguien pidió sincronizar mientras ya se estaba sincronizando. */
  let again = false;

  const online = computed(() => connected.value && !simulateOffline.value);
  const server = simulatedServer(async () => online.value);

  async function persist() {
    await db.save({ lastSyncAt: lastSyncAt.value, simulateOffline: simulateOffline.value });
  }

  async function syncNow() {
    if (!online.value) return;
    if (syncing.value) {
      again = true;
      return;
    }
    const gastos = useGastosStore();
    syncing.value = true;
    lastError.value = '';
    try {
      // Primero lo borrado en el teléfono, así el servidor no lo devuelve al traer lo de la cuenta
      const deletions = [...gastos.deletions];
      if (deletions.length) {
        await server.remove(deletions);
        await gastos.deletionsSynced(deletions);
      }
      const pending = gastos.pending;
      if (pending.length) await gastos.applyRemote(await server.push(pending.map(toRemote)));
      await gastos.applyRemote(await server.pull());
      lastSyncAt.value = new Date().toISOString();
      await persist();
    } catch (e) {
      lastError.value = e instanceof OfflineError ? '' : e instanceof Error ? e.message : 'No se pudo sincronizar.';
    } finally {
      syncing.value = false;
      if (again) {
        again = false;
        void syncNow();
      }
    }
  }

  /** Arranca una sola vez: lee el estado de la red y sincroniza cuando vuelve la señal. */
  async function start() {
    if (started.value) return;
    started.value = true;
    const data = await db.load();
    lastSyncAt.value = data?.lastSyncAt;
    simulateOffline.value = data?.simulateOffline ?? false;
    connected.value = await isConnected();
    onConnectionChange((c) => {
      const wasOnline = online.value;
      connected.value = c;
      if (!wasOnline && online.value) void syncNow();
    });
    const gastos = useGastosStore();
    watch(
      () => [gastos.pending.length, gastos.deletions.length] as const,
      ([n, d], [before, deletedBefore]) => {
        if (n > before || d > deletedBefore) void syncNow();
      },
    );
    void syncNow();
  }

  async function setSimulateOffline(value: boolean) {
    simulateOffline.value = value;
    await persist();
    if (!value) void syncNow();
  }

  async function resetDemo() {
    lastSyncAt.value = undefined;
    await Promise.all([persist(), resetSimulatedServer()]);
  }

  return { connected, simulateOffline, online, syncing, lastSyncAt, lastError, start, syncNow, setSimulateOffline, resetDemo };
});
