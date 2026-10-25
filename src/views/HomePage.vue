<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap">
        <div class="top">
          <span class="hello">Hola</span>
          <button type="button" class="rb-pill status" @click="router.push('/tabs/movimientos/sync')">
            <span class="rb-dot" :style="{ background: dotColor }" />
            {{ statusText }}
          </button>
        </div>

        <div class="available">
          <span class="lead">Te quedan para gastos del día a día</span>
          <span class="rb-big" :class="{ 'rb-attention': status.remaining < 0 }">{{ formatPesos(status.remaining) }}</span>
          <div class="bar"><span :style="{ width: `${Math.min(100, status.usedShare * 100)}%`, background: status.usedShare > 1 ? 'var(--rb-warn)' : 'var(--rb-accent)' }" /></div>
          <div class="totals"><span>Gastado {{ formatPesos(status.spent) }} · {{ percent(status.usedShare) }}</span><span>de {{ formatPesos(status.total) }}</span></div>
          <span class="projection">
            Proyección a fin de mes: <strong>{{ formatPesos(projection) }}</strong>
            <span v-if="projection > status.total" class="rb-attention"> (+ {{ formatPesos(projection - status.total) }})</span>
          </span>
        </div>

        <!-- Una sola alerta por pantalla, solo para lo que pide acción -->
        <button v-if="alert" type="button" class="rb-alert" @click="router.push(alert.to)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--rb-warn)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
          <span class="grow"><span class="t">{{ alert.title }}</span><span class="s">{{ alert.detail }}</span></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rb-warn)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>

        <div class="rb-section">
          <div class="rb-section-head">
            <span class="rb-label" style="padding: 0">Hoy</span>
            <button type="button" class="link" @click="router.push('/tabs/movimientos')">Ver movimientos</button>
          </div>
          <div v-if="gastos.todayTickets.length" class="rb-group">
            <gasto-row v-for="t in gastos.todayTickets" :key="t.id" :ticket="t" tall :fixed="fixedIds.has(t.id)" @open="openGasto" />
          </div>
          <div v-else class="rb-empty">
            <span class="t">Todavía no registraste nada hoy</span>
            <span class="s">Tocá + para anotar un gasto. Funciona aunque no tengas señal.</span>
          </div>
        </div>

        <!-- Siempre hay una entrada a Facturas: la próxima a vencer, una vencida sin pagar o "todo pagado" -->
        <!-- Los gastos fijos van aparte del presupuesto, pero se ven: cuánto se pagó del total y lo próximo -->
        <div v-if="finanzas.bills.length" class="rb-section">
          <span class="rb-label">Gastos fijos de {{ monthName(month) }}</span>
          <button type="button" class="rb-card fixed" @click="router.push('/tabs/inicio/facturas')">
            <span class="fixed-line">
              <span>Pagado <strong class="rb-amount">{{ formatPesos(billsMonth.paid) }}</strong> de {{ formatPesos(billsMonth.total) }}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </span>
            <span class="bar fixed-bar"><span :style="{ width: `${billsMonth.total ? Math.min(100, (billsMonth.paid / billsMonth.total) * 100) : 0}%` }" /></span>
            <span class="fixed-next" :class="{ 'rb-attention': nextBill && nextBill.daysLeft < 0 }">{{ nextText }}</span>
          </button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed } from 'vue';
import GastoRow from '@/components/GastoRow.vue';
import { useFixedCostIds } from '@/composables/fixedCosts';
import { billsForMonth } from '@/domain/bills';
import { budgetStatus, monthProjection } from '@/domain/budget';
import { monthKey, monthName, todayIso, weekdayShort } from '@/domain/dates';
import { formatPesos } from '@/domain/money';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';
import { useSyncStore } from '@/stores/sync';

const router = useIonRouter();
const fixedIds = useFixedCostIds();
const gastos = useGastosStore();
const finanzas = useFinanzasStore();
const sync = useSyncStore();

