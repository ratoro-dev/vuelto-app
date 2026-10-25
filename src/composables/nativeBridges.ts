import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { watch } from 'vue';
import type { Router } from 'vue-router';
import { billReminderPlan } from '@/domain/bills';
import { goalReminderPlan } from '@/domain/goals';
import { todayIso, timeOf } from '@/domain/dates';
import { deepLinkRoute } from '@/domain/deepLinks';
import { widgetSnapshot } from '@/domain/widgets';
import { onReminderTap, scheduleBillReminders, scheduleGoalReminders } from '@/services/reminders';
import { onInboxChanged, takeSiriInbox, updateWidgets } from '@/services/widgets';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/**
 * Lo que conecta la app con el resto del teléfono:
 * - widgets y Siri: cada cambio de gastos o finanzas rehace lo que muestran;
 * - lo anotado con Siri o dictado en el Apple Watch se guarda al abrir la app, al volver a ella o en el momento;
 * - los links `rumbo://…` (widgets, botón de acción, avisos) abren su pantalla;
 * - los avisos de vencimiento se reprograman cuando cambian las facturas.
 */
export function startNativeBridges(router: Router): void {
  const gastos = useGastosStore();
  const finanzas = useFinanzasStore();

  const refreshWidgets = debounce(() => {
    void updateWidgets(
      widgetSnapshot({
        tickets: gastos.tickets,
        budget: finanzas.budget,
        bills: finanzas.bills,
        pendingCount: gastos.pending.length + gastos.toReview.length,
        today: todayIso(),
        now: new Date(),
      }),
    );
  }, 400);
  watch(() => [gastos.tickets, finanzas.budget, finanzas.bills], refreshWidgets, { deep: true, immediate: true });

  const refreshReminders = debounce(() => {
    const now = new Date();
    const plan = finanzas.remindersOn ? billReminderPlan(finanzas.bills, gastos.tickets, todayIso(now), timeOf(now.toISOString())) : [];
    void scheduleBillReminders(plan);
    void scheduleGoalReminders(goalReminderPlan(finanzas.goals, todayIso(now), timeOf(now.toISOString())));
  }, 800);
  watch(() => [finanzas.bills, finanzas.remindersOn, finanzas.goals, gastos.tickets], refreshReminders, { deep: true, immediate: true });

  const open = (url: string) => {
    const route = deepLinkRoute(url);
    if (!route) return;
    // Cada toque del widget es un pedido nuevo, aunque la URL sea la misma de la vez anterior
    void router.push(route.startsWith('/tabs/registrar?') ? `${route}&n=${Date.now()}` : route);
  };

  async function importInbox() {
    const items = await takeSiriInbox();
    for (const item of items) await gastos.addFromPhrase(item.phrase, 'voz', todayIso(new Date(item.at)), item.category);
    if (items.length) console.info(`Siri o el reloj: ${items.length} gasto(s) importado(s)`);
  }

  if (!Capacitor.isNativePlatform()) return;
  void importInbox();
  void App.getLaunchUrl().then((launch) => launch?.url && open(launch.url));
  void App.addListener('appUrlOpen', (e) => open(e.url));
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    void importInbox();
    // Al volver a la app puede haber cambiado el día: "Hoy" y los avisos se recalculan
    refreshWidgets();
    refreshReminders();
  });
  onReminderTap(open);
  onInboxChanged(() => void importInbox());
}
