<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap meta">
        <div class="rb-navbar">
          <button type="button" class="rb-navlink" @click="goBack">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Metas
          </button>
          <span class="title">{{ goal?.name }}</span>
          <button v-if="goal" type="button" class="rb-navlink end" @click="edit">Editar</button>
        </div>

        <template v-if="goal && progress">
          <div class="hero">
            <span class="rb-big">{{ fmt(progress.saved) }}</span>
            <span class="rb-small" style="font-size: 14px">de {{ fmt(goal.target) }} · {{ Math.round(progress.share * 100) }}%</span>
            <div class="rb-progress" style="width: 100%; margin-top: 6px"><span :style="{ width: `${progress.share * 100}%` }" /></div>
          </div>

          <div v-if="coverage" class="rb-card">
            <span style="font-weight: 600">Cubre {{ coverage.monthsCovered.toString().replace('.', ',') }} {{ coverage.monthsCovered === 1 ? 'mes' : 'meses' }} de tus gastos fijos</span>
            <span class="rb-small">Meta: {{ coverage.months }} meses ({{ formatPesos(coverage.monthlyFixed) }} c/u)</span>
            <div class="cov"><div class="rb-progress ink" style="flex-grow: 1"><span :style="{ width: `${Math.min(100, (coverage.monthsCovered / coverage.months) * 100)}%` }" /></div><span class="rb-small">{{ coverage.monthsCovered.toString().replace('.', ',') }} / {{ coverage.months }}</span></div>
          </div>

          <div class="rb-group">
            <div class="rb-row"><span class="grow">Aporte mensual</span><span class="value">{{ fmt(goal.monthly) }}</span></div>
            <div class="rb-row"><span class="grow">Lo completás en</span><span class="value">{{ progress.remaining === 0 ? 'Ya está' : progress.etaMonth ? monthLabel(progress.etaMonth) : 'Definí un aporte mensual' }}</span></div>
            <div v-if="goal.where" class="rb-row"><span class="grow">Dónde está</span><span class="value">{{ goal.where }}</span></div>
          </div>

          <div class="rb-section">
            <span class="rb-label">Movimientos</span>
            <div class="rb-group">
              <div v-for="(m, i) in movements" :key="i" class="rb-row">
                <span class="grow"><span>{{ m.note ?? (m.amount > 0 ? 'Aporte' : 'Retiro') }}</span><span class="sub">{{ longDate(m.date).replace(/ de \d{4}$/, '') }}</span></span>
                <span class="rb-amount" style="font-weight: 500" :class="{ 'rb-good': m.amount > 0 }">{{ fmt(m.amount, true) }}</span>
              </div>
              <div v-if="!movements.length" class="rb-row rb-muted">Todavía no hay movimientos.</div>
            </div>
          </div>

          <div class="actions">
            <button type="button" class="rb-btn" @click="move(-1)">Retirar</button>
            <button type="button" class="rb-btn primary" @click="move(1)">Aportar</button>
          </div>
        </template>
        <div v-else class="rb-empty"><span class="t">No encontramos esa meta</span></div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed } from 'vue';
import { longDate, monthLabel, todayIso } from '@/domain/dates';
import { emergencyCoverage, goalProgress } from '@/domain/goals';
import { formatPesos, formatUsd, parseAmount } from '@/domain/money';
import { useFinanzasStore } from '@/stores/finanzas';

const props = defineProps<{ id: string }>();
const router = useIonRouter();
const finanzas = useFinanzasStore();

const goal = computed(() => finanzas.goals.find((g) => g.id === props.id));
const progress = computed(() => (goal.value ? goalProgress(goal.value, todayIso()) : undefined));
const coverage = computed(() => (goal.value ? emergencyCoverage(goal.value) : undefined));
const movements = computed(() => [...(goal.value?.movements ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)));
const fmt = (n: number, sign = false) => (goal.value?.currency === 'USD' ? formatUsd(n, { sign }) : formatPesos(n, { sign }));

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/tabs/metas', 'back', 'replace');
}

async function move(direction: 1 | -1) {
  const g = goal.value;
  if (!g) return;
  const alert = await alertController.create({
    header: direction > 0 ? 'Aportar' : 'Retirar',
    inputs: [
      { name: 'amount', type: 'text', placeholder: 'Monto', value: direction > 0 && g.monthly ? String(g.monthly) : '', attributes: { inputmode: 'decimal' } },
      { name: 'note', type: 'text', placeholder: direction > 0 ? 'Nota (opcional)' : 'Para qué (opcional)' },
    ],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { amount: string; note: string } }>();
  const n = parseAmount(data?.values.amount ?? '');
  if (role !== 'confirm' || !(n > 0)) return;
  const note = data?.values.note.trim();
  await finanzas.addMovement(g.id, {
    date: todayIso(),
    amount: direction * n,
    note: direction > 0 ? note || 'Aporte' : `Retiro${note ? ` · ${note}` : ''}`,
  });
}

async function edit() {
  const g = goal.value;
  if (!g) return;
  const alert = await alertController.create({
    header: g.name,
    inputs: [
      { name: 'target', type: 'text', placeholder: 'Meta', value: String(g.target), attributes: { inputmode: 'decimal' } },
      { name: 'monthly', type: 'text', placeholder: 'Aporte mensual', value: String(g.monthly), attributes: { inputmode: 'decimal' } },
      { name: 'where', type: 'text', placeholder: 'Dónde está la plata', value: g.where ?? '' },
    ],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { target: string; monthly: string; where: string } }>();
  if (role !== 'confirm' || !data) return;
  const target = parseAmount(data.values.target);
  const monthly = parseAmount(data.values.monthly);
  await finanzas.updateGoal(g.id, {
    target: target > 0 ? target : g.target,
    monthly: monthly >= 0 ? monthly : g.monthly,
    where: data.values.where.trim() || undefined,
  });
}
</script>

<style scoped>
.meta { min-height: 100%; box-sizing: border-box; }
.hero { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; text-align: center; }
.cov { display: flex; align-items: center; gap: 10px; }
.actions { margin-top: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
</style>
