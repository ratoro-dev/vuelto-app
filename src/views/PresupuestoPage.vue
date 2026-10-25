<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap presupuesto">
        <div class="head">
          <h1 class="rb-title" style="padding: 0">Presupuesto</h1>
          <button type="button" class="rb-pill" @click="pickMonth">
            {{ capitalize(monthName(month)) }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>

        <!-- El plan del mes: los gastos fijos (Facturas) más el presupuesto del día a día -->
        <div v-if="finanzas.bills.length" class="rb-card plan">
          <div class="plan-head"><span class="rb-label" style="padding: 0">Plan de {{ monthName(month) }}</span><span class="plan-total rb-amount">{{ formatPesos(round2(bills.total + status.total)) }}</span></div>
          <div class="stack" role="img" :aria-label="`Fijos ${formatPesos(bills.total)} y día a día ${formatPesos(status.total)}`">
            <span :style="{ flexGrow: bills.total, background: 'var(--rb-ink-3)' }" />
            <span :style="{ flexGrow: status.total, background: 'var(--rb-accent)' }" />
          </div>
          <div class="legend">
            <span><i style="background: var(--rb-ink-3)" />Fijos {{ formatPesos(bills.total) }}</span>
            <span><i style="background: var(--rb-accent)" />Día a día {{ formatPesos(status.total) }}</span>
          </div>
          <button type="button" class="plan-link" @click="router.push('/tabs/inicio/facturas')">
            <span>Fijos: {{ formatPesos(bills.paid) }} pagados · {{ bills.upcoming.length ? `${bills.upcoming.length} por pagar` : 'todo pagado' }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        <div class="rb-card summary">
          <div class="spent"><span class="value">{{ formatPesos(status.spent) }}</span><span class="of">de {{ formatPesos(status.total) }}</span></div>
          <div class="bar"><span :style="{ width: `${Math.min(100, status.usedShare * 100)}%`, background: status.usedShare > 1 ? 'var(--rb-warn)' : 'var(--rb-accent)' }" /></div>
          <span class="rb-small" :class="{ 'rb-attention': status.remaining < 0 }">{{ summaryText }}</span>
        </div>

        <div v-if="isCurrent" class="projection" :class="{ over: projection > status.total }">
          <div class="grow"><span class="label">Proyección a fin de mes</span><span class="value">{{ formatPesos(projection) }}</span></div>
          <span class="diff">{{ projection > status.total ? `+ ${formatPesos(projection - status.total)}` : `Te sobran ${formatPesos(status.total - projection)}` }}</span>
        </div>

        <div class="rb-section">
          <div class="rb-section-head">
            <span class="rb-label" style="padding: 0">Día a día por categoría</span>
            <button type="button" class="link" @click="openEditor">Editar límites</button>
          </div>
          <div class="rb-group">
            <div v-for="c in categories" :key="c.category" class="rb-stack cat-row">
              <div class="line">
                <span :style="{ fontWeight: c.over > 0 ? 500 : 400 }">{{ c.category }}</span>
                <span><span class="rb-amount" style="font-weight: 500" :class="{ 'rb-attention': c.over > 0 }">{{ formatPesos(c.spent) }}</span><span v-if="c.limit !== undefined" class="rb-muted rb-amount"> / {{ formatPesos(c.limit).replace('$ ', '') }}</span></span>
              </div>
              <div v-if="c.limit !== undefined" class="cat-bar" :class="{ over: c.over > 0 }"><span :style="{ width: `${Math.min(100, c.limit ? (c.spent / c.limit) * 100 : 100)}%` }" /></div>
              <span v-if="c.over > 0" class="note rb-attention">+ {{ formatPesos(c.over) }} sobre el límite</span>
              <span v-else-if="c.limit === undefined" class="note">Sin límite</span>
              <span v-else class="note" :class="{ 'rb-attention': c.atRisk }">Quedan {{ formatPesos(c.limit - c.spent) }}{{ c.atRisk ? ' · en riesgo' : '' }}</span>
              <div v-if="c.over > 0" class="cat-actions">
                <button type="button" class="rb-btn soft" @click="router.push(`/tabs/movimientos?categoria=${encodeURIComponent(c.category)}`)">Ver gastos</button>
                <button type="button" class="rb-btn soft" @click="adjust(c.category, c.limit ?? 0)">Ajustar límite</button>
              </div>
            </div>
            <div v-if="!categories.length" class="rb-row rb-muted">Sin gastos en {{ monthName(month) }}.</div>
          </div>
        </div>


      </div>

      <ion-modal :is-open="editorOpen" :initial-breakpoint="1" :breakpoints="[0, 1]" class="sheet-modal" @did-dismiss="editorOpen = false">
        <div class="rb-sheet">
          <div class="head"><span class="t">Límites del mes</span><button type="button" class="save" @click="saveEditor">Guardar</button></div>
          <div class="sheet-list">
            <label class="item"><span class="grow">Total del mes</span><input v-model="draft.total" class="rb-inline-input" inputmode="decimal" aria-label="Total del mes" /></label>
            <label v-for="c in CATEGORIES" :key="c" class="item"><span class="grow">{{ c }}</span><input v-model="draft.categories[c]" class="rb-inline-input" inputmode="decimal" placeholder="Sin límite" :aria-label="`Límite de ${c}`" /></label>
          </div>
        </div>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { actionSheetController, alertController, IonContent, IonModal, IonPage, useIonRouter } from '@ionic/vue';
import { computed, reactive, ref } from 'vue';
import { billsForMonth } from '@/domain/bills';
import { budgetStatus, monthProjection } from '@/domain/budget';
import { CATEGORIES } from '@/domain/categories';
import { monthKey, monthLabel, monthName, todayIso } from '@/domain/dates';
import { formatPesos, parseAmount, round2 } from '@/domain/money';
import type { Category } from '@/domain/types';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';

const router = useIonRouter();
const gastos = useGastosStore();
const finanzas = useFinanzasStore();

const month = ref(monthKey(todayIso()));
const isCurrent = computed(() => month.value === monthKey(todayIso()));
const status = computed(() => budgetStatus(gastos.tickets, finanzas.budget, month.value, todayIso(), finanzas.bills));
const projection = computed(() => monthProjection(gastos.tickets, finanzas.bills, month.value, todayIso()));
const bills = computed(() => billsForMonth(finanzas.bills, month.value, gastos.tickets, todayIso()));
/** Las pasadas de su límite primero; después, por lo gastado. */
const categories = computed(() => [...status.value.categories].sort((a, b) => Number(b.over > 0) - Number(a.over > 0) || b.spent - a.spent));
const percent = (share: number) => `${(Math.round(share * 1000) / 10).toString().replace('.', ',')}%`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const summaryText = computed(() => {
  const s = status.value;
  const left = s.remaining >= 0 ? `te quedan ${formatPesos(s.remaining)}` : `te pasaste por ${formatPesos(-s.remaining)}`;
  return `Día a día · ${left} · ${percent(s.usedShare)} usado`;
});

/** "Ajustar límite" de una categoría pasada. */
async function adjust(category: Category, current: number) {
  const alert = await alertController.create({
    header: `Límite de ${category}`,
    inputs: [{ name: 'limit', type: 'text', value: toInput(current), attributes: { inputmode: 'decimal' } }],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { limit: string } }>();
  const n = parseAmount(data?.values.limit ?? '');
  if (role !== 'confirm' || !(n > 0)) return;
  await finanzas.setBudget({ ...finanzas.budget, categories: { ...finanzas.budget.categories, [category]: n } });
}

async function pickMonth() {
  const current = monthKey(todayIso());
  const options = [...new Set([current, ...gastos.months])].sort().reverse();
  const sheet = await actionSheetController.create({
    header: 'Mes',
    buttons: [
      ...options.map((m) => ({ text: capitalize(monthLabel(m)), handler: () => { month.value = m; } })),
      { text: 'Cancelar', role: 'cancel' },
    ],
  });
  await sheet.present();
}

const editorOpen = ref(false);
const draft = reactive<{ total: string; categories: Partial<Record<Category, string>> }>({ total: '', categories: {} });
const toInput = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

function openEditor() {
  draft.total = toInput(finanzas.budget.total);
  draft.categories = Object.fromEntries(CATEGORIES.map((c) => [c, toInput(finanzas.budget.categories[c])]));
  editorOpen.value = true;
}

async function saveEditor() {
  const total = parseAmount(draft.total);
  const categories: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) {
    const n = parseAmount(draft.categories[c] ?? '');
    if (n > 0) categories[c] = n;
  }
  await finanzas.setBudget({ total: total > 0 ? total : finanzas.budget.total, categories });
  editorOpen.value = false;
}
</script>

<style scoped>
.presupuesto { gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; padding: 4px 4px 0; }
.summary { gap: 8px; padding: 14px 16px; }
.spent { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.spent .value { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.spent .of { font-size: 15px; color: var(--rb-muted); }
.bar { height: 6px; border-radius: 3px; background: var(--rb-line); overflow: hidden; }
.bar > span { display: block; height: 100%; border-radius: 3px; }
.projection { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; background: #fff; }
.projection.over { background: var(--rb-attention); }
.projection .grow { flex-grow: 1; display: flex; flex-direction: column; gap: 3px; }
.projection .label { font-size: 14px; color: var(--rb-muted); }
.projection.over .label { color: var(--rb-attention-ink); }
.projection .value { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.projection .diff { font-size: 15px; font-weight: 600; color: var(--rb-accent); }
.projection.over .diff { font-size: 17px; color: var(--rb-attention-strong); }
.cat-row { gap: 6px; padding: 12px 0; }
.line { display: flex; justify-content: space-between; gap: 12px; font-size: 16px; }
.cat-bar { height: 5px; border-radius: 3px; background: var(--rb-line); overflow: hidden; }
.cat-bar > span { display: block; height: 100%; border-radius: 3px; background: var(--rb-accent); }
.cat-bar.over > span { background: var(--rb-warn); }
.note { font-size: 14px; color: var(--rb-muted); }
.cat-actions { display: flex; gap: 8px; padding-top: 2px; }
.rb-wrap .link { font-size: 14px; color: var(--rb-accent); min-height: 32px; }
.plan { gap: 10px; padding: 14px 16px; }
.plan-head { display: flex; justify-content: space-between; align-items: baseline; }
.plan-total { font-size: 16px; font-weight: 600; }
.stack { display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 2px; }
.stack span { display: block; }
.legend { display: flex; justify-content: space-between; font-size: 14px; color: var(--rb-muted); }
.legend span { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; }
.rb-wrap .plan-link { display: flex; justify-content: space-between; align-items: center; min-height: 44px; border-top: 1px solid var(--rb-line); font-size: 15px; text-align: left; }
ion-modal.sheet-modal { --height: auto; --border-radius: 16px; --background: var(--rb-bg); }
.rb-sheet .save { color: var(--rb-accent); font-weight: 600; font-size: 16px; min-height: 40px; }
.sheet-list { background: #fff; border-radius: 14px; padding: 0 14px; max-height: 60vh; overflow-y: auto; }
.item { display: flex; align-items: center; gap: 12px; min-height: 48px; border-bottom: 1px solid var(--rb-line); font-size: 15px; }
.item:last-child { border-bottom: 0; }
.item .grow { flex-grow: 1; }
.item input { width: 120px; color: var(--rb-ink); }
</style>
