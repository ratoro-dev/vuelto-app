import { Capacitor, type PluginListenerHandle, registerPlugin } from '@capacitor/core';
import type { WidgetSnapshot } from '@/domain/widgets';

/** Lo que se anotó con Siri o se dictó en el Apple Watch y todavía no se guardó como gasto. */
export interface InboxItem {
  phrase: string;
  /** Cuándo se dijo (instante ISO). */
  at: string;
  /** La categoría elegida a mano en el reloj, si la cambió. */
  category?: string;
}

/**
 * Plugin propio de la app (`ios/App/App/RumboWidgetsPlugin.swift`): escribe en el contenedor compartido (App Group)
 * que leen los widgets, los controles y los atajos de Siri, y entrega lo anotado con Siri.
 */
interface RumboWidgetsPlugin {
  update(options: { snapshot: string }): Promise<void>;
  takeInbox(): Promise<{ items: InboxItem[] }>;
  /** Llegó algo dictado en el Apple Watch con la app abierta. */
  addListener(event: 'inbox', listener: () => void): Promise<PluginListenerHandle>;
}

const RumboWidgets = registerPlugin<RumboWidgetsPlugin>('RumboWidgets');

/** Widgets del iPhone (WidgetKit) y de Android (pantalla de inicio). */
const supported = () => Capacitor.isNativePlatform();

export async function updateWidgets(snapshot: WidgetSnapshot): Promise<void> {
  if (!supported()) return;
  try {
    await RumboWidgets.update({ snapshot: JSON.stringify(snapshot) });
  } catch (e) {
    console.warn('No se pudieron actualizar los widgets', e);
  }
}

export async function takeSiriInbox(): Promise<InboxItem[]> {
  if (!supported()) return [];
  try {
    return (await RumboWidgets.takeInbox()).items;
  } catch {
    return [];
  }
}

/** Avisa cuando el Apple Watch manda un gasto dictado mientras la app está abierta. */
export function onInboxChanged(listener: () => void): void {
  if (Capacitor.getPlatform() !== 'ios') return;
  void RumboWidgets.addListener('inbox', listener);
}