const today = computed(() => todayIso());
const month = computed(() => monthKey(today.value));
const status = computed(() => budgetStatus(gastos.tickets, finanzas.budget, month.value, today.value, finanzas.bills));
const projection = computed(() => monthProjection(gastos.tickets, finanzas.bills, month.value, today.value));
const billsMonth = computed(() => billsForMonth(finanzas.bills, month.value, gastos.tickets, today.value));
/** "Próximo: tarjeta de crédito, vie 9 · $ 4.860 · 4 por pagar" (o la vencida sin pagar). */
const nextText = computed(() => {
  const b = nextBill.value;
  if (!b) return 'Todo pagado este mes';
  const left = billsMonth.value.upcoming.length;
  const when = `${weekdayShort(b.dueDate).toLowerCase()} ${Number(b.dueDate.slice(8, 10))}`;
  const amount = `${b.estimated ? '≈ ' : ''}${formatPesos(b.amount)}`;
  return `${b.daysLeft < 0 ? 'Vencida' : 'Próximo'}: ${b.bill.name.toLowerCase()}, ${when} · ${amount} · ${left} por pagar`;
});
/** Una vencida sin pagar va primero; si no, la próxima a vencer. */
const nextBill = computed(() => billsMonth.value.upcoming.find((b) => b.daysLeft < 0) ?? billsMonth.value.upcoming.find((b) => b.daysLeft >= 0));

const percent = (share: number) => `${(Math.round(share * 1000) / 10).toString().replace('.', ',')}%`;

/** Lo que todavía no está en la cuenta: lo guardado en el teléfono y lo que hay que revisar. */
const waiting = computed(() => gastos.pending.length + gastos.toReview.length);
const statusText = computed(() => {
  const n = waiting.value;
  if (!sync.online) return n ? `Sin conexión · ${n} en el teléfono` : 'Sin conexión';
  if (sync.syncing && n) return `Subiendo · ${n}`;
  return n ? `${n} en el teléfono` : 'Al día';
});
const dotColor = computed(() => (!sync.online || waiting.value ? 'var(--rb-warn-dot)' : 'var(--rb-accent)'));

/** La alerta de la pantalla: una categoría pasada de su límite o, si no, un gasto para revisar. */
const alert = computed(() => {
  const over = status.value.categories.find((c) => c.over > 0);
  if (over) {
    return { title: `${over.category} superó su límite`, detail: `+ ${formatPesos(over.over)} este mes · Ver qué hacer`, to: '/tabs/presupuesto' };
  }
  const review = gastos.toReview[0];
  if (review) {
    const n = gastos.toReview.length;
    return {
      title: n === 1 ? '1 gasto necesita revisión' : `${n} gastos necesitan revisión`,
      detail: `${review.store}: ${(review.review ?? '').toLowerCase()}`,
      to: `/tabs/movimientos/gasto/${review.id}`,
    };
  }
  return undefined;
});

function openGasto(id: string) {
  router.push(`/tabs/inicio/gasto/${id}`);
}
</script>

<style scoped>
.top { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; min-height: 44px; }
.hello { font-size: 16px; color: var(--rb-muted); }
.rb-wrap .status { color: var(--rb-ink-3); font-weight: 400; }
.available { display: flex; flex-direction: column; gap: 6px; padding: 0 4px; }
.lead { font-size: 15px; color: var(--rb-muted); }
.bar { height: 6px; border-radius: 3px; background: var(--rb-line); margin-top: 8px; overflow: hidden; }
.bar > span { display: block; height: 100%; border-radius: 3px; }
.totals { display: flex; justify-content: space-between; font-size: 14px; color: var(--rb-muted); }
.projection { font-size: 16px; color: var(--rb-ink-3); margin-top: 2px; }
.projection strong { font-weight: 600; color: var(--rb-ink); }
.rb-wrap .link { font-size: 15px; color: var(--rb-accent); min-height: 32px; }
.rb-wrap .fixed { width: 100%; text-align: left; gap: 10px; padding: 14px; }
.fixed-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 16px; }
.fixed-line strong { font-weight: 600; }
.fixed-bar { margin-top: 0; }
.fixed-bar > span { background: var(--rb-ink-3); }
.fixed-next { font-size: 14px; color: var(--rb-muted); }
.rb-row.tall { min-height: 60px; }
</style>
