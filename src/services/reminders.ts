import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { BillReminder } from '@/domain/bills';
import type { GoalReminder } from '@/domain/goals';

const native = () => Capacitor.isNativePlatform();

/** Pide permiso para avisar. Devuelve si quedó permitido. */
export async function enableReminders(): Promise<boolean> {
  if (!native()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

interface Planned {
  id: number;
  title: string;
  body: string;
  /** Fecha y hora local: '2026-10-07T10:00'. */
  at: string;
  extra: Record<string, string>;
}

/**
 * Reemplaza los avisos programados de un tipo ('factura' o 'meta') por los de `plan` (vacío para apagarlos),
 * sin tocar los del otro tipo.
 */
async function replaceReminders(kind: string, plan: Planned[]): Promise<void> {
  if (!native()) return;
  try {
    const { notifications } = await LocalNotifications.getPending();
    const ours = notifications.filter((n) => (n.extra as { kind?: string } | undefined)?.kind === kind);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    if (!plan.length) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: plan.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        // Sin zona horaria: es la hora local del teléfono
        schedule: { at: new Date(r.at), allowWhileIdle: true },
        extra: { ...r.extra, kind },
      })),
    });
  } catch (e) {
    console.warn('No se pudieron programar los avisos', e);
  }
}

/** Los avisos de vencimiento de las facturas. Tocarlos abre Facturas. */
export function scheduleBillReminders(plan: BillReminder[]): Promise<void> {
  return replaceReminders(
    'factura',
    plan.map((r) => ({ ...r, extra: { billId: r.billId, month: r.month, url: 'rumbo://facturas' } })),
  );
}

/** Los avisos del aporte de las metas de ahorro, el día 1. Tocarlos abre Metas. */
export function scheduleGoalReminders(plan: GoalReminder[]): Promise<void> {
  return replaceReminders(
    'meta',
    plan.map((r) => ({ ...r, extra: { goalId: r.goalId, url: 'rumbo://metas' } })),
  );
}

/** Al tocar un aviso, la app abre lo que dice su `url` (Facturas o Metas). */
export function onReminderTap(open: (url: string) => void): void {
  if (!native()) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const url = (e.notification.extra as { url?: string } | undefined)?.url;
    if (url) open(url);
  });
}
