<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap">
        <div class="rb-navbar">
          <button type="button" class="rb-navlink" @click="goBack">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Metas
          </button>
          <span class="title">Inversión</span>
          <button type="button" class="rb-navlink end plus" aria-label="Nueva meta de inversión" @click="router.push('/tabs/metas/inversion/nueva')">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        <div class="hero">
          <span class="rb-small" style="font-size: 14px">Valor actual</span>
          <span class="rb-big">{{ formatUsd(value.value) }}</span>
          <span class="rb-small">Aportado {{ formatUsd(value.contributed) }} · <span :class="value.gain >= 0 ? 'rb-good' : 'rb-warn'">{{ formatUsd(value.gain, { sign: true }) }} ({{ pct(value.gainShare) }})</span></span>
        </div>

        <div class="rb-section">
          <span class="rb-label">Metas</span>
          <div class="rb-group">
            <div v-for="g in p.goals" :key="g.id" class="rb-stack">
              <div class="line"><span>{{ g.name }}</span><span v-if="g.targetUsd" style="font-weight: 500">{{ Math.round((g.savedUsd / g.targetUsd) * 100) }}%</span><span v-else class="rb-small">Largo plazo</span></div>
              <div v-if="g.targetUsd" class="rb-progress"><span :style="{ width: `${Math.min(100, (g.savedUsd / g.targetUsd) * 100)}%` }" /></div>
              <span class="rb-small" style="font-size: 13px">{{ g.targetUsd ? `${formatUsd(g.savedUsd)} de ${formatUsd(g.targetUsd)}${g.byYear ? ` · para ${g.byYear}` : ''}` : `${formatUsd(g.savedUsd)}${g.monthlyUsd ? ` · aporte ${formatUsd(g.monthlyUsd)} por mes` : ''}` }}</span>
            </div>
          </div>
        </div>

        <div v-if="simGoal" class="rb-section">
          <span class="rb-label">Simulación · {{ simGoal.name.toLowerCase() }}</span>
          <div class="rb-card">
            <span class="sim">Aportando <strong>{{ formatUsd(p.simulation.monthlyUsd) }} por mes</strong> durante <strong>{{ p.simulation.years }} {{ p.simulation.years === 1 ? 'año' : 'años' }}</strong>, con un <strong>{{ pct(p.simulation.annualRate) }} anual</strong>, llegarías a</span>
            <span class="rb-mid">≈ {{ formatUsd(roundHundreds(sim.projected)) }}</span>
            <span class="rb-small">{{ sim.shortfall > 0 ? `Te faltarían unos ${formatUsd(roundHundreds(sim.shortfall))} para la meta` : 'Con esos supuestos llegás a la meta' }}</span>
            <button type="button" class="link" @click="changeAssumptions">Cambiar supuestos</button>
          </div>
        </div>

        <div class="rb-section">
          <span class="rb-label">Dónde lo tenés</span>
          <div class="rb-group">
            <button v-for="h in p.holdings" :key="h.id" type="button" class="rb-row" @click="updateHolding(h.id, h.name, h.valueUsd)">
              <span class="grow">{{ h.name }}</span><span class="rb-amount" style="font-weight: 500">{{ formatUsd(h.valueUsd) }}</span>
            </button>
          </div>
        </div>
        <span class="rb-note">Valores que registrás vos. La simulación usa el rendimiento que elijas y no es una recomendación de inversión.</span>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed } from 'vue';
import { portfolioValue, simulateGoal } from '@/domain/investment';
import { formatUsd, parseAmount } from '@/domain/money';
import { useFinanzasStore } from '@/stores/finanzas';

const router = useIonRouter();
const finanzas = useFinanzasStore();

const p = computed(() => finanzas.portfolio);
const value = computed(() => portfolioValue(p.value));
const simGoal = computed(() => p.value.goals.find((g) => g.id === p.value.simulation.goalId));
const sim = computed(() => (simGoal.value ? simulateGoal(simGoal.value, p.value.simulation) : { projected: 0, shortfall: 0 }));
const pct = (x: number) => `${(Math.round(x * 1000) / 10).toString().replace('.', ',')}%`;
const roundHundreds = (n: number) => Math.round(n / 100) * 100;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/tabs/metas', 'back', 'replace');
}

async function changeAssumptions() {
  const s = p.value.simulation;
  const alert = await alertController.create({
    header: 'Supuestos',
    message: 'Usá el rendimiento que te parezca razonable; no es una recomendación.',
    inputs: [
      { name: 'monthly', type: 'text', placeholder: 'USD por mes', value: String(s.monthlyUsd), attributes: { inputmode: 'decimal' } },
      { name: 'years', type: 'text', placeholder: 'Años', value: String(s.years), attributes: { inputmode: 'numeric' } },
      { name: 'rate', type: 'text', placeholder: '% anual', value: String(s.annualRate * 100).replace('.', ','), attributes: { inputmode: 'decimal' } },
    ],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Simular', role: 'confirm' }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { monthly: string; years: string; rate: string } }>();
  if (role !== 'confirm' || !data) return;
  const monthly = parseAmount(data.values.monthly);
  const years = parseAmount(data.values.years);
  const rate = parseAmount(data.values.rate);
  await finanzas.setSimulation({
    monthlyUsd: monthly >= 0 ? monthly : s.monthlyUsd,
    years: years > 0 ? years : s.years,
    annualRate: rate >= 0 ? rate / 100 : s.annualRate,
  });
}

async function updateHolding(id: string, name: string, current: number) {
  const alert = await alertController.create({
    header: name,
    message: '¿Cuánto vale hoy?',
    inputs: [{ name: 'value', type: 'text', value: String(current), attributes: { inputmode: 'decimal' } }],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { value: string } }>();
  const n = parseAmount(data?.values.value ?? '');
  if (role === 'confirm' && n >= 0) await finanzas.setHoldingValue(id, n);
}
</script>

<style scoped>
.hero { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; text-align: center; }
.line { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 15px; }
.sim { font-size: 15px; line-height: 1.5; }
.sim strong { font-weight: 600; }
.rb-wrap .link { align-self: flex-start; font-size: 15px; color: var(--rb-accent); min-height: 36px; }
</style>
