<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap form">
        <div class="rb-navbar">
          <button type="button" class="rb-navlink" @click="goBack">Cancelar</button>
          <span class="title">Meta de inversión</span>
          <span />
        </div>

        <div class="rb-group">
          <label class="rb-row">
            <span class="grow">Nombre</span>
            <input v-model="name" class="rb-inline-input ink" placeholder="Entrada del apartamento" aria-label="Nombre" />
          </label>
          <label class="rb-row">
            <span class="grow">Monto objetivo</span>
            <input v-model="targetText" class="rb-inline-input big" inputmode="decimal" placeholder="USD 0" aria-label="Monto objetivo en dólares" @blur="targetText = pretty(targetText)" />
          </label>
          <label class="rb-row">
            <span class="grow">Ya invertido</span>
            <input v-model="savedText" class="rb-inline-input" inputmode="decimal" placeholder="USD 0" aria-label="Ya invertido en dólares" @blur="savedText = pretty(savedText)" />
          </label>
          <button type="button" class="rb-row" @click="pickYears">
            <span class="grow">Plazo</span>
            <span class="value">{{ years === 1 ? '1 año' : `${years} años` }} · {{ byYear }}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg></span>
          </button>
        </div>

        <div class="rb-card sliders">
          <div class="slider">
            <div class="line"><label for="aporte">Aporte mensual</label><span class="rb-amount">{{ formatUsd(monthly) }}</span></div>
            <input id="aporte" v-model.number="monthly" type="range" min="0" max="500" step="10" />
          </div>
          <div class="slider">
            <div class="line"><label for="rendimiento">Rendimiento anual supuesto</label><span>{{ ratePct }}</span></div>
            <input id="rendimiento" v-model.number="rate" type="range" min="0" max="10" step="0.5" />
            <span class="hint">Lo elegís vos. No es una promesa de rendimiento.</span>
          </div>
        </div>

        <div class="result" :class="{ short: !reaches }">
          <span class="k">En {{ years === 1 ? '1 año' : `${years} años` }} llegarías a</span>
          <span class="v rb-amount">≈ {{ formatUsd(Math.round(projected)) }}</span>
          <span class="d">{{ note }}</span>
        </div>

        <span class="rb-note small">Simulación con los valores que cargás. No es asesoramiento de inversión.</span>

        <button type="button" class="rb-btn primary create" :disabled="!canCreate" @click="create">Crear meta</button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { actionSheetController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed, ref } from 'vue';
import { futureValue, monthlyNeeded } from '@/domain/investment';
import { formatUsd, parseAmount, round2 } from '@/domain/money';
import { useFinanzasStore } from '@/stores/finanzas';

const router = useIonRouter();
const finanzas = useFinanzasStore();

const name = ref('');
const targetText = ref('');
const savedText = ref('');
const years = ref(5);
/** Dólares por mes, del deslizador. */
const monthly = ref(200);
/** Porcentaje anual, del deslizador: 5 = 5 %. */
const rate = ref(5);

const thisYear = new Date().getFullYear();
const byYear = computed(() => thisYear + years.value);
const target = computed(() => parseAmount(targetText.value.replace(/usd/i, '')) || 0);
const saved = computed(() => parseAmount(savedText.value.replace(/usd/i, '')) || 0);
const ratePct = computed(() => `${String(rate.value).replace('.', ',')}%`);

const projected = computed(() => round2(futureValue({ initial: saved.value, monthly: monthly.value, years: years.value, annualRate: rate.value / 100 })));
const reaches = computed(() => !target.value || projected.value >= target.value);
const note = computed(() => {
  if (!target.value) return 'Poné el monto objetivo para ver si llegás.';
  if (reaches.value) return 'Llegás a la meta';
  const needed = monthlyNeeded({ initial: saved.value, target: target.value, years: years.value, annualRate: rate.value / 100 });
  return `Te faltarían ${formatUsd(Math.round(target.value - projected.value))} · con ${formatUsd(needed)}/mes la alcanzás`;
});
const canCreate = computed(() => !!name.value.trim() && target.value > 0);

/** "20000" → "USD 20.000" al salir del campo. */
function pretty(text: string): string {
  const n = parseAmount(text.replace(/usd/i, ''));
  return n > 0 ? formatUsd(n) : '';
}

async function pickYears() {
  const options = [1, 2, 3, 5, 10, 15, 20, 30];
  const sheet = await actionSheetController.create({
    header: 'Plazo',
    buttons: [
      ...options.map((y) => ({ text: `${y === 1 ? '1 año' : `${y} años`} · ${thisYear + y}`, handler: () => void (years.value = y) })),
      { text: 'Cancelar', role: 'cancel' },
    ],
  });
  await sheet.present();
}

async function create() {
  if (!canCreate.value) return;
  await finanzas.addInvestmentGoal(
    { name: name.value.trim(), targetUsd: target.value, savedUsd: saved.value, byYear: byYear.value, monthlyUsd: monthly.value },
    { monthlyUsd: monthly.value, years: years.value, annualRate: rate.value / 100 },
  );
  goBack();
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/tabs/metas/inversion', 'back', 'replace');
}
</script>

<style scoped>
.form { min-height: 100%; box-sizing: border-box; gap: 14px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); }
.rb-inline-input { color: var(--rb-muted); }
.rb-inline-input.ink { color: var(--rb-ink); flex: 1; min-width: 0; }
.rb-inline-input.big { font-size: 18px; font-weight: 600; color: var(--rb-ink); }
.sliders { gap: 14px; }
.slider { display: flex; flex-direction: column; gap: 6px; }
.slider .line { display: flex; justify-content: space-between; font-size: 16px; }
.slider .line span { font-weight: 600; }
.slider input { width: 100%; height: 32px; accent-color: var(--rb-accent); }
.hint { font-size: 13px; color: var(--rb-muted); }
.result { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 14px; background: #eaf6f0; }
.result.short { background: var(--rb-attention); }
.result .k { font-size: 14px; color: var(--rb-ink-3); }
.result .v { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
.result .d { font-size: 14px; color: var(--rb-accent-dark); }
.result.short .d { color: var(--rb-attention-strong); }
.small { font-size: 13px; }
.create { margin-top: auto; min-height: 54px; font-size: 16px; }
</style>
